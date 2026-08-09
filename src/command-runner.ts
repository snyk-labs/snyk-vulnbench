import { execFile } from "child_process";
import { promisify } from "util";
import type { EvalTask, CommandRunConfig, BenchmarkMetrics, RunOutput } from "./types.js";
import { getParser } from "./parsers/index.js";

const execFileAsync = promisify(execFile);

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
  const parser = getParser(parserKey);
  const sessionStart = Date.now();

  // Substitute {fixturePath} as a whole token — handles paths with spaces correctly
  const parts = config.command.split(" ").map((part) =>
    part === "{fixturePath}" ? fixturePath : part,
  );
  const [program, ...args] = parts;

  let stdout: string;
  try {
    const result = await execFileAsync(program, args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err: any) {
    // `snyk code test` exits non-zero when findings are found — this is expected.
    // The SARIF JSON is on stdout; stderr has the CLI banner (suppressed by 2>/dev/null
    // in manual use, but here we just ignore stderr and use stdout).
    if (err.stdout) {
      stdout = err.stdout;
    } else {
      // Genuine failure (command not found, permission error, etc.)
      return {
        finalText: "",
        metrics: emptyMetrics(sessionStart),
        error: err.message ?? String(err),
      };
    }
  }

  const findings = parser(stdout);

  // Format as FINDINGS_JSON block so the existing scorer works without changes
  const finalText = `FINDINGS_JSON:\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``;

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
    metrics: {
      ...emptyMetrics(sessionStart),
      filesScanned,
    },
  };
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
  };
}
