import type {
  EvalResult,
  FindVulnsDetails,
  AggregatedTaskResult,
  AggregatedConfigResult,
  AggregatedGroundTruthResult,
  AttackerReachableScoreSuite,
  GroundTruthKind,
  PrimaryMetricKind,
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

function meanScoreSuites(
  suites: AttackerReachableScoreSuite[],
): AttackerReachableScoreSuite | undefined {
  if (suites.length === 0) return undefined;
  const meanF1 = (key: "lenientEndpointLocalizedF1" | "strictFlowF1" | "detectionOnlyF1") => ({
    truePositives: mean(suites.map((suite) => suite[key].truePositives)),
    falsePositives: mean(suites.map((suite) => suite[key].falsePositives)),
    falseNegatives: mean(suites.map((suite) => suite[key].falseNegatives)),
    precision: mean(suites.map((suite) => suite[key].precision)),
    recall: mean(suites.map((suite) => suite[key].recall)),
    f1: mean(suites.map((suite) => suite[key].f1)),
  });
  const meanEndpoint = (endpoint: "source" | "sink") => {
    const values = suites.map((suite) => suite.endpointRecall[endpoint]);
    return {
      matched: mean(values.map((value) => value.matched)),
      total: mean(values.map((value) => value.total)),
      recall: meanNullable(values.map((value) => value.recall)),
    };
  };

  return {
    lenientEndpointLocalizedF1: meanF1("lenientEndpointLocalizedF1"),
    strictFlowF1: meanF1("strictFlowF1"),
    detectionOnlyF1: meanF1("detectionOnlyF1"),
    endpointRecall: { source: meanEndpoint("source"), sink: meanEndpoint("sink") },
    fullFlowOverlap: {
      matchedLocationGroups: mean(suites.map((suite) => suite.fullFlowOverlap.matchedLocationGroups)),
      totalLocationGroups: mean(suites.map((suite) => suite.fullFlowOverlap.totalLocationGroups)),
      overlap: meanNullable(suites.map((suite) => suite.fullFlowOverlap.overlap)),
    },
  };
}

function scoreSuitesForResults(results: EvalResult[]): AttackerReachableScoreSuite[] {
  return results.flatMap((result) =>
    !result.error
    && "scoreSuite" in result.details
    && result.details.scoreSuite
      ? [result.details.scoreSuite]
      : []
  );
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
    const primaryMetrics = new Set(runs.map((run) => run.primaryMetric));
    if (primaryMetrics.size !== 1) {
      throw new Error(
        `Task aggregate "${first.taskId}::${first.runConfigId}" mixes primary metrics`,
      );
    }

    aggregated.push({
      taskId: first.taskId,
      taskName: first.taskName,
      fixtureId: first.fixtureId,
      fixtureMetadata: first.fixtureMetadata,
      fixtureMetadataHash: first.fixtureMetadataHash,
      runConfigId: first.runConfigId,
      runConfigName: first.runConfigName,
      runConfigType: first.runConfigType,
      groundTruth: first.groundTruth,
      primaryMetric: first.primaryMetric,
      effort: first.effort,
      thinking: first.thinking,
      promptTemplateId: first.promptTemplateId,
      repetitions: runs.length,
      score: mean(runs.map((r) => r.score)),
      scoreStdDev: sampleStdDev(runs.map((r) => r.score)),
      recall: hasFindVulns
        ? mean(runs.filter((r) => !r.error && "recall" in r.details).map((r) => (r.details as FindVulnsDetails).recall))
        : null,
      precision: hasFindVulns
        ? mean(runs.filter((r) => !r.error && "recall" in r.details).map((r) => (r.details as FindVulnsDetails).precision))
        : null,
      scoreSuite: meanScoreSuites(scoreSuitesForResults(runs)),
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
  const primaryMetrics = [...new Set(tasks.map((task) => task.primaryMetric))];
  const primaryMetric: PrimaryMetricKind | null = primaryMetrics.length === 1
    ? primaryMetrics[0]
    : null;
  const hasComparableHeadline = primaryMetric !== null;
  const hasRecall = hasComparableHeadline && tasks.some((task) => task.recall != null);
  const repetitionScores = hasComparableHeadline
    ? headlineScoresByRepetition(rawRuns)
    : [];
  const repetitionDurations = headlineDurationsByRepetition(rawRuns);
  return {
    primaryMetric,
    fixtureCount: tasks.length,
    repetitions: new Set(rawRuns.map((run) => run.repetition)).size,
    score: hasComparableHeadline ? mean(tasks.map((task) => task.score)) : null,
    scoreStdDev: hasComparableHeadline ? sampleStdDev(repetitionScores) : null,
    recall: hasRecall ? meanNullable(tasks.map((task) => task.recall)) : null,
    precision: hasRecall ? meanNullable(tasks.map((task) => task.precision)) : null,
    scoreSuite: primaryMetric === "attacker-reachable-vulnerability-recall"
      ? meanScoreSuites(tasks.flatMap((task) => task.scoreSuite ? [task.scoreSuite] : []))
      : undefined,
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
      promptTemplateId: first.promptTemplateId,
      groundTruths,
      byGroundTruth,
      ...overall,
    });
  }

  return aggregated;
}
