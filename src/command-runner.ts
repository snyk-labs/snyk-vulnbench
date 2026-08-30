import type { EvalTask, CommandRunConfig, BenchmarkMetrics, RunOutput } from "./types.js";
import { serializeFindingsToFinalText } from "./findings-output.js";
import { getParser } from "./parsers/index.js";
import { executeProcess, ProcessExecutionError } from "./process-executor.js";

/**
 * Runs a SAST or other CLI tool against the fixture path and returns findings
 * in the same RunOutput shape as the model runner.
 *
 * The command template uses {fixturePath} as a placeholder for the fixture directory.
 * The parser key is looked up in the parser registry (src/parsers/index.ts).
 *
 * Token and turn fields in metrics are zeroed — they are not applicable to CLI tools.
 * filesScanned is derived from the unique file URIs reported in findings.
 */
export async function runCommandTask(
  task: EvalTask,
  config: CommandRunConfig,
  fixturePath: string,
): Promise<RunOutput> {
  const parserKey = task.groundTruth === "attacker-reachable" && config.parser === "snyk-code"
    ? "snyk-code-attacker-reachable"
    : config.parser;
  const sessionStart = Date.now();

  const { program, args } = resolveCommand(config, fixturePath);
  try {
    const result = await executeProcess({
      program,
      args,
      cwd: fixturePath,
      env: process.env,
      timeoutMs: config.timeoutMs ?? 10 * 60_000,
      maxOutputBytes: 10 * 1024 * 1024,
    });
    // Security scanners commonly return non-zero when findings exist. Preserve
    // the prior behavior by accepting any exit status that produced parseable
    // stdout, while treating empty non-zero runs as execution failures.
    if (result.exitCode !== 0 && !result.stdout.trim()) {
      return {
        finalText: "",
        metrics: emptyMetrics(sessionStart),
        error: result.stderr.trim()
          || `${program} exited with code ${result.exitCode}`,
      };
    }
    return buildCommandOutput(result.stdout, parserKey, sessionStart);
  } catch (error) {
    const message = error instanceof ProcessExecutionError
      ? `${error.message}${error.stderr.trim() ? `: ${error.stderr.trim()}` : ""}`
      : String(error);
    return {
      finalText: "",
      metrics: emptyMetrics(sessionStart),
      error: message,
    };
  }
}

export function buildCommandOutput(
  stdout: string,
  parserKey: string,
  sessionStart: number,
): RunOutput {
  const parser = getParser(parserKey);
  const findings = parser(stdout);

  const finalText = serializeFindingsToFinalText(findings);

  // Unique file paths from findings — meaningful proxy for "what the tool scanned"
  const filesScanned = [
    ...new Set(
      findings.flatMap((finding) =>
        finding.filesRelated?.map((location) => location.file)
        ?? (finding.file ? [finding.file] : [])
      ),
    ),
  ];

  return {
    finalText,
    findings,
    metrics: {
      ...emptyMetrics(sessionStart),
      filesScanned,
    },
  };
}

export function resolveCommand(
  config: CommandRunConfig,
  fixturePath: string,
): { program: string; args: string[] } {
  if (config.executable) {
    return {
      program: config.executable,
      args: (config.args ?? []).map((arg) =>
        arg.replaceAll("{fixturePath}", fixturePath)
      ),
    };
  }

  if (!config.command) {
    throw new Error(
      `Command config "${config.id}" requires executable or legacy command`,
    );
  }
  const [program, ...args] = config.command.split(" ").map((part) =>
    part.replaceAll("{fixturePath}", fixturePath)
  );
  return { program, args };
}

function emptyMetrics(sessionStart: number): BenchmarkMetrics {
  return {
    sessionDurationMs: Date.now() - sessionStart,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalLogicalInputTokens: 0,
    totalCostUsd: null,
    totalTurns: 0,
    toolCalls: [],
    toolStats: {},
    filesScanned: [],
    mcp: { configuredServers: [], serverStatuses: [], advertisedToolCount: 0, toolStats: {} },
  };
}
