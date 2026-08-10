import type {
  EvalResult,
  FindVulnsDetails,
  AggregatedTaskResult,
  AggregatedConfigResult,
  AggregatedGroundTruthResult,
  GroundTruthKind,
} from "./types.js";

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function meanNullable(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return mean(nums);
}

function headlineScoresByRepetition(results: EvalResult[]): number[] {
  const byRepetition = new Map<number, EvalResult[]>();
  for (const result of results) {
    const runs = byRepetition.get(result.repetition) ?? [];
    runs.push(result);
    byRepetition.set(result.repetition, runs);
  }

  return Array.from(byRepetition.entries())
    .sort(([a], [b]) => a - b)
    .map(([, runs]) => mean(runs.map((r) => r.score)));
}

function headlineDurationsByRepetition(results: EvalResult[]): number[] {
  const byRepetition = new Map<number, EvalResult[]>();
  for (const result of results) {
    const runs = byRepetition.get(result.repetition) ?? [];
    runs.push(result);
    byRepetition.set(result.repetition, runs);
  }

  return Array.from(byRepetition.entries())
    .sort(([a], [b]) => a - b)
    .map(([, runs]) => mean(runs.map((r) => r.metrics.sessionDurationMs)));
}

/**
 * Collapse repeated runs into one row per (task, config) pair.
 * Each numeric metric is the arithmetic mean across repetitions.
 */
export function aggregateByTask(results: EvalResult[]): AggregatedTaskResult[] {
  const groups = new Map<string, EvalResult[]>();
  for (const r of results) {
    const key = `${r.taskId}::${r.runConfigId}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const aggregated: AggregatedTaskResult[] = [];
  for (const runs of groups.values()) {
    const first = runs[0];
    const hasFindVulns = runs.some((r) => !r.error && "recall" in r.details);
    const groundTruths = new Set(runs.map((run) => run.groundTruth));
    if (groundTruths.size !== 1) {
      throw new Error(
        `Task aggregate "${first.taskId}::${first.runConfigId}" mixes ground-truth generations`,
      );
    }

    aggregated.push({
      taskId: first.taskId,
      taskName: first.taskName,
      runConfigId: first.runConfigId,
      runConfigName: first.runConfigName,
      runConfigType: first.runConfigType,
      groundTruth: first.groundTruth,
      effort: first.effort,
      thinking: first.thinking,
      repetitions: runs.length,
      score: mean(runs.map((r) => r.score)),
      scoreStdDev: sampleStdDev(runs.map((r) => r.score)),
      recall: hasFindVulns
        ? mean(runs.filter((r) => !r.error && "recall" in r.details).map((r) => (r.details as FindVulnsDetails).recall))
        : null,
      precision: hasFindVulns
        ? mean(runs.filter((r) => !r.error && "recall" in r.details).map((r) => (r.details as FindVulnsDetails).precision))
        : null,
      sessionDurationMs: mean(runs.map((r) => r.metrics.sessionDurationMs)),
      sessionDurationStdDevMs: sampleStdDev(runs.map((r) => r.metrics.sessionDurationMs)),
      totalTokens: mean(runs.map((r) => r.metrics.totalLogicalInputTokens + r.metrics.totalOutputTokens)),
      totalCostUsd: meanNullable(runs.map((r) => r.metrics.totalCostUsd)),
    });
  }

  return aggregated;
}

function aggregateConfigMetrics(
  tasks: AggregatedTaskResult[],
  rawRuns: EvalResult[],
): AggregatedGroundTruthResult {
  const hasRecall = tasks.some((task) => task.recall != null);
  const repetitionScores = headlineScoresByRepetition(rawRuns);
  const repetitionDurations = headlineDurationsByRepetition(rawRuns);
  return {
    fixtureCount: tasks.length,
    repetitions: repetitionScores.length,
    score: mean(tasks.map((task) => task.score)),
    scoreStdDev: sampleStdDev(repetitionScores),
    recall: hasRecall ? meanNullable(tasks.map((task) => task.recall)) : null,
    precision: hasRecall ? meanNullable(tasks.map((task) => task.precision)) : null,
    sessionDurationMs: mean(tasks.map((task) => task.sessionDurationMs)),
    sessionDurationStdDevMs: sampleStdDev(repetitionDurations),
    totalTokens: mean(tasks.map((task) => task.totalTokens)),
    totalCostUsd: meanNullable(tasks.map((task) => task.totalCostUsd)),
  };
}

/**
 * Macro-average task-level scores into one headline row per config.
 * Each task contributes equally regardless of how many vulns it contains.
 */
export function aggregateByConfig(
  taskResults: AggregatedTaskResult[],
  results: EvalResult[],
): AggregatedConfigResult[] {
  const groups = new Map<string, AggregatedTaskResult[]>();
  for (const r of taskResults) {
    const arr = groups.get(r.runConfigId) ?? [];
    arr.push(r);
    groups.set(r.runConfigId, arr);
  }

  const rawGroups = new Map<string, EvalResult[]>();
  for (const r of results) {
    const arr = rawGroups.get(r.runConfigId) ?? [];
    arr.push(r);
    rawGroups.set(r.runConfigId, arr);
  }

  const aggregated: AggregatedConfigResult[] = [];
  for (const tasks of groups.values()) {
    const first = tasks[0];
    const rawRuns = rawGroups.get(first.runConfigId) ?? [];
    const overall = aggregateConfigMetrics(tasks, rawRuns);
    const groundTruths = (["v1", "attacker-reachable"] as GroundTruthKind[])
      .filter((groundTruth) => tasks.some((task) => task.groundTruth === groundTruth));
    const byGroundTruth: Partial<Record<GroundTruthKind, AggregatedGroundTruthResult>> = {};
    for (const groundTruth of groundTruths) {
      byGroundTruth[groundTruth] = aggregateConfigMetrics(
        tasks.filter((task) => task.groundTruth === groundTruth),
        rawRuns.filter((run) => run.groundTruth === groundTruth),
      );
    }

    aggregated.push({
      runConfigId: first.runConfigId,
      runConfigName: first.runConfigName,
      runConfigType: first.runConfigType,
      groundTruths,
      byGroundTruth,
      ...overall,
    });
  }

  return aggregated;
}
