import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { resolvePromptTemplate } from "../prompt-templates.js";
import {
  executeProcess,
  ProcessExecutionError,
} from "../process-executor.js";
import {
  EVAL_CATEGORIES,
  type BenchmarkMetrics,
  type McpTelemetry,
  type ModelRunConfig,
  type RunConfig,
  type RunOutput,
  type ToolCallRecord,
} from "../types.js";
import type { BenchmarkRunner, RunnerContext } from "./types.js";
import {
  CODEX_CLI_VERSION,
  codexExecutable,
  codexPermissionConfig,
  createCodexEnvironment,
} from "./codex-config.js";
import { probeCodexContainment } from "./codex-containment.js";
import {
  codexFindingsSchema,
  structuredFindingsToFinalText,
} from "./codex-schema.js";
import { buildCodexMcpConfiguration } from "./codex-mcp.js";
import { buildLandlockInvocation } from "../sandbox/landlock.js";

const STRUCTURED_OUTPUT_INSTRUCTION = `For this Codex benchmark run, your final response must be a JSON object with one property named "findings". The value must be the complete findings array described by the benchmark instructions. Do not wrap the final JSON in Markdown.`;

export const codexCliRunner: BenchmarkRunner = {
  id: "codex-cli",
  version: CODEX_CLI_VERSION,
  kind: "model",
  capabilities: {
    findVulns: true,
    fixVulns: true,
    mcp: true,
  },
  supports(config: RunConfig): boolean {
    return config.type !== "command"
      && config.type !== "deepsec"
      && config.runner === "codex-cli";
  },
  describe(config: RunConfig): string {
    const modelConfig = config as ModelRunConfig;
    return `${modelConfig.model} via Codex CLI (reasoning: ${modelConfig.effort ?? "high"})`;
  },
  run(context: RunnerContext): Promise<RunOutput> {
    return runCodexTask(context);
  },
};

export async function runCodexTask({
  task,
  config,
  cwd,
  workspace,
}: RunnerContext): Promise<RunOutput> {
  const modelConfig = config as ModelRunConfig;
  const sessionStart = Date.now();
  const isFix = task.category.id === EVAL_CATEGORIES.FIX_VULNS.id;
  const workspaceAccess = isFix ? "write" : "read";
  let mcpConfiguration;
  try {
    mcpConfiguration = buildCodexMcpConfiguration(
      modelConfig.mcpServers,
      cwd,
    );
  } catch (error) {
    const collector = new CodexEventCollector();
    return {
      finalText: "",
      metrics: collector.metrics(sessionStart),
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const collector = new CodexEventCollector(mcpConfiguration.serverNames);

  const containment = await probeCodexContainment(workspace, workspaceAccess);
  if (!containment.ok) {
    return {
      finalText: "",
      metrics: collector.metrics(sessionStart),
      error: `Codex containment unavailable: ${containment.detail}`,
    };
  }

  const finalOutputPath = join(workspace.outputDir, "codex-final.json");
  const args = [
    "exec",
    "--cd", cwd,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--json",
    "--color", "never",
    "--model", modelConfig.model,
    "--output-last-message", finalOutputPath,
    ...codexPermissionConfig(workspaceAccess),
    ...mcpConfiguration.configArgs,
    "-c", `model_reasoning_effort=${JSON.stringify(modelConfig.effort ?? "high")}`,
    "-c", `developer_instructions=${JSON.stringify(buildDeveloperInstructions(task.systemPrompt, !isFix))}`,
  ];

  if (!isFix) {
    const schemaPath = join(workspace.outputDir, "codex-findings.schema.json");
    writeFileSync(
      schemaPath,
      `${JSON.stringify(codexFindingsSchema(task.groundTruth), null, 2)}\n`,
      { mode: 0o600 },
    );
    args.push("--output-schema", schemaPath);
  }
  args.push("-");

  const prompt = resolvePromptTemplate(
    task.prompt,
    modelConfig.promptTemplateId,
  );

  try {
    const codexEnvironment = createCodexEnvironment(
      workspace,
      process.env,
      mcpConfiguration.environmentNames,
    );
    const invocation = await buildLandlockInvocation(
      workspace,
      workspaceAccess,
      codexExecutable(),
      args,
      codexEnvironment,
    );
    const result = await executeProcess({
      program: invocation.program,
      args: invocation.args,
      cwd,
      env: invocation.environment,
      stdin: prompt,
      timeoutMs: modelConfig.timeoutMs ?? 30 * 60_000,
      maxOutputBytes: 50 * 1024 * 1024,
      onStdoutChunk: (chunk, receivedAt) => collector.feed(chunk, receivedAt),
    });
    collector.finish(Date.now());

    if (result.exitCode !== 0) {
      return {
        finalText: collector.finalMessage,
        metrics: collector.metrics(sessionStart),
        error: result.stderr.trim()
          || collector.terminalError
          || `Codex exited with code ${result.exitCode}`,
      };
    }

    const rawFinal = existsSync(finalOutputPath)
      ? readFileSync(finalOutputPath, "utf8").trim()
      : collector.finalMessage.trim();
    if (!rawFinal) {
      return {
        finalText: "",
        metrics: collector.metrics(sessionStart),
        error: collector.terminalError || "Codex completed without a final response",
      };
    }

    const finalText = isFix
      ? rawFinal
      : structuredFindingsToFinalText(rawFinal);
    return {
      finalText,
      metrics: collector.metrics(sessionStart),
    };
  } catch (error) {
    collector.finish(Date.now());
    const message = error instanceof ProcessExecutionError
      ? `${error.message}${error.stderr.trim() ? `: ${error.stderr.trim()}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      finalText: collector.finalMessage,
      metrics: collector.metrics(sessionStart),
      error: message,
    };
  }
}

function buildDeveloperInstructions(
  systemPrompt: string | undefined,
  structured: boolean,
): string {
  return [
    systemPrompt ?? "",
    structured ? STRUCTURED_OUTPUT_INSTRUCTION : "",
  ].filter(Boolean).join("\n\n");
}

interface TimedItem {
  startedAt: number;
  item: Record<string, unknown>;
}

export class CodexEventCollector {
  private buffer = "";
  private readonly runningItems = new Map<string, TimedItem>();
  private readonly toolCalls: ToolCallRecord[] = [];
  private readonly filesScanned = new Set<string>();
  private readonly mcpToolStats: McpTelemetry["toolStats"] = {};
  private readonly mcpServerStatuses = new Map<string, string>();
  private usage = {
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };
  private turns = 0;
  private threadId: string | undefined;
  finalMessage = "";
  terminalError = "";

  constructor(private readonly configuredMcpServers: string[] = []) {}

  feed(chunk: string, receivedAt: number): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.consume(line, receivedAt);
      newline = this.buffer.indexOf("\n");
    }
  }

  finish(receivedAt: number): void {
    const line = this.buffer.trim();
    this.buffer = "";
    if (line) this.consume(line, receivedAt);
  }

  metrics(sessionStart: number): BenchmarkMetrics {
    const toolStats: BenchmarkMetrics["toolStats"] = {};
    for (const call of this.toolCalls) {
      const stats = toolStats[call.tool] ?? {
        count: 0,
        totalDurationMs: 0,
        totalInputTokensEst: 0,
        totalOutputTokensEst: 0,
      };
      stats.count++;
      stats.totalDurationMs += call.durationMs;
      stats.totalInputTokensEst += call.inputTokensEst;
      stats.totalOutputTokensEst += call.outputTokensEst;
      toolStats[call.tool] = stats;
    }
    const mcp: McpTelemetry = {
      configuredServers: this.configuredMcpServers,
      serverStatuses: [...this.mcpServerStatuses]
        .map(([name, status]) => ({ name, status })),
      advertisedToolCount: 0,
      toolStats: this.mcpToolStats,
    };
    return {
      sessionDurationMs: Date.now() - sessionStart,
      totalInputTokens: this.usage.input_tokens,
      totalOutputTokens: this.usage.output_tokens,
      totalReasoningOutputTokens: this.usage.reasoning_output_tokens,
      totalCacheReadTokens: this.usage.cached_input_tokens,
      totalCacheCreationTokens: this.usage.cache_write_input_tokens,
      totalLogicalInputTokens:
        this.usage.input_tokens
        + this.usage.cached_input_tokens
        + this.usage.cache_write_input_tokens,
      totalCostUsd: null,
      totalTurns: this.turns,
      toolCalls: this.toolCalls,
      toolStats,
      filesScanned: [...this.filesScanned],
      mcp,
      runner: {
        id: "codex-cli",
        version: CODEX_CLI_VERSION,
        ...(this.threadId && { sessionId: this.threadId }),
        tokenSource: this.turns > 0 ? "reported" : "unavailable",
        toolSource: "reported",
      },
    };
  }

  private consume(line: string, receivedAt: number): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = event.type;
    if (type === "thread.started" && typeof event.thread_id === "string") {
      this.threadId = event.thread_id;
      return;
    }
    if (type === "turn.completed") {
      this.turns++;
      const usage = asRecord(event.usage);
      this.usage = {
        input_tokens: numberValue(usage.input_tokens),
        cached_input_tokens: numberValue(usage.cached_input_tokens),
        cache_write_input_tokens: numberValue(usage.cache_write_input_tokens),
        output_tokens: numberValue(usage.output_tokens),
        reasoning_output_tokens: numberValue(usage.reasoning_output_tokens),
      };
      return;
    }
    if (type === "turn.failed" || type === "error") {
      const error = asRecord(event.error);
      this.terminalError = String(error.message ?? event.message ?? type);
      return;
    }

    const item = asRecord(event.item);
    const itemId = typeof item.id === "string" ? item.id : undefined;
    if (type === "item.started" && itemId) {
      this.runningItems.set(itemId, { startedAt: receivedAt, item });
      return;
    }
    if (type !== "item.completed" && type !== "item.updated") return;

    if (item.type === "agent_message" && typeof item.text === "string") {
      this.finalMessage = item.text;
    }
    if (type !== "item.completed") return;

    if (item.type === "file_change") {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      for (const change of changes) {
        const path = asRecord(change).path;
        if (typeof path === "string") this.filesScanned.add(path);
      }
    }
    if (
      item.type === "command_execution"
      || item.type === "file_change"
      || item.type === "mcp_tool_call"
    ) {
      const started = itemId ? this.runningItems.get(itemId) : undefined;
      const server = typeof item.server === "string" ? item.server : "unknown";
      const mcpTool = typeof item.tool === "string" ? item.tool : "unknown";
      const tool = item.type === "command_execution"
        ? "Command"
        : item.type === "file_change"
          ? "FileChange"
          : `mcp__${server}__${mcpTool}`;
      const durationMs = started
        ? Math.max(0, receivedAt - started.startedAt)
        : 0;
      this.toolCalls.push({
        tool,
        durationMs,
        inputTokensEst: estimateTokens(
          item.command ?? item.changes ?? item.arguments ?? started?.item,
        ),
        outputTokensEst: estimateTokens(
          item.aggregated_output ?? item.result ?? item.error,
        ),
      });
      if (item.type === "mcp_tool_call") {
        const stats = this.mcpToolStats[tool] ?? {
          count: 0,
          totalDurationMs: 0,
        };
        stats.count++;
        stats.totalDurationMs += durationMs;
        this.mcpToolStats[tool] = stats;
        this.mcpServerStatuses.set(
          server,
          item.status === "failed" ? "failed" : "connected",
        );
      }
      if (itemId) this.runningItems.delete(itemId);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function estimateTokens(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}
