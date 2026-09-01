import {
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { aggregateByConfig, aggregateByTask } from "../aggregator.js";
import type {
  EvalResult,
  EvalTask,
  RunConfig,
  RunConfigGroup,
} from "../types.js";
import {
  atomicWriteJson,
  buildExecutionManifest,
  createExecutionBundle,
  hashValue,
  listRunRecords,
  readExecutionManifest,
  reconcileExecutionProgress,
  writeExecutionProgress,
  writeRunRecord,
} from "./execution-store.js";
import { writeBenchmarkJsonl } from "./results-io.js";
import {
  EXECUTION_SCHEMA_VERSION,
  type ExecutionAggregates,
  type ExecutionManifest,
  type ExecutionRunRecord,
  type PlannedExecutionRun,
} from "./execution-types.js";

export interface NewExecutionInput {
  projectRoot: string;
  resultsDir: string;
  argv: string[];
  tasks: EvalTask[];
  configs: RunConfig[];
  compatibleTasks: Map<string, EvalTask[]>;
  repetitions: number;
  selectedGroup?: RunConfigGroup;
  selectedCategory?: string;
}

export interface ExecutionCheckpoint {
  manifest: ExecutionManifest;
  executionDir: string;
  compatibilityJsonlPath: string;
  results: EvalResult[];
  aggregates: ExecutionAggregates;
}

export function initializeExecution(input: NewExecutionInput): ExecutionCheckpoint {
  const taskSnapshots: Record<string, unknown> = {};
  const taskFingerprints = new Map<string, string>();
  for (const task of input.tasks) {
    const projectFingerprint = hashDirectory(task.fixture);
    const snapshot = {
      id: task.id,
      name: task.name,
      fixtureId: task.fixtureId,
      fixtureMetadataHash: task.fixtureMetadataHash,
      projectFingerprint,
      category: task.category.id,
      groundTruth: task.groundTruth,
      systemPrompt: task.systemPrompt,
      prompt: task.prompt,
      knownVulns: task.knownVulns,
    };
    taskSnapshots[task.id] = snapshot;
    taskFingerprints.set(task.id, hashValue(snapshot));
  }
  const configSnapshots = Object.fromEntries(
    input.configs.map((config) => [config.id, config]),
  );
  const configFingerprints = new Map(
    input.configs.map((config) => [config.id, hashValue(config)]),
  );
  const plannedRuns = input.configs.flatMap((config) =>
    (input.compatibleTasks.get(config.id) ?? []).flatMap((task) =>
      Array.from({ length: input.repetitions }, (_, repetition) => ({
        taskId: task.id,
        taskName: task.name,
        fixtureId: task.fixtureId,
        runConfigId: config.id,
        runConfigName: config.name,
        repetition: repetition + 1,
        totalRepetitions: input.repetitions,
        taskFingerprint: taskFingerprints.get(task.id)!,
        configFingerprint: configFingerprints.get(config.id)!,
      }))
    )
  );
  const source = sourceSnapshot(input.projectRoot);
  const manifest = buildExecutionManifest({
    codename: input.selectedGroup?.id ?? input.selectedCategory ?? "benchmark",
    argv: input.argv,
    selection: {
      category: input.selectedCategory ?? null,
      configGroup: input.selectedGroup?.id ?? null,
      taskIds: input.tasks.map((task) => task.id),
      configIds: input.configs.map((config) => config.id),
      repetitions: input.repetitions,
    },
    source,
    plannedRuns,
    taskSnapshots,
    configSnapshots,
  });
  const executionDir = createExecutionBundle(
    join(input.resultsDir, "executions"),
    manifest,
  );
  return checkpointExecution(executionDir, input.resultsDir);
}

export function beginExecutionRun(
  executionDir: string,
  spec: PlannedExecutionRun,
  startedAt = new Date().toISOString(),
): ExecutionRunRecord {
  const record: ExecutionRunRecord = {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    executionId: readExecutionManifest(executionDir).executionId,
    runKey: spec.runKey,
    spec,
    status: "running",
    attempts: [{
      attempt: 1,
      status: "running",
      startedAt,
    }],
    updatedAt: startedAt,
  };
  writeRunRecord(executionDir, record);
  refreshProgressOnly(executionDir, startedAt);
  return record;
}

export function finishExecutionRun(
  executionDir: string,
  record: ExecutionRunRecord,
  result: EvalResult,
  completedAt = new Date().toISOString(),
): ExecutionRunRecord {
  const attempt = record.attempts.at(-1);
  if (!attempt || attempt.status !== "running") {
    throw new Error(`Run "${record.runKey}" has no active attempt`);
  }
  const failed = Boolean(result.error);
  const finished: ExecutionRunRecord = {
    ...record,
    status: failed ? "failed" : "succeeded",
    attempts: [
      ...record.attempts.slice(0, -1),
      {
        ...attempt,
        status: failed ? "failed" : "succeeded",
        completedAt,
        metrics: result.metrics,
        ...(failed && {
          failure: {
            kind: "unknown" as const,
            message: result.error!,
            retryable: false,
            systemic: false,
          },
        }),
      },
    ],
    ...(!failed && { result }),
    updatedAt: completedAt,
  };
  writeRunRecord(executionDir, finished);
  return finished;
}

export function checkpointExecution(
  executionDir: string,
  resultsDir = resolve(executionDir, "../.."),
  generatedAt = new Date().toISOString(),
): ExecutionCheckpoint {
  const manifest = readExecutionManifest(executionDir);
  const records = listRunRecords(executionDir);
  const progress = reconcileExecutionProgress(manifest, records, generatedAt);
  writeExecutionProgress(executionDir, progress);
  const results = records.flatMap((record) => record.result ? [record.result] : []);
  const taskAggregates = aggregateByTask(results);
  const configAggregates = aggregateByConfig(taskAggregates, results);
  const aggregates: ExecutionAggregates = {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    executionId: manifest.executionId,
    generatedAt,
    partial: progress.counts.succeeded !== progress.totalRuns,
    coverage: {
      succeededRuns: progress.counts.succeeded,
      plannedRuns: progress.totalRuns,
      failedRuns: progress.counts.failed,
      interruptedRuns: progress.counts["interrupted-uncertain"],
    },
    taskAggregates,
    configAggregates,
  };
  atomicWriteJson(join(executionDir, "aggregates.json"), aggregates);
  const snapshot = {
    executionId: manifest.executionId,
    partial: aggregates.partial,
    coverage: aggregates.coverage,
  };
  writeBenchmarkJsonl(
    join(executionDir, "benchmark.jsonl"),
    { runs: results, taskAggregates, configAggregates },
    snapshot,
  );
  const compatibilityJsonlPath = join(
    resultsDir,
    `benchmark-${manifest.executionId}.jsonl`,
  );
  writeBenchmarkJsonl(
    compatibilityJsonlPath,
    { runs: results, taskAggregates, configAggregates },
    snapshot,
  );
  return {
    manifest,
    executionDir,
    compatibilityJsonlPath,
    results,
    aggregates,
  };
}

function refreshProgressOnly(executionDir: string, updatedAt: string): void {
  const manifest = readExecutionManifest(executionDir);
  writeExecutionProgress(
    executionDir,
    reconcileExecutionProgress(
      manifest,
      listRunRecords(executionDir),
      updatedAt,
    ),
  );
}

function sourceSnapshot(projectRoot: string) {
  const gitCommit = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const status = runGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const diff = runGit(projectRoot, ["diff", "--no-ext-diff", "HEAD"]);
  const dirtyMaterial = [status, diff].filter(Boolean).join("\n");
  const dirtyFingerprint = dirtyMaterial ? hashValue(dirtyMaterial) : null;
  return {
    gitCommit,
    dirtyFingerprint,
    harnessFingerprint: hashValue({
      gitCommit,
      dirtyFingerprint,
    }),
  };
}

function runGit(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-c", `safe.directory=${projectRoot}`, ...args], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function hashDirectory(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      hash.update(relativePath);
      if (entry.isDirectory()) {
        hash.update("directory");
        visit(path);
      } else if (entry.isSymbolicLink()) {
        hash.update("symlink");
        hash.update(readlinkSync(path));
      } else if (entry.isFile()) {
        hash.update("file");
        hash.update(readFileSync(path));
      } else {
        hash.update(String(lstatSync(path).mode));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

