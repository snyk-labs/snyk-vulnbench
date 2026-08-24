import assert from "node:assert/strict";
import test from "node:test";
import { aggregateByConfig, aggregateByTask } from "../src/aggregator.js";
import type {
  BenchmarkMetrics,
  EvalResult,
  FindVulnsDetails,
  FixtureMetadata,
  GroundTruthKind,
  AttackerReachableScoreSuite,
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

const fixtureMetadata: FixtureMetadata = {
  schemaVersion: 1,
  id: "test-fixture",
  name: "Test Fixture",
  kind: "api-service",
  languages: ["javascript"],
  frameworks: ["express"],
  runtimes: [{ name: "node" }],
  datastores: [],
  provenance: { origin: "synthetic" },
  todos: [],
};

function run(
  taskId: string,
  groundTruth: GroundTruthKind,
  repetition: number,
  score: number,
): EvalResult {
  const scoreSuite: AttackerReachableScoreSuite | undefined = groundTruth === "attacker-reachable"
    ? {
      lenientEndpointLocalizedF1: {
        truePositives: score,
        falsePositives: 1 - score,
        falseNegatives: 1 - score,
        precision: score,
        recall: score,
        f1: score,
      },
      strictFlowF1: {
        truePositives: score / 2,
        falsePositives: 1 - score / 2,
        falseNegatives: 1 - score / 2,
        precision: score / 2,
        recall: score / 2,
        f1: score / 2,
      },
      detectionOnlyF1: {
        truePositives: score,
        falsePositives: 1 - score,
        falseNegatives: 1 - score,
        precision: score,
        recall: score,
        f1: score,
      },
      endpointRecall: {
        source: { matched: score, total: 1, recall: score },
        sink: { matched: score, total: 1, recall: score },
      },
      fullFlowOverlap: {
        matchedLocationGroups: score * 2,
        totalLocationGroups: 2,
        overlap: score,
      },
    }
    : undefined;
  const details: FindVulnsDetails = {
    agentFindings: [],
    truePositives: [],
    falsePositives: [],
    falseNegatives: [],
    precision: score,
    recall: score,
    byType: {},
    bySeverity: {},
    ...(scoreSuite && { scoreSuite }),
  };
  return {
    taskId,
    taskName: taskId,
    fixtureId: fixtureMetadata.id,
    fixtureMetadata,
    fixtureMetadataHash: "test-metadata-hash",
    runConfigId: "test-config",
    runConfigName: "Test config",
    groundTruth,
    primaryMetric: groundTruth === "attacker-reachable"
      ? "attacker-reachable-vulnerability-recall"
      : "f1",
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
    taskAggregates.map((aggregate) => [
      aggregate.taskId,
      aggregate.groundTruth,
      aggregate.primaryMetric,
    ]),
    [
      ["v1-task", "v1", "f1"],
      ["v2-task", "attacker-reachable", "attacker-reachable-vulnerability-recall"],
    ],
  );
  assert.equal(taskAggregates[0].fixtureId, "test-fixture");
  assert.equal(taskAggregates[0].fixtureMetadataHash, "test-metadata-hash");

  const config = configAggregates[0];
  assert.deepEqual(config.groundTruths, ["v1", "attacker-reachable"]);
  assert.equal(config.fixtureCount, 2);
  assert.equal(config.primaryMetric, null);
  assert.equal(config.score, null);
  assert.equal(config.scoreStdDev, null);
  assert.equal(config.recall, null);
  assert.equal(config.precision, null);
  assert.equal(config.byGroundTruth.v1?.fixtureCount, 1);
  assert.equal(config.byGroundTruth.v1?.primaryMetric, "f1");
  assert.equal(config.byGroundTruth.v1?.score, 0.5);
  assert.equal(config.byGroundTruth.v1?.recall, 0.5);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.fixtureCount, 1);
  assert.equal(
    config.byGroundTruth["attacker-reachable"]?.primaryMetric,
    "attacker-reachable-vulnerability-recall",
  );
  assert.equal(config.byGroundTruth["attacker-reachable"]?.score, 0.9);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.precision, 0.9);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.scoreSuite?.strictFlowF1.f1, 0.45);
  assert.equal(config.byGroundTruth["attacker-reachable"]?.scoreSuite?.endpointRecall.source.recall, 0.9);
  assert.equal(config.scoreSuite, undefined);
  assert.ok((config.byGroundTruth.v1?.scoreStdDev ?? 0) > 0);
});

test("single-generation config aggregates preserve their primary metric", () => {
  const v2Runs = [
    run("v2-task", "attacker-reachable", 1, 0.5),
    run("v2-task", "attacker-reachable", 2, 1),
  ];
  const aggregate = aggregateByConfig(aggregateByTask(v2Runs), v2Runs)[0];

  assert.equal(
    aggregate.primaryMetric,
    "attacker-reachable-vulnerability-recall",
  );
  assert.equal(aggregate.score, 0.75);
  assert.equal(aggregate.recall, 0.75);
  assert.equal(aggregate.scoreSuite?.lenientEndpointLocalizedF1.recall, 0.75);
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
