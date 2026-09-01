import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { aggregateByConfig, aggregateByTask } from "../aggregator.js";
import type {
  AggregatedConfigResult,
  AggregatedTaskResult,
  EvalResult,
} from "../types.js";
import {
  atomicWriteText,
  listRunRecords,
  readExecutionManifest,
  readExecutionProgress,
} from "./execution-store.js";
import type {
  ExecutionAggregates,
  ParsedBenchmarkResults,
} from "./execution-types.js";

interface JsonlRecord {
  _type?: string;
  [key: string]: unknown;
}

export function readBenchmarkResults(path: string): ParsedBenchmarkResults {
  const resolved = resolve(path);
  if (statSync(resolved).isDirectory()) return readExecutionBundle(resolved);
  return readLegacyJsonl(resolved);
}

export function writeBenchmarkJsonl(
  outputPath: string,
  results: Pick<
    ParsedBenchmarkResults,
    "runs" | "taskAggregates" | "configAggregates"
  >,
  execution?: {
    executionId: string;
    partial: boolean;
    coverage: {
      succeededRuns: number;
      plannedRuns: number;
      failedRuns: number;
      interruptedRuns: number;
      phases?: Array<{
        phaseId: string;
        plannedRuns: number;
        succeededRuns: number;
        failedRuns: number;
        interruptedRuns: number;
      }>;
    };
  },
): void {
  const metadata = execution ? {
    executionId: execution.executionId,
    executionPartial: execution.partial,
    executionCoverage: execution.coverage,
  } : {};
  const rows = [
    ...results.runs.map((run) => ({ _type: "run", ...run, ...metadata })),
    ...results.taskAggregates.map((aggregate) => ({
      _type: "task-aggregate",
      ...aggregate,
      ...metadata,
    })),
    ...results.configAggregates.map((aggregate) => ({
      _type: "config-aggregate",
      ...aggregate,
      ...metadata,
    })),
  ];
  atomicWriteText(
    outputPath,
    rows.length === 0
      ? ""
      : `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
}

export function findLatestBenchmarkResults(resultsDir: string): string | null {
  if (!existsSync(resultsDir)) return null;
  const candidates: Array<{ path: string; timestamp: number }> = [];
  for (const entry of readdirSync(resultsDir, { withFileTypes: true })) {
    const path = join(resultsDir, entry.name);
    if (entry.isFile() && /^benchmark-.+\.jsonl$/.test(entry.name)) {
      candidates.push({ path, timestamp: statSync(path).mtimeMs });
    }
  }
  const executionsDir = join(resultsDir, "executions");
  if (existsSync(executionsDir)) {
    for (const entry of readdirSync(executionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(executionsDir, entry.name);
      const manifestPath = join(path, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      candidates.push({ path, timestamp: statSync(manifestPath).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0]?.path ?? null;
}

function readExecutionBundle(executionDir: string): ParsedBenchmarkResults {
  const manifest = readExecutionManifest(executionDir);
  const progress = existsSync(join(executionDir, "progress.json"))
    ? readExecutionProgress(executionDir)
    : undefined;
  const runs = listRunRecords(executionDir)
    .flatMap((record) => record.result ? [record.result] : []);
  const aggregatesPath = join(executionDir, "aggregates.json");
  let taskAggregates: AggregatedTaskResult[];
  let configAggregates: AggregatedConfigResult[];
  if (existsSync(aggregatesPath)) {
    const aggregates = JSON.parse(
      readFileSync(aggregatesPath, "utf8"),
    ) as ExecutionAggregates;
    taskAggregates = aggregates.taskAggregates;
    configAggregates = aggregates.configAggregates;
  } else {
    taskAggregates = aggregateByTask(runs);
    configAggregates = aggregateByConfig(taskAggregates, runs);
  }
  return { runs, taskAggregates, configAggregates, manifest, progress };
}

function readLegacyJsonl(path: string): ParsedBenchmarkResults {
  const records = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as JsonlRecord;
      } catch (error) {
        throw new Error(`Failed to parse ${path}:${index + 1}: ${error}`);
      }
    });
  const runs: EvalResult[] = [];
  const taskAggregates: AggregatedTaskResult[] = [];
  const configAggregates: AggregatedConfigResult[] = [];
  for (const record of records) {
    const { _type, ...payload } = record;
    if (_type === "task-aggregate") {
      taskAggregates.push(payload as unknown as AggregatedTaskResult);
    } else if (_type === "config-aggregate") {
      configAggregates.push(payload as unknown as AggregatedConfigResult);
    } else if (_type === "run" || _type === undefined) {
      runs.push(payload as unknown as EvalResult);
    }
  }
  return {
    runs,
    taskAggregates: taskAggregates.length > 0
      ? taskAggregates
      : aggregateByTask(runs),
    configAggregates: configAggregates.length > 0
      ? configAggregates
      : aggregateByConfig(
        taskAggregates.length > 0 ? taskAggregates : aggregateByTask(runs),
        runs,
      ),
  };
}

