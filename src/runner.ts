import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  extractFindingsEnvelope,
  findingsOutputSchema,
  serializeFindingsToFinalText,
} from "./findings-output.js";
import { resolvePromptTemplate } from "./prompt-templates.js";
import type {
  EvalTask,
  FindingRecord,
  McpTelemetry,
  ModelRunConfig,
  RunOutput,
  BenchmarkMetrics,
  ToolCallRecord,
} from "./types.js";

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const AGENT_TRACE_DIR_ENV = "VULNBENCH_AGENT_TRACE_DIR";

type TraceWriter = (event: Record<string, unknown>) => void;

interface SdkUsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/**
 * The SDK's top-level result usage covers only the main conversation, while
 * modelUsage includes the main model and any subagents grouped by model.
 */
export function aggregateSdkModelUsage(modelUsage: unknown): SdkUsageTotals | null {
  if (!modelUsage || typeof modelUsage !== "object") return null;

  const totals: SdkUsageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let foundUsage = false;

  for (const usage of Object.values(modelUsage)) {
    if (!usage || typeof usage !== "object") continue;
    const record = usage as Record<string, unknown>;
    const fields = {
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      cache_read_input_tokens: record.cacheReadInputTokens,
      cache_creation_input_tokens: record.cacheCreationInputTokens,
    };
    for (const [target, value] of Object.entries(fields)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      totals[target as keyof SdkUsageTotals] += value;
      foundUsage = true;
    }
  }

  return foundUsage ? totals : null;
}

export function assertRequiredToolPolicy(
  config: ModelRunConfig,
  telemetry: McpTelemetry,
): void {
  if (config.requiredToolPolicyId !== "snyk-code-once") return;
  const count = telemetry.toolStats.mcp__Snyk__snyk_code_scan?.count ?? 0;
  if (count !== 1) {
    throw new Error(
      `Required Snyk Code MCP invocation count was ${count}; expected exactly 1`,
    );
  }
}

function traceSafeValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => {
    if (/^(?:.*[_-])?(?:token|secret|password|authorization|api[_-]?key)$/i.test(key)) {
      return "[REDACTED]";
    }
    if (typeof nestedValue === "string" && nestedValue.length > 50_000) {
      return `${nestedValue.slice(0, 50_000)}\n[TRUNCATED]`;
    }
    if (typeof nestedValue === "bigint") return nestedValue.toString();
    if (nestedValue && typeof nestedValue === "object") {
      if (seen.has(nestedValue)) return "[CIRCULAR]";
      seen.add(nestedValue);
    }
    return nestedValue;
  }));
}

function traceSafeMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return traceSafeValue(message);
  const copy = structuredClone(message as object) as any;
  const content = copy.message?.content;
  if (Array.isArray(content)) {
    copy.message.content = content.map((block: any) =>
      block?.type === "thinking"
        ? { type: "thinking", omitted: true }
        : block
    );
  }
  return traceSafeValue(copy);
}

function createTraceWriter(
  task: EvalTask,
  config: ModelRunConfig,
): { path: string; write: TraceWriter } | null {
  const outputDir = process.env[AGENT_TRACE_DIR_ENV];
  if (!outputDir) return null;

  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(
    outputDir,
    `${task.id}__${config.id}__${timestamp}__${randomUUID().slice(0, 8)}.jsonl`,
  );
  const write: TraceWriter = (event) => {
    appendFileSync(path, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...traceSafeValue(event) as Record<string, unknown>,
    })}\n`, { mode: 0o600 });
  };
  return { path, write };
}

function resolveMcpServers(
  mcpServers: ModelRunConfig["mcpServers"],
  environment: NodeJS.ProcessEnv,
): ModelRunConfig["mcpServers"] {
  if (!mcpServers) return undefined;

  return Object.fromEntries(
    Object.entries(mcpServers).map(([serverName, server]) => {
      if (!server.env) return [serverName, server];

      const env = Object.fromEntries(
        Object.entries(server.env).map(([key, value]) => [
          key,
          value.replace(ENV_REFERENCE, (_match, variable: string) => {
            const resolved = environment[variable];
            if (resolved === undefined) {
              throw new Error(
                `MCP server "${serverName}" requires environment variable "${variable}", but it is not set`,
              );
            }
            return resolved;
          }),
        ]),
      );

      return [serverName, { ...server, env }];
    }),
  );
}

/**
 * Runs an eval task using the Claude Agent SDK and collects benchmark metrics.
 * Returns the agent's final text output and accumulated metrics.
 */
export async function runTask(
  task: EvalTask,
  config: ModelRunConfig,
  cwd: string,
): Promise<RunOutput> {
  const toolCalls: ToolCallRecord[] = [];
  const toolStartTimes = new Map<string, number>();
  const filesScannedSet = new Set<string>();
  const mcpTelemetry: McpTelemetry = {
    configuredServers: Object.keys(config.mcpServers ?? {}),
    serverStatuses: [],
    advertisedToolCount: 0,
    toolStats: {},
  };
  // Manual per-turn accumulation (fallback when SDKResultMessage.usage is unavailable)
  let accInputTokens = 0;
  let accOutputTokens = 0;
  let accCacheReadTokens = 0;
  let accCacheCreationTokens = 0;
  let accTurns = 0;
  // Authoritative session totals from SDKResultMessage (preferred when available)
  let resultUsage: SdkUsageTotals | null = null;
  let resultCostUsd: number | null = null;
  let resultNumTurns: number | null = null;
  let finalText = "";
  let findings: FindingRecord[] | undefined;
  let trace: { path: string; write: TraceWriter } | null = null;

  // PreToolUse hook: record start time
  const preToolHook: HookCallback = async (input) => {
    const id = (input as any).tool_use_id ?? String(Date.now());
    toolStartTimes.set(id, Date.now());
    trace?.write({
      type: "tool_use",
      toolUseId: id,
      tool: (input as any).tool_name ?? "unknown",
      input: (input as any).tool_input,
    });
    return {};
  };

  // PostToolUse hook: record completed tool call with estimated token costs.
  // Per-tool token counts are estimated (JSON-serialised length / 4) because the
  // Anthropic API only reports tokens at the per-turn level, not per tool call.
  // These estimates are directionally correct and require no extra API calls.
  const postToolHook: HookCallback = async (input) => {
    const id = (input as any).tool_use_id ?? "";
    const tool = (input as any).tool_name ?? "unknown";
    const startTime = toolStartTimes.get(id) ?? Date.now();
    const inputTokensEst = estimateTokens((input as any).tool_input);
    const output = (input as any).tool_response ?? (input as any).tool_result;
    const outputTokensEst = estimateTokens(output);
    const durationMs = Date.now() - startTime;
    toolCalls.push({ tool, durationMs, inputTokensEst, outputTokensEst });
    if (tool.startsWith("mcp__")) {
      const stats = mcpTelemetry.toolStats[tool] ?? { count: 0, totalDurationMs: 0 };
      stats.count++;
      stats.totalDurationMs += durationMs;
      mcpTelemetry.toolStats[tool] = stats;
    }
    // Track unique files touched by filesystem tools
    if (tool === "Read" || tool === "Write" || tool === "Edit") {
      const filePath = (input as any).tool_input?.file_path;
      if (filePath) filesScannedSet.add(filePath);
    }
    toolStartTimes.delete(id);
    trace?.write({
      type: "tool_result",
      toolUseId: id,
      tool,
      durationMs,
      input: (input as any).tool_input,
      output,
    });
    return {};
  };

  const sessionStart = Date.now();
  // Tracks the last-seen usage fingerprint per session level (keyed by parent_tool_use_id).
  // The SDK emits one SDKAssistantMessage per content block in an API response, so a single
  // API call that returns [thinking, tool_use] fires two messages with identical usage.
  // Sub-agent sessions (parent_tool_use_id != null) stream their messages through the same
  // iterator. We deduplicate by only accumulating when usage changes for a given session.
  const lastUsagePerSession = new Map<string | null, string>();

  try {
    if (config.effort === "minimal") {
      throw new Error(
        `Claude Code runner does not support effort "${config.effort}"`,
      );
    }
    const effort = config.effort === "default"
      ? undefined
      : config.effort ?? "high";
    const thinking = config.thinking ?? { type: "adaptive" as const };
    const benchmarkEnv = process.env;
    const mcpServers = resolveMcpServers(config.mcpServers, benchmarkEnv);
    const prompt = resolvePromptTemplate(
      task.prompt,
      config.promptTemplateId,
      config.requiredToolPolicyId,
    );
    const requiresStructuredFindings =
      config.promptTemplateId === "security-review"
      && task.category.id !== "fix-vulns";
    trace = createTraceWriter(task, config);
    trace?.write({
      type: "trace_start",
      taskId: task.id,
      runConfigId: config.id,
      model: config.model,
      effort: effort ?? "default",
      promptTemplateId: config.promptTemplateId ?? "default",
      resolvedUserPrompt: prompt,
      systemPrompt: task.systemPrompt,
      cwd,
    });
    if (trace) console.log(`    Agent trace :  ${trace.path}`);
    const activeTrace = trace;

    for await (const message of query({
      prompt,
      options: {
        cwd,
        model: config.model,
        env: benchmarkEnv,
        maxTurns: task.maxTurns ?? config.maxTurns ?? 30,
        ...(effort && { effort }),
        thinking,
        allowedTools: [
          "Read", "Glob", "Grep", "Bash", "Write", "Edit",
          ...Object.keys(mcpServers ?? {}).map((name) => `mcp__${name}__*`),
        ],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        sandbox: {
          filesystem: {
            allowWrite: [cwd],
            denyRead: [dirname(cwd)],
          },
        },
        mcpServers,
        // Benchmark a config's declared tool set only; user/project connectors
        // would otherwise leak unrelated MCP tools into the agent context.
        strictMcpConfig: true,
        systemPrompt: task.systemPrompt,
        ...(requiresStructuredFindings && {
          outputFormat: {
            type: "json_schema" as const,
            schema: findingsOutputSchema(task.groundTruth),
          },
        }),
        ...(activeTrace && {
          debug: true,
          stderr: (data: string) => activeTrace.write({
            type: "sdk_stderr",
            data,
          }),
        }),
        hooks: {
          PreToolUse: [{ matcher: ".*", hooks: [preToolHook] }],
          PostToolUse: [{ matcher: ".*", hooks: [postToolHook] }],
        },
      },
    })) {
      trace?.write({
        type: "sdk_message",
        message: traceSafeMessage(message),
      });
      // Accumulate per-turn usage from assistant messages.
      // The SDK emits one SDKAssistantMessage per content block in an API response, and also
      // streams sub-agent messages through the same iterator (parent_tool_use_id != null).
      // Deduplication: only accumulate when usage changes for a given session level.
      if (message.type === "assistant") {
        const usage = (message as any).message?.usage;
        if (usage) {
          const sessionKey: string | null = (message as any).parent_tool_use_id ?? null;
          const usageKey = `${usage.input_tokens}:${usage.output_tokens}:${usage.cache_read_input_tokens}:${usage.cache_creation_input_tokens}`;
          if (lastUsagePerSession.get(sessionKey) !== usageKey) {
            lastUsagePerSession.set(sessionKey, usageKey);
            accTurns++;
            accInputTokens += usage.input_tokens ?? 0;
            accOutputTokens += usage.output_tokens ?? 0;
            accCacheReadTokens += usage.cache_read_input_tokens ?? 0;
            accCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
          }
        }
        // Capture the last text block as the final output
        const content = (message as any).message?.content ?? [];
        for (const block of content) {
          if (block.type === "text") finalText = block.text;
        }
      }

      if (message.type === "system" && (message as any).subtype === "init") {
        const init = message as any;
        trace?.write({
          type: "sdk_init_summary",
          sessionId: init.session_id,
          model: init.model,
          slashCommands: init.slash_commands,
          skills: init.skills,
          tools: init.tools,
          securityReviewAvailable: Array.isArray(init.slash_commands)
            && init.slash_commands.includes("security-review"),
        });
        if (
          config.promptTemplateId === "security-review"
          && (
            !Array.isArray(init.slash_commands)
            || !init.slash_commands.includes("security-review")
          )
        ) {
          throw new Error(
            'Claude Code did not advertise the required "/security-review" command',
          );
        }
        const configuredServers = new Set(mcpTelemetry.configuredServers);
        mcpTelemetry.serverStatuses = Array.isArray(init.mcp_servers)
          ? init.mcp_servers
            .filter((server: unknown): server is { name: string; status: string } =>
              typeof server === "object"
              && server !== null
              && typeof (server as { name?: unknown }).name === "string"
              && typeof (server as { status?: unknown }).status === "string"
            )
            .filter((server: { name: string; status: string }) => configuredServers.has(server.name))
            .map((server: { name: string; status: string }) => ({ name: server.name, status: server.status }))
          : [];
        mcpTelemetry.advertisedToolCount = Array.isArray(init.tools)
          ? init.tools.filter((tool: unknown): tool is string =>
            typeof tool === "string"
            && mcpTelemetry.configuredServers.some((server) => tool.startsWith(`mcp__${server}__`))
          ).length
          : 0;
      }

      if ("result" in message) {
        const result = message as any;
        if (result.result) finalText = result.result;
        if (
          requiresStructuredFindings
          && result.structured_output !== undefined
        ) {
          findings = extractFindingsEnvelope(
            result.structured_output,
            task.groundTruth,
          );
        }
        // modelUsage includes subagents; top-level usage covers only the main
        // conversation. Prefer the former whenever the SDK reports it.
        const allModelUsage = aggregateSdkModelUsage(result.modelUsage);
        if (allModelUsage) {
          resultUsage = allModelUsage;
        } else if (result.usage) {
          resultUsage = {
            input_tokens: result.usage.input_tokens ?? 0,
            output_tokens: result.usage.output_tokens ?? 0,
            cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
          };
        }
        resultCostUsd = typeof result.total_cost_usd === "number"
          ? result.total_cost_usd
          : null;
        resultNumTurns = typeof result.num_turns === "number"
          ? result.num_turns
          : null;
      }
    }
    if (requiresStructuredFindings && !findings) {
      throw new Error(
        'Claude Code completed "/security-review" without structured findings',
      );
    }
    assertRequiredToolPolicy(config, mcpTelemetry);
    if (findings && !finalText) {
      finalText = serializeFindingsToFinalText(findings);
    }
    trace?.write({ type: "trace_end", status: "success", finalText });
  } catch (err) {
    trace?.write({ type: "trace_end", status: "error", error: String(err), finalText });
    return {
      finalText,
      ...(findings && { findings }),
      metrics: buildMetrics({ sessionStart, accInputTokens, accOutputTokens, accCacheReadTokens, accCacheCreationTokens, accTurns, resultUsage, resultCostUsd, resultNumTurns, toolCalls, filesScannedSet, mcpTelemetry }),
      error: String(err),
    };
  }

  return {
    finalText,
    ...(findings && { findings }),
    metrics: buildMetrics({ sessionStart, accInputTokens, accOutputTokens, accCacheReadTokens, accCacheCreationTokens, accTurns, resultUsage, resultCostUsd, resultNumTurns, toolCalls, filesScannedSet, mcpTelemetry }),
  };
}

/** Rough token estimate: JSON-serialise the value and divide char count by 4. */
function estimateTokens(value: unknown): number {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

interface BuildMetricsInput {
  sessionStart: number;
  accInputTokens: number;
  accOutputTokens: number;
  accCacheReadTokens: number;
  accCacheCreationTokens: number;
  accTurns: number;
  resultUsage: SdkUsageTotals | null;
  resultCostUsd: number | null;
  resultNumTurns: number | null;
  toolCalls: ToolCallRecord[];
  filesScannedSet: Set<string>;
  mcpTelemetry: McpTelemetry;
}

function buildMetrics(input: BuildMetricsInput): BenchmarkMetrics {
  const toolStats: Record<string, { count: number; totalDurationMs: number; totalInputTokensEst: number; totalOutputTokensEst: number }> = {};
  for (const call of input.toolCalls) {
    if (!toolStats[call.tool]) toolStats[call.tool] = { count: 0, totalDurationMs: 0, totalInputTokensEst: 0, totalOutputTokensEst: 0 };
    toolStats[call.tool].count++;
    toolStats[call.tool].totalDurationMs += call.durationMs;
    toolStats[call.tool].totalInputTokensEst += call.inputTokensEst;
    toolStats[call.tool].totalOutputTokensEst += call.outputTokensEst;
  }

  // Prefer authoritative session totals from SDKResultMessage when available,
  // falling back to manually accumulated per-turn values.
  const inputTokens = input.resultUsage?.input_tokens ?? input.accInputTokens;
  const outputTokens = input.resultUsage?.output_tokens ?? input.accOutputTokens;
  const cacheReadTokens = input.resultUsage?.cache_read_input_tokens ?? input.accCacheReadTokens;
  const cacheCreationTokens = input.resultUsage?.cache_creation_input_tokens ?? input.accCacheCreationTokens;
  const turns = input.resultNumTurns ?? input.accTurns;

  return {
    sessionDurationMs: Date.now() - input.sessionStart,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    totalCacheReadTokens: cacheReadTokens,
    totalCacheCreationTokens: cacheCreationTokens,
    totalLogicalInputTokens: inputTokens + cacheReadTokens + cacheCreationTokens,
    totalCostUsd: input.resultCostUsd,
    totalTurns: turns,
    toolCalls: input.toolCalls,
    toolStats,
    filesScanned: [...input.filesScannedSet],
    mcp: input.mcpTelemetry,
  };
}
