import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { dirname } from "path";
import { resolvePromptTemplate } from "./prompt-templates.js";
import type {
  EvalTask,
  McpTelemetry,
  ModelRunConfig,
  RunOutput,
  BenchmarkMetrics,
  ToolCallRecord,
} from "./types.js";

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

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
  let resultUsage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null = null;
  let resultCostUsd: number | null = null;
  let resultNumTurns: number | null = null;
  let finalText = "";

  // PreToolUse hook: record start time
  const preToolHook: HookCallback = async (input) => {
    const id = (input as any).tool_use_id ?? String(Date.now());
    toolStartTimes.set(id, Date.now());
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
    const effort = config.effort === "default" ? undefined : config.effort ?? "high";
    const thinking = config.thinking ?? { type: "adaptive" as const };
    const benchmarkEnv = process.env;
    const mcpServers = resolveMcpServers(config.mcpServers, benchmarkEnv);
    const prompt = resolvePromptTemplate(task.prompt, config.promptTemplateId);

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
        hooks: {
          PreToolUse: [{ matcher: ".*", hooks: [preToolHook] }],
          PostToolUse: [{ matcher: ".*", hooks: [postToolHook] }],
        },
      },
    })) {
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
        // SDKResultMessage carries authoritative session-level token totals.
        // Prefer these over manual per-turn accumulation when available.
        if (result.usage) {
          resultUsage = {
            input_tokens: result.usage.input_tokens ?? 0,
            output_tokens: result.usage.output_tokens ?? 0,
            cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
          };
          resultCostUsd = typeof result.total_cost_usd === "number" ? result.total_cost_usd : null;
          resultNumTurns = typeof result.num_turns === "number" ? result.num_turns : null;
        }
      }
    }
  } catch (err) {
    return {
      finalText,
      metrics: buildMetrics({ sessionStart, accInputTokens, accOutputTokens, accCacheReadTokens, accCacheCreationTokens, accTurns, resultUsage, resultCostUsd, resultNumTurns, toolCalls, filesScannedSet, mcpTelemetry }),
      error: String(err),
    };
  }

  return {
    finalText,
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
  resultUsage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null;
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
