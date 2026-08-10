import assert from "node:assert/strict";
import test from "node:test";
import { aggregateByConfig, aggregateByTask } from "../src/aggregator.js";
import type {
  BenchmarkMetrics,
  EvalResult,
  FindVulnsDetails,
  GroundTruthKind,
} from "../src/types.js";

const emptyMetrics: BenchmarkMetrics = {
  sessionDurationMs: 1_000,
  totalInputTokens: 100,
  totalOutputTokens: 20,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalLogicalInputTokens: 100,
  totalCostUsd: 0.01,
  totalTurns: 1,
  toolCalls: [],
  toolStats: {},
  filesScanned: [],
};

function run(
  taskId: string,
  groundTruth: GroundTruthKind,
  repetition: number,
  score: number,
): EvalResult {
  const details: FindVulnsDetails = {
    agentFindings: [],
    truePositives: [],
    falsePositives: [],
    falseNegatives: [],
    precision: score,
    recall: score,
    byType: {},
    bySeverity: {},
  };
  return {
    taskId,
    taskName: taskId,
    runConfigId: "test-config",
    runConfigName: "Test config",
    groundTruth,
    runConfigType: "model",
    effort: "high",
    thinking: { type: "adaptive" },
    score,
    metrics: { ...emptyMetrics, sessionDurationMs: repetition * 1_000 },
    details,
    timestamp: "2026-08-09T00:00:00.000Z",
    repetition,
    totalRepetitions: 2,
  };
}

test("aggregates retain task ground truth and config generation breakdowns", () => {
  const runs = [
    run("v1-task", "v1", 1, 0.4),
    run("v1-task", "v1", 2, 0.6),
    run("v2-task", "attacker-reachable", 1, 0.8),
    run("v2-task", "attacker-reachable", 2, 1),
  ];
  const taskAggregates = aggregateByTask(runs);
  const configAggregates = aggregateByConfig(taskAggregates, runs);

  assert.deepEqual(
    taskAggregates.map((aggregate) => [aggregate.taskId, aggregate.groundTruth]),
    [
      ["v1-task", "v1"],
      ["v2-task", "attacker-reachable"],
    ],
  );

  const config = configAggregates[0];
  assert.deepEqual(config.groundTruths, ["v1", "attacker-reachable"]);
  assert.equal(config.fixtureCount, 2);
  assert.equal(config.score, 0.7);
  assert.equal(config.byGroundTruth.v1?.fixtureCount, 1);
  assert.equal(config.byGroundTruth.v1?.score, 0.5);
  assert.equal(config.byGroundTruth.v1?.recall, 0.5);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.fixtureCount, 1);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.score, 0.9);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.precision, 0.9);
  assert.ok((config.byGroundTruth.v1?.scoreStdDev ?? 0) > 0);
});

test("task aggregation rejects mixed ground truth under one task id", () => {
  assert.throws(
    () => aggregateByTask([
      run("mixed-task", "v1", 1, 0.5),
      run("mixed-task", "attacker-reachable", 2, 0.5),
    ]),
    /mixes ground-truth generations/,
  );
});
