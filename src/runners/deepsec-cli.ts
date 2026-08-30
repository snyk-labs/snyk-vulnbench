import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeProcess,
  type ProcessExecutionResult,
} from "../process-executor.js";
import { serializeFindingsToFinalText } from "../findings-output.js";
import type {
  BenchmarkMetrics,
  DeepSecRunConfig,
  RunConfig,
  RunOutput,
  Severity,
  ToolCallRecord,
} from "../types.js";
import type { BenchmarkRunner, RunnerContext } from "./types.js";

export const DEEPSEC_CLI_VERSION = "2.3.7";
const RUNNERS_DIR = dirname(fileURLToPath(import.meta.url));

export const deepSecCliRunner: BenchmarkRunner = {
  id: "deepsec-cli",
  version: DEEPSEC_CLI_VERSION,
  kind: "command",
  capabilities: {
    findVulns: true,
    fixVulns: false,
    mcp: false,
  },
  supports(config: RunConfig): boolean {
    return config.type === "deepsec";
  },
  describe(config: RunConfig): string {
    const deepsec = config as DeepSecRunConfig;
    return `[security-harness] DeepSec ${DEEPSEC_CLI_VERSION} (${deepsec.agent}/${deepsec.model}, reasoning: ${deepsec.thinkingLevel})`;
  },
  run(context: RunnerContext): Promise<RunOutput> {
    return runDeepSecTask(context);
  },
};

export async function runDeepSecTask({
  task,
  config,
  cwd,
  workspace,
}: RunnerContext): Promise<RunOutput> {
  const deepsec = config as DeepSecRunConfig;
  const sessionStart = Date.now();
  const dataDir = join(workspace.stateDir, "deepsec-data");
  const exportPath = join(workspace.outputDir, "deepsec-findings.json");
  const toolCalls: ToolCallRecord[] = [];
  const environment = createDeepSecEnvironment();

  writeFileSync(
    join(workspace.stateDir, "deepsec.config.mjs"),
    buildDeepSecConfig(task.fixtureId, cwd, dataDir, deepsec),
    { mode: 0o600 },
  );
  // Config discovery walks upward from cwd; the state directory is the
  // generated DeepSec workspace and keeps all scanner state outside project/.
  writeFileSync(
    join(workspace.stateDir, "package.json"),
    '{"type":"module","private":true}\n',
    { mode: 0o600 },
  );

  try {
    await runStage("DeepSecScan", [
      "scan",
      "--project-id", task.fixtureId,
      "--root", cwd,
    ]);
    const processArgs = [
      "process",
      "--project-id", task.fixtureId,
      "--root", cwd,
      "--agent", deepsec.agent,
      "--model", deepsec.model,
      "--thinking-level", deepsec.thinkingLevel,
      "--max-turns", String(deepsec.maxTurns ?? 30),
      "--batch-size", String(deepsec.batchSize ?? 5),
      "--concurrency", String(deepsec.concurrency ?? 1),
    ];
    if (deepsec.limit !== undefined) {
      processArgs.push("--limit", String(deepsec.limit));
    }
    await runStage("DeepSecProcess", processArgs);
    assertLatestDeepSecProcessCompleted(dataDir, task.fixtureId);
    await runStage("DeepSecExport", [
      "export",
      "--project-id", task.fixtureId,
      "--format", "json",
      "--out", exportPath,
    ], 2 * 60_000);

    if (!existsSync(exportPath)) {
      throw new Error("DeepSec completed without writing its JSON export");
    }
    const findings = parseDeepSecExport(readFileSync(exportPath, "utf8"));
    return {
      finalText: serializeFindingsToFinalText(findings),
      findings,
      metrics: collectDeepSecMetrics(
        sessionStart,
        dataDir,
        task.fixtureId,
        toolCalls,
        deepsec,
      ),
    };
  } catch (error) {
    return {
      finalText: "",
      metrics: collectDeepSecMetrics(
        sessionStart,
        dataDir,
        task.fixtureId,
        toolCalls,
        deepsec,
      ),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  async function runStage(
    tool: string,
    args: string[],
    timeoutMs = deepsec.timeoutMs ?? 45 * 60_000,
  ): Promise<void> {
    const result = await executeProcess({
      program: deepSecExecutable(),
      args,
      cwd: workspace.stateDir,
      env: {
        ...environment,
        DEEPSEC_DATA_ROOT: dataDir,
      },
      timeoutMs,
      maxOutputBytes: 50 * 1024 * 1024,
    });
    recordStage(toolCalls, tool, result, args);
    if (result.exitCode !== 0) {
      const diagnostic = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `${tool} failed with code ${result.exitCode}${diagnostic ? `: ${diagnostic}` : ""}`,
      );
    }
  }
}

export function deepSecExecutable(): string {
  return resolve(RUNNERS_DIR, "../../node_modules/.bin/deepsec");
}

function buildDeepSecConfig(
  projectId: string,
  projectRoot: string,
  dataDir: string,
  config: DeepSecRunConfig,
): string {
  const value = {
    ai: {
      mode: "direct",
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
    },
    dataDir,
    defaultAgent: config.agent,
    defaultModel: config.model,
    defaultThinkingLevel: config.thinkingLevel,
    projects: [{ id: projectId, root: projectRoot }],
  };
  return `export default ${JSON.stringify(value, null, 2)};\n`;
}

function createDeepSecEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    CI: "1",
    NO_COLOR: "1",
  };
  for (const name of [
    "PATH",
    "HOME",
    "USER",
    "LANG",
    "TMPDIR",
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
  const apiKey = source.OPENAI_API_KEY
    ?? source.OPEN_AI_API_KEY
    ?? source.CODEX_API_KEY;
  if (apiKey) environment.OPENAI_API_KEY = apiKey;
  return environment;
}

interface DeepSecExportFinding {
  title?: unknown;
  description?: unknown;
  severity?: unknown;
  metadata?: {
    filePath?: unknown;
    lineNumbers?: unknown;
    vulnSlug?: unknown;
    severity?: unknown;
  };
}

export interface NormalizedDeepSecFinding {
  type: string;
  typeAliases: string[];
  file: string;
  line?: number;
  filesRelated: Array<{ file: string; line: number }>;
  severity: Severity;
  description: string;
  vulnerabilityImpact: string;
  codeFlowMultiLine: "yes" | "no";
  codeFlowCrossFile: "no";
}

export function parseDeepSecExport(json: string): NormalizedDeepSecFinding[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("DeepSec export must be a JSON array");
  }

  return parsed.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const finding = value as DeepSecExportFinding;
    const metadata = finding.metadata;
    const file = typeof metadata?.filePath === "string"
      ? metadata.filePath
      : "";
    const type = typeof metadata?.vulnSlug === "string"
      ? metadata.vulnSlug
      : "other";
    const lines = Array.isArray(metadata?.lineNumbers)
      ? metadata.lineNumbers.filter(
          (line): line is number =>
            typeof line === "number"
            && Number.isInteger(line)
            && line > 0,
        )
      : [];
    const title = typeof finding.title === "string" ? finding.title : "";
    const description = typeof finding.description === "string"
      ? finding.description
      : title;
    const filesRelated = lines.map((line) => ({ file, line }));
    return [{
      type,
      typeAliases: title ? [title] : [],
      file,
      ...(lines[0] !== undefined && { line: lines[0] }),
      filesRelated,
      severity: normalizeDeepSecSeverity(
        metadata?.severity ?? finding.severity,
      ),
      description,
      vulnerabilityImpact: description,
      codeFlowMultiLine: filesRelated.length > 1 ? "yes" : "no",
      codeFlowCrossFile: "no",
    }];
  });
}

function normalizeDeepSecSeverity(value: unknown): Severity {
  switch (String(value).toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
    case "HIGH_BUG":
      return "high";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

function recordStage(
  toolCalls: ToolCallRecord[],
  tool: string,
  result: ProcessExecutionResult,
  args: string[],
): void {
  toolCalls.push({
    tool,
    durationMs: result.durationMs,
    inputTokensEst: estimateTokens(args),
    outputTokensEst: estimateTokens(result.stdout) + estimateTokens(result.stderr),
  });
}

interface DeepSecAnalysisEntry {
  durationMs?: number;
  agentSessionId?: string;
  costUsd?: number;
  numTurns?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
}

interface DeepSecFileRecord {
  filePath?: string;
  analysisHistory?: DeepSecAnalysisEntry[];
}

function collectDeepSecMetrics(
  sessionStart: number,
  dataRoot: string,
  projectId: string,
  toolCalls: ToolCallRecord[],
  config: DeepSecRunConfig,
): BenchmarkMetrics {
  const records = readDeepSecFileRecords(
    join(dataRoot, projectId, "files"),
  );
  const entries = records.flatMap((record) => record.analysisHistory ?? []);
  const totalInputTokens = sum(entries, (entry) => entry.usage?.inputTokens);
  const totalOutputTokens = sum(entries, (entry) => entry.usage?.outputTokens);
  const totalCacheReadTokens = sum(
    entries,
    (entry) => entry.usage?.cacheReadInputTokens,
  );
  const totalCacheCreationTokens = sum(
    entries,
    (entry) => entry.usage?.cacheCreationInputTokens,
  );
  const costs = entries
    .map((entry) => entry.costUsd)
    .filter((cost): cost is number => typeof cost === "number");
  const toolStats: BenchmarkMetrics["toolStats"] = {};
  for (const call of toolCalls) {
    toolStats[call.tool] = {
      count: 1,
      totalDurationMs: call.durationMs,
      totalInputTokensEst: call.inputTokensEst,
      totalOutputTokensEst: call.outputTokensEst,
    };
  }

  return {
    sessionDurationMs: Date.now() - sessionStart,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    totalLogicalInputTokens:
      totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens,
    totalCostUsd: costs.length > 0
      ? costs.reduce((total, cost) => total + cost, 0)
      : null,
    totalTurns: sum(entries, (entry) => entry.numTurns),
    toolCalls,
    toolStats,
    filesScanned: records
      .map((record) => record.filePath)
      .filter((file): file is string => typeof file === "string"),
    mcp: {
      configuredServers: [],
      serverStatuses: [],
      advertisedToolCount: 0,
      toolStats: {},
    },
    runner: {
      id: "deepsec-cli",
      version: DEEPSEC_CLI_VERSION,
      ...(entries.find((entry) => entry.agentSessionId)?.agentSessionId && {
        sessionId: entries.find((entry) => entry.agentSessionId)?.agentSessionId,
      }),
      tokenSource: entries.some((entry) => entry.usage)
        ? "reported"
        : "unavailable",
      toolSource: "reported",
    },
  };
}

function readDeepSecFileRecords(directory: string): DeepSecFileRecord[] {
  if (!existsSync(directory)) return [];
  const records: DeepSecFileRecord[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          records.push(JSON.parse(readFileSync(fullPath, "utf8")));
        } catch {
          // Invalid state is surfaced by the stage exit code; skip for metrics.
        }
      }
    }
  };
  walk(directory);
  return records;
}

function assertLatestDeepSecProcessCompleted(
  dataRoot: string,
  projectId: string,
): void {
  const runsDir = join(dataRoot, projectId, "runs");
  if (!existsSync(runsDir)) {
    throw new Error("DeepSec process produced no run metadata");
  }
  const processRuns = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const value = JSON.parse(
          readFileSync(join(runsDir, name), "utf8"),
        ) as { type?: unknown; phase?: unknown; createdAt?: unknown };
        return value.type === "process" ? [value] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
    );
  const latest = processRuns[0];
  if (!latest) throw new Error("DeepSec process produced no process RunMeta");
  if (latest.phase !== "done") {
    throw new Error(`DeepSec process run ended in phase "${String(latest.phase)}"`);
  }
}

function sum<T>(
  values: T[],
  select: (value: T) => number | undefined,
): number {
  return values.reduce((total, value) => total + (select(value) ?? 0), 0);
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}
