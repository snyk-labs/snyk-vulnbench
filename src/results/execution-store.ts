import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type {
  ExecutionManifest,
  ExecutionBudgets,
  ExecutionPhase,
  ExecutionProgress,
  ExecutionRunRecord,
  ExecutionRunStatus,
  ExecutionSelectionSnapshot,
  ExecutionSourceSnapshot,
  PlannedExecutionRun,
} from "./execution-types.js";
import { EXECUTION_SCHEMA_VERSION } from "./execution-types.js";

const SECRET_KEY = /(?:api[-_]?key|token|secret|password|authorization|credential)/i;
const SAFE_PATH_SEGMENT = /[^a-zA-Z0-9._-]+/g;

export interface PlannedRunInput {
  taskId: string;
  taskName: string;
  fixtureId: string;
  runConfigId: string;
  runConfigName: string;
  repetition: number;
  totalRepetitions: number;
  taskFingerprint: string;
  configFingerprint: string;
  phaseId?: string;
}

export interface BuildExecutionManifestInput {
  codename: string;
  argv: string[];
  selection: ExecutionSelectionSnapshot;
  source: ExecutionSourceSnapshot;
  plannedRuns: PlannedRunInput[];
  taskSnapshots: Record<string, unknown>;
  configSnapshots: Record<string, unknown>;
  now?: Date;
  shortId?: string;
  budgets?: ExecutionBudgets;
  phases?: ExecutionPhase[];
}

export function buildExecutionManifest(
  input: BuildExecutionManifestInput,
): ExecutionManifest {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const codename = slug(input.codename || "benchmark");
  const shortId = slug(input.shortId ?? randomBytes(4).toString("hex"));
  const executionId = `${createdAt.slice(0, 10).replaceAll("-", "")}-${codename}-${shortId}`;
  const taskSnapshots = redactSecrets(input.taskSnapshots) as Record<string, unknown>;
  const configSnapshots = redactSecrets(input.configSnapshots) as Record<string, unknown>;
  const budgets = input.budgets ?? {};
  const planMaterial = {
    selection: input.selection,
    source: input.source,
    budgets,
    plannedRuns: input.plannedRuns,
    taskSnapshots,
    configSnapshots,
    ...(input.phases && { phases: input.phases }),
  };
  const planFingerprint = hashValue(planMaterial);
  const plannedRuns: PlannedExecutionRun[] = input.plannedRuns.map((run, index) => ({
    ...run,
    ordinal: index + 1,
    runKey: hashValue({
      planFingerprint,
      taskId: run.taskId,
      runConfigId: run.runConfigId,
      repetition: run.repetition,
    }).slice(0, 16),
  }));

  assertUniqueRunKeys(plannedRuns);
  return {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    executionId,
    codename,
    createdAt,
    argv: redactArgv(input.argv),
    selection: input.selection,
    source: input.source,
    budgets,
    planFingerprint,
    ...(input.phases && { phases: input.phases }),
    plannedRuns,
    taskSnapshots,
    configSnapshots,
  };
}

export function createExecutionBundle(
  executionsRoot: string,
  manifest: ExecutionManifest,
): string {
  validateManifest(manifest);
  const executionDir = resolve(executionsRoot, manifest.executionId);
  mkdirSync(join(executionDir, "runs"), { recursive: true });
  mkdirSync(join(executionDir, "artifacts", "traces"), { recursive: true });
  writeJsonExclusive(join(executionDir, "manifest.json"), manifest);
  writeExecutionProgress(
    executionDir,
    reconcileExecutionProgress(manifest, [], manifest.createdAt),
  );
  return executionDir;
}

export function resolveExecutionDirectory(
  resultsDir: string,
  input: string,
): string {
  const candidates = [
    resolve(input),
    resolve(resultsDir, "executions", input),
  ];
  const match = candidates.find((candidate) =>
    existsSync(join(candidate, "manifest.json"))
  );
  if (!match) {
    throw new Error(`Execution "${input}" was not found`);
  }
  return match;
}

export function readExecutionManifest(executionDir: string): ExecutionManifest {
  const manifest = readJson<ExecutionManifest>(join(executionDir, "manifest.json"));
  validateManifest(manifest);
  return manifest;
}

export function executionPhases(
  manifest: ExecutionManifest,
): ExecutionPhase[] {
  return manifest.phases ?? [{
    id: "all",
    name: "All configs",
    configIds: manifest.selection.configIds,
  }];
}

export function writeRunRecord(
  executionDir: string,
  record: ExecutionRunRecord,
): string {
  const manifest = readExecutionManifest(executionDir);
  if (record.executionId !== manifest.executionId) {
    throw new Error(`Run record executionId "${record.executionId}" does not match manifest`);
  }
  const planned = manifest.plannedRuns.find((run) => run.runKey === record.runKey);
  if (!planned || stableStringify(planned) !== stableStringify(record.spec)) {
    throw new Error(`Run record "${record.runKey}" is not part of the execution plan`);
  }
  const path = runRecordPath(executionDir, planned);
  atomicWriteJson(path, record);
  return path;
}

export function readRunRecord(path: string): ExecutionRunRecord {
  const record = readJson<ExecutionRunRecord>(path);
  if (
    record.schemaVersion !== EXECUTION_SCHEMA_VERSION
    || typeof record.executionId !== "string"
    || typeof record.runKey !== "string"
    || !Array.isArray(record.attempts)
  ) {
    throw new Error(`Invalid execution run record at ${path}`);
  }
  return record;
}

export function listRunRecords(executionDir: string): ExecutionRunRecord[] {
  const runsDir = join(executionDir, "runs");
  if (!existsSync(runsDir)) return [];
  const records: ExecutionRunRecord[] = [];
  for (const configEntry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!configEntry.isDirectory()) continue;
    const configDir = join(runsDir, configEntry.name);
    for (const runEntry of readdirSync(configDir, { withFileTypes: true })) {
      if (!runEntry.isFile() || !runEntry.name.endsWith(".json")) continue;
      records.push(readRunRecord(join(configDir, runEntry.name)));
    }
  }
  return records.sort((a, b) => a.spec.ordinal - b.spec.ordinal);
}

export function reconcileExecutionProgress(
  manifest: ExecutionManifest,
  records: ExecutionRunRecord[],
  updatedAt = new Date().toISOString(),
): ExecutionProgress {
  const recordsByKey = new Map(records.map((record) => [record.runKey, record]));
  const counts: Record<ExecutionRunStatus, number> = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    "interrupted-uncertain": 0,
  };
  let logicalInputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let attemptsWithUnknownCost = 0;

  for (const record of records) {
    if (!manifest.plannedRuns.some((run) => run.runKey === record.runKey)) {
      throw new Error(`Run record "${record.runKey}" is not present in manifest`);
    }
    for (const attempt of record.attempts) {
      if (attempt.metrics) {
        logicalInputTokens += attempt.metrics.totalLogicalInputTokens;
        outputTokens += attempt.metrics.totalOutputTokens;
        if (attempt.metrics.totalCostUsd == null) attemptsWithUnknownCost++;
        else costUsd += attempt.metrics.totalCostUsd;
      } else if (attempt.status !== "running") {
        attemptsWithUnknownCost++;
      }
    }
  }

  const items = manifest.plannedRuns.map((run) => {
    const record = recordsByKey.get(run.runKey);
    const status = record?.status ?? "pending";
    counts[status]++;
    return {
      runKey: run.runKey,
      ordinal: run.ordinal,
      taskId: run.taskId,
      runConfigId: run.runConfigId,
      repetition: run.repetition,
      status,
      attempts: record?.attempts.length ?? 0,
    };
  });
  const currentRunKey = items.find((item) => item.status === "running")?.runKey ?? null;
  const attempted = manifest.plannedRuns.length - counts.pending;
  const status = counts.running > 0
    ? "running"
    : counts.succeeded === manifest.plannedRuns.length
      ? "completed"
      : counts.pending === 0
        ? "completed-with-failures"
        : attempted === 0
          ? "planned"
          : "paused";

  return {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    executionId: manifest.executionId,
    status,
    updatedAt,
    currentRunKey,
    totalRuns: manifest.plannedRuns.length,
    counts,
    observedUsage: {
      logicalInputTokens,
      outputTokens,
      costUsd,
      attemptsWithUnknownCost,
    },
    items,
  };
}

export function writeExecutionProgress(
  executionDir: string,
  progress: ExecutionProgress,
): void {
  atomicWriteJson(join(executionDir, "progress.json"), progress);
}

export function readExecutionProgress(executionDir: string): ExecutionProgress {
  return readJson<ExecutionProgress>(join(executionDir, "progress.json"));
}

export function refreshExecutionProgress(
  executionDir: string,
  updatedAt = new Date().toISOString(),
): ExecutionProgress {
  const manifest = readExecutionManifest(executionDir);
  const progress = reconcileExecutionProgress(
    manifest,
    listRunRecords(executionDir),
    updatedAt,
  );
  writeExecutionProgress(executionDir, progress);
  return progress;
}

export function atomicWriteJson(path: string, value: unknown): void {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function atomicWriteText(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
    syncDirectory(dirname(path));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function redactSecrets(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSecrets(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function redactArgv(argv: string[]): string[] {
  const redacted: string[] = [];
  let redactNext = false;
  for (const argument of argv) {
    if (redactNext) {
      redacted.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag = equals >= 0 ? argument.slice(0, equals) : argument;
    if (SECRET_KEY.test(flag)) {
      if (equals >= 0) redacted.push(`${flag}=[REDACTED]`);
      else {
        redacted.push(argument);
        redactNext = true;
      }
    } else {
      redacted.push(argument);
    }
  }
  return redacted;
}

function runRecordPath(
  executionDir: string,
  run: PlannedExecutionRun,
): string {
  const filename = `${slug(run.taskId)}--r${String(run.repetition).padStart(3, "0")}--${run.runKey}.json`;
  return join(executionDir, "runs", slug(run.runConfigId), filename);
}

function writeJsonExclusive(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncDirectory(dirname(path));
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(`Failed to read JSON at ${path}: ${error}`);
  }
}

function validateManifest(manifest: ExecutionManifest): void {
  if (
    manifest.schemaVersion !== EXECUTION_SCHEMA_VERSION
    || typeof manifest.executionId !== "string"
    || typeof manifest.planFingerprint !== "string"
    || !Array.isArray(manifest.plannedRuns)
  ) {
    throw new Error("Invalid execution manifest");
  }
  assertUniqueRunKeys(manifest.plannedRuns);
  if (manifest.phases) {
    const flattened = manifest.phases.flatMap((phase) => phase.configIds);
    if (
      flattened.length !== manifest.selection.configIds.length
      || flattened.some(
        (id, index) => id !== manifest.selection.configIds[index],
      )
    ) {
      throw new Error("Execution manifest phases do not partition selected configs");
    }
    const phaseIds = new Set(manifest.phases.map((phase) => phase.id));
    if (
      phaseIds.size !== manifest.phases.length
      || manifest.plannedRuns.some(
        (run) => !run.phaseId || !phaseIds.has(run.phaseId),
      )
    ) {
      throw new Error("Execution manifest contains invalid run phase assignments");
    }
  }
}

function assertUniqueRunKeys(runs: PlannedExecutionRun[]): void {
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.runKey)) {
      throw new Error(`Duplicate execution run key "${run.runKey}"`);
    }
    seen.add(run.runKey);
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([entryKey, entryValue]) => [entryKey, sortValue(entryValue)]),
    );
  }
  return value;
}

function slug(value: string): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(SAFE_PATH_SEGMENT, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "benchmark";
}

function syncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "EPERM" && code !== "EISDIR") throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

