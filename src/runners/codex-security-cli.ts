import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeFindingsToFinalText } from "../findings-output.js";
import {
  prepareSecurityReviewGitWorkspace,
  pruneIgnoredFilesForScan,
} from "../isolated-workspace.js";
import { parseCodexSecurityFindings } from "../parsers/codex-security.js";
import { executeProcess, type ProcessExecutionResult } from "../process-executor.js";
import { buildLandlockInvocation } from "../sandbox/landlock.js";
import type {
  BenchmarkMetrics,
  CodexSecurityParserDiagnostics,
  CodexSecurityRunConfig,
  CodexSecurityTelemetry,
  FindingRecord,
  RunConfig,
  RunOutput,
  ToolCallRecord,
} from "../types.js";
import { probeCodexContainment } from "./codex-containment.js";
import { codexExecutable } from "./codex-config.js";
import type { BenchmarkRunner, RunnerContext } from "./types.js";

export const CODEX_SECURITY_VERSION = "0.1.24";
const RUNNERS_DIR = dirname(fileURLToPath(import.meta.url));

export const codexSecurityCliRunner: BenchmarkRunner = {
  id: "codex-security-cli",
  version: CODEX_SECURITY_VERSION,
  kind: "command",
  capabilities: {
    findVulns: true,
    fixVulns: false,
    mcp: false,
  },
  supports(config: RunConfig): boolean {
    return config.type === "codex-security";
  },
  describe(config: RunConfig): string {
    const security = config as CodexSecurityRunConfig;
    return `[security-harness] Codex Security ${CODEX_SECURITY_VERSION} (${security.model}, effort: ${security.effort}, mode: ${security.mode ?? "standard"})`;
  },
  run(context: RunnerContext): Promise<RunOutput> {
    return runCodexSecurityTask(context);
  },
};

export async function runCodexSecurityTask({
  task,
  config,
  cwd,
  workspace,
}: RunnerContext): Promise<RunOutput> {
  const security = config as CodexSecurityRunConfig;
  const sessionStart = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  let findings: FindingRecord[] = [];
  let scanOutput: Record<string, unknown> | undefined;
  let parserDiagnostics: CodexSecurityParserDiagnostics | undefined;

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Codex Security requires OPENAI_API_KEY");
    }
    prepareSecurityReviewGitWorkspace(cwd);
    pruneIgnoredFilesForScan(cwd);

    const containment = await probeCodexContainment(workspace, "read");
    if (!containment.ok) {
      throw new Error(`Codex Security containment unavailable: ${containment.detail}`);
    }

    const environment = createCodexSecurityEnvironment(workspace);
    const outputDir = join(workspace.outputDir, "codex-security-scan");
    const baseArgs = buildCodexSecurityScanArgs(
      security,
      cwd,
      outputDir,
      environment.PYTHON ?? "python3",
    );

    const dryRun = await executeContained(
      workspace,
      environment,
      [...baseArgs, "--dry-run"],
      security.timeoutMs === undefined
        ? 2 * 60_000
        : Math.min(security.timeoutMs, 2 * 60_000),
    );
    recordToolCall(toolCalls, "CodexSecurityDryRun", dryRun);
    if (dryRun.exitCode !== 0) {
      throw new Error(
        `Codex Security dry run failed with code ${dryRun.exitCode}: ${safeDiagnostic(dryRun)}`,
      );
    }

    const scan = await executeContained(
      workspace,
      environment,
      baseArgs,
      security.timeoutMs,
    );
    recordToolCall(toolCalls, "CodexSecurityScan", scan);
    if (scan.exitCode !== 0 && scan.exitCode !== 2) {
      throw new Error(
        `Codex Security scan failed with code ${scan.exitCode}: ${safeDiagnostic(scan)}`,
      );
    }

    const output = parseCodexSecurityScanOutput(scan.stdout, outputDir, scan);
    scanOutput = output;
    const manifest = asRecord(output.manifest);
    const scanMetadata = asRecord(manifest.scan);
    if (scanMetadata.status !== "completed") {
      throw new Error(
        `Codex Security did not produce a completed sealed scan (status: ${String(scanMetadata.status)})`,
      );
    }
    const parsed = parseCodexSecurityFindings(output.findings, task.groundTruth);
    findings = parsed.findings;
    parserDiagnostics = parsed.diagnostics;
    const telemetry = codexSecurityTelemetry(output, parserDiagnostics);

    return {
      finalText: serializeFindingsToFinalText(findings),
      findings,
      metrics: collectCodexSecurityMetrics(
        sessionStart,
        toolCalls,
        findings,
        output,
        telemetry,
      ),
    };
  } catch (error) {
    return {
      finalText: "",
      ...(findings.length > 0 && { findings }),
      metrics: collectCodexSecurityMetrics(
        sessionStart,
        toolCalls,
        findings,
        scanOutput,
        parserDiagnostics && scanOutput
          ? codexSecurityTelemetry(scanOutput, parserDiagnostics)
          : undefined,
      ),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function codexSecurityExecutable(): string {
  return resolve(RUNNERS_DIR, "../../node_modules/.bin/codex-security");
}

export function createCodexSecurityEnvironment(
  workspace: RunnerContext["workspace"],
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const codexHome = join(workspace.stateDir, "codex-home");
  const securityState = join(workspace.stateDir, "codex-security-state");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(securityState, { recursive: true });

  const environment: NodeJS.ProcessEnv = {
    CI: "1",
    NO_COLOR: "1",
    CODEX_HOME: codexHome,
    CODEX_SECURITY_STATE_DIR: securityState,
    CODEX_CLI_PATH: codexExecutable(),
    PYTHON: source.PYTHON ?? "python3",
  };
  for (const name of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "TERM",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ]) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("LC_") && value !== undefined) environment[name] = value;
  }
  if (source.OPENAI_API_KEY) {
    environment.OPENAI_API_KEY = source.OPENAI_API_KEY;
  }
  return environment;
}

export function buildCodexSecurityScanArgs(
  config: CodexSecurityRunConfig,
  projectDir: string,
  outputDir: string,
  python: string,
): string[] {
  const args = [
    "scan",
    projectDir,
    "--output-dir", outputDir,
    "--auth", config.auth ?? "api-key",
    "--mode", config.mode ?? "standard",
    "--model", config.model,
    "--effort", config.effort,
    "--python", python,
    "--headless",
    "--json",
  ];
  if (config.maxCostUsd !== undefined) {
    args.push("--max-cost", String(config.maxCostUsd));
  }
  return args;
}

async function executeContained(
  workspace: RunnerContext["workspace"],
  environment: NodeJS.ProcessEnv,
  args: string[],
  timeoutMs?: number,
): Promise<ProcessExecutionResult> {
  const invocation = await buildLandlockInvocation(
    workspace,
    "read",
    codexSecurityExecutable(),
    args,
    environment,
  );
  return executeProcess({
    program: invocation.program,
    args: invocation.args,
    cwd: workspace.projectDir,
    env: invocation.environment,
    timeoutMs,
    maxOutputBytes: 50 * 1024 * 1024,
  });
}

export function parseCodexSecurityScanOutput(
  stdout: string,
  outputDir: string,
  result?: ProcessExecutionResult,
): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!asRecord(parsed).findings) {
        throw new Error("missing findings document");
      }
      return asRecord(parsed);
    } catch (error) {
      throw new Error(
        `Codex Security returned invalid JSON output: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const manifestPath = join(outputDir, "scan-manifest.json");
  const findingsPath = join(outputDir, "findings.json");
  const coveragePath = join(outputDir, "coverage.json");
  if (
    existsSync(manifestPath)
    && existsSync(findingsPath)
    && existsSync(coveragePath)
  ) {
    try {
      return {
        manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
        findings: JSON.parse(readFileSync(findingsPath, "utf8")),
        coverage: JSON.parse(readFileSync(coveragePath, "utf8")),
        scanDir: outputDir,
      };
    } catch (error) {
      throw new Error(
        `Codex Security produced unreadable scan artifacts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const exit = result?.exitCode == null ? "unknown" : String(result.exitCode);
  throw new Error(
    `Codex Security produced no structured scan output (exit ${exit}): ${result ? safeDiagnostic(result) : "scan artifacts unavailable"}`,
  );
}

export function collectCodexSecurityMetrics(
  sessionStart: number,
  toolCalls: ToolCallRecord[],
  findings: FindingRecord[],
  output?: Record<string, unknown>,
  telemetry?: CodexSecurityTelemetry,
): BenchmarkMetrics {
  const toolStats: BenchmarkMetrics["toolStats"] = {};
  for (const call of toolCalls) {
    toolStats[call.tool] = {
      count: 1,
      totalDurationMs: call.durationMs,
      totalInputTokensEst: call.inputTokensEst,
      totalOutputTokensEst: call.outputTokensEst,
    };
  }
  const turn = asRecord(output?.turn ?? output?.turnResult);
  const usage = asRecord(turn.usage);
  const inputTokens = numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  const cacheReadTokens = numberValue(usage.cached_input_tokens);
  const cacheCreationTokens = numberValue(usage.cache_write_input_tokens);
  const reasoningOutputTokens = numberValue(usage.reasoning_output_tokens);
  const hasReportedUsage = Object.values(usage).some((value) =>
    typeof value === "number"
  );
  const cost = asRecord(output?.cost);
  const threadId = stringValue(output?.threadId);

  return {
    sessionDurationMs: Date.now() - sessionStart,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    ...(reasoningOutputTokens > 0 && {
      totalReasoningOutputTokens: reasoningOutputTokens,
    }),
    totalCacheReadTokens: cacheReadTokens,
    totalCacheCreationTokens: cacheCreationTokens,
    totalLogicalInputTokens:
      inputTokens + cacheReadTokens + cacheCreationTokens,
    totalCostUsd: nullableNumber(cost.estimatedUsd),
    totalTurns: turn.id || turn.status ? 1 : 0,
    toolCalls,
    toolStats,
    filesScanned: [...new Set(findings.flatMap((finding) =>
      finding.filesRelated?.map((location) => location.file)
      ?? (finding.file ? [finding.file] : [])
    ))],
    mcp: {
      configuredServers: [],
      serverStatuses: [],
      advertisedToolCount: 0,
      toolStats: {},
    },
    ...(telemetry && { codexSecurity: telemetry }),
    runner: {
      id: "codex-security-cli",
      version: CODEX_SECURITY_VERSION,
      ...(threadId && { sessionId: threadId }),
      tokenSource: hasReportedUsage ? "reported" : "unavailable",
      toolSource: "reported",
    },
  };
}

export function codexSecurityTelemetry(
  output: Record<string, unknown>,
  parser: CodexSecurityParserDiagnostics,
): CodexSecurityTelemetry {
  const manifest = asRecord(output.manifest);
  const scan = asRecord(manifest.scan);
  const producer = asRecord(scan.producer);
  const target = asRecord(scan.target);
  const coverage = asRecord(output.coverage);
  if (
    coverage.documentType !== "codex-security.coverage"
    || coverage.schemaVersion !== "1.0"
  ) {
    throw new Error("Codex Security returned an unsupported coverage contract");
  }
  const completeness = coverage.completeness;
  if (
    completeness !== "complete"
    && completeness !== "partial"
    && completeness !== "unknown"
  ) {
    throw new Error(
      `Codex Security returned invalid coverage completeness "${String(completeness)}"`,
    );
  }
  const surfaces = arrayValue(coverage.surfaces);

  return {
    packageVersion: CODEX_SECURITY_VERSION,
    pluginVersion: stringValue(output.pluginVersion)
      ?? stringValue(producer.version)
      ?? "unknown",
    scanId: parser.scanId,
    ...(stringValue(output.threadId) && {
      threadId: stringValue(output.threadId),
    }),
    target: {
      kind: stringValue(target.kind) ?? "unknown",
      ...(stringValue(target.targetId) && {
        targetId: stringValue(target.targetId),
      }),
      ...(stringValue(target.revision) && {
        revision: stringValue(target.revision),
      }),
      ...(stringValue(target.snapshotDigest) && {
        snapshotDigest: stringValue(target.snapshotDigest),
      }),
    },
    coverage: {
      completeness,
      mode: stringValue(coverage.mode) ?? "unknown",
      surfaceCount: surfaces.length,
      deferredCount: arrayValue(coverage.deferred).length,
      explicitExclusionCount: arrayValue(coverage.explicitExclusions).length,
      needsFollowUpCount: surfaces.filter((surface) =>
        asRecord(surface).disposition === "needs_follow_up"
      ).length,
    },
    parser,
    ...(positiveInteger(output.workerCount) !== undefined && {
      workerCount: positiveInteger(output.workerCount),
    }),
    ...(positiveInteger(output.subagentCount) !== undefined && {
      subagentCount: positiveInteger(output.subagentCount),
    }),
  };
}

function recordToolCall(
  toolCalls: ToolCallRecord[],
  tool: string,
  result: ProcessExecutionResult,
): void {
  toolCalls.push({
    tool,
    durationMs: result.durationMs,
    inputTokensEst: 0,
    outputTokensEst: Math.ceil(result.stdout.length / 4),
  });
}

function safeDiagnostic(result: ProcessExecutionResult): string {
  const value = result.stderr.trim();
  return value ? value.slice(-4_000) : "no diagnostic output";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
