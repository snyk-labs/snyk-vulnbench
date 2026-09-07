import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  authoritativeExecutionHash,
  forkExecutionBundle,
} from "../src/results/execution-fork.js";
import {
  createExecutionBundle,
  listRunRecords,
  readExecutionManifest,
  refreshExecutionProgress,
  writeRunRecord,
} from "../src/results/execution-store.js";
import {
  planExecution,
  type NewExecutionInput,
} from "../src/results/execution-runtime.js";
import type {
  BenchmarkMetrics,
  EvalResult,
  EvalTask,
  RunConfig,
  RunConfigGroup,
} from "../src/types.js";

const metrics: BenchmarkMetrics = {
  sessionDurationMs: 100,
  totalInputTokens: 10,
  totalOutputTokens: 5,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalLogicalInputTokens: 10,
  totalCostUsd: 0.02,
  totalTurns: 1,
  toolCalls: [],
  toolStats: {},
  filesScanned: [],
  mcp: {
    configuredServers: [],
    serverStatuses: [],
    advertisedToolCount: 0,
    toolStats: {},
  },
};

test("fork dry-run is read-only and create atomically imports compatible successes", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-fork-"));
  try {
    const fixture = join(root, "fixture");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "const value = 1;\n");
    const tasks = [fakeTask("task-a", fixture), fakeTask("task-b", fixture)];
    const shared: RunConfig = { id: "shared", name: "Shared", model: "model" };
    const oldDeepSec = deepSecConfig("deepsec-old", 30);
    const newDeepSec = deepSecConfig("deepsec-new", 100);
    const parentInput = executionInput(
      root,
      tasks,
      [shared, oldDeepSec],
      group("parent", ["shared"], ["deepsec-old"]),
    );
    const parentManifest = planExecution(parentInput, {
      now: new Date("2026-09-01T00:00:00.000Z"),
      shortId: "parent",
    });
    const parentDir = createExecutionBundle(
      join(root, "executions"),
      parentManifest,
    );
    for (const spec of parentManifest.plannedRuns.filter((run) =>
      run.runConfigId === "shared" || run.taskId === "task-a"
    )) {
      writeRunRecord(parentDir, successfulRecord(parentManifest, spec));
    }
    const childInput = executionInput(
      root,
      tasks,
      [shared, newDeepSec],
      group("child", ["shared"], ["deepsec-new"]),
    );
    const before = authoritativeExecutionHash(parentDir);
    const dryRun = forkExecutionBundle({
      parentDir,
      executionsRoot: join(root, "children"),
      childInput,
      resetPhaseId: "deepsec",
      expectedImported: 2,
      expectedPending: 2,
      create: false,
      now: new Date("2026-09-02T00:00:00.000Z"),
      shortId: "child",
    });

    assert.equal(dryRun.imported.length, 2);
    assert.equal(dryRun.discarded.length, 1);
    assert.equal(dryRun.pendingRuns, 2);
    assert.equal(existsSync(join(root, "children")), false);
    assert.deepEqual(authoritativeExecutionHash(parentDir), before);

    const created = forkExecutionBundle({
      parentDir,
      executionsRoot: join(root, "children"),
      childInput,
      resetPhaseId: "deepsec",
      expectedImported: 2,
      expectedPending: 2,
      create: true,
      now: new Date("2026-09-02T00:00:00.000Z"),
      shortId: "child",
    });
    assert.ok(created.childDir);
    const childManifest = readExecutionManifest(created.childDir!);
    assert.equal(childManifest.lineage?.parentExecutionId, parentManifest.executionId);
    const childRecords = listRunRecords(created.childDir!);
    assert.equal(childRecords.length, 2);
    assert.ok(childRecords.every((record) => record.importedFrom));
    assert.ok(childRecords.every((record) =>
      !parentManifest.plannedRuns.some((parent) => parent.runKey === record.runKey)
    ));
    const progress = refreshExecutionProgress(created.childDir!);
    assert.equal(progress.counts.succeeded, 2);
    assert.equal(progress.counts.pending, 2);
    assert.deepEqual(authoritativeExecutionHash(parentDir), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fork count mismatch and injected copy failure publish no child", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-fork-failure-"));
  try {
    const fixture = join(root, "fixture");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "const value = 1;\n");
    const tasks = [fakeTask("task-a", fixture)];
    const shared: RunConfig = { id: "shared", name: "Shared", model: "model" };
    const parentInput = executionInput(
      root,
      tasks,
      [shared, deepSecConfig("deepsec-old", 30)],
      group("parent", ["shared"], ["deepsec-old"]),
    );
    const parentManifest = planExecution(parentInput, { shortId: "parent" });
    const parentDir = createExecutionBundle(
      join(root, "executions"),
      parentManifest,
    );
    const sharedSpec = parentManifest.plannedRuns.find((run) =>
      run.runConfigId === "shared"
    )!;
    writeRunRecord(parentDir, successfulRecord(parentManifest, sharedSpec));
    const childInput = executionInput(
      root,
      tasks,
      [shared, deepSecConfig("deepsec-new", 100)],
      group("child", ["shared"], ["deepsec-new"]),
    );
    const children = join(root, "children");

    assert.throws(() => forkExecutionBundle({
      parentDir,
      executionsRoot: children,
      childInput,
      resetPhaseId: "deepsec",
      expectedImported: 140,
      expectedPending: 40,
      create: false,
    }), /Expected 140 imported runs/);
    assert.equal(existsSync(children), false);

    assert.throws(() => forkExecutionBundle({
      parentDir,
      executionsRoot: children,
      childInput,
      resetPhaseId: "deepsec",
      expectedImported: 1,
      expectedPending: 1,
      create: true,
      shortId: "injected",
      testHooks: { failAfterImportedRuns: 1 },
    }), /Injected fork import failure/);
    assert.deepEqual(
      existsSync(children) ? readdirSync(children) : [],
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function executionInput(
  root: string,
  tasks: EvalTask[],
  configs: RunConfig[],
  selectedGroup: RunConfigGroup,
): NewExecutionInput {
  return {
    projectRoot: root,
    resultsDir: join(root, "results"),
    argv: [],
    tasks,
    configs,
    compatibleTasks: new Map(
      configs.map((config) => [config.id, tasks]),
    ),
    repetitions: 1,
    selectedGroup,
    selectedCategory: "find-vulns",
    budgets: {},
  };
}

function group(
  id: string,
  reusableConfigs: string[],
  resetConfigs: string[],
): RunConfigGroup {
  return {
    id,
    name: id,
    configIds: [...reusableConfigs, ...resetConfigs],
    phases: [
      { id: "reusable", name: "Reusable", configIds: reusableConfigs },
      { id: "deepsec", name: "DeepSec", configIds: resetConfigs },
    ],
    category: "find-vulns",
    defaultRepetitions: 1,
  };
}

function deepSecConfig(id: string, maxTurns: number): RunConfig {
  return {
    type: "deepsec",
    id,
    name: id,
    agent: "claude",
    model: "model",
    thinkingLevel: "xhigh",
    maxTurns,
  };
}

function fakeTask(id: string, fixture: string): EvalTask {
  return {
    id,
    name: id,
    category: {
      id: "find-vulns",
      name: "Find",
      description: "Find",
      defaultSystemPrompt: "system",
      defaultPrompt: "prompt",
    },
    fixture,
    fixtureId: id,
    fixtureMetadata: {
      schemaVersion: 1,
      id,
      name: id,
      kind: "api-service",
      languages: ["javascript"],
      frameworks: [],
      runtimes: [{ name: "node" }],
      datastores: [],
      provenance: { origin: "synthetic" },
      todos: [],
    },
    fixtureMetadataHash: id,
    prompt: "prompt",
    groundTruth: "v1",
    knownVulns: [],
  };
}

function successfulRecord(
  manifest: ReturnType<typeof planExecution>,
  spec: ReturnType<typeof planExecution>["plannedRuns"][number],
): ExecutionRunRecordWithResult {
  const result: EvalResult = {
    taskId: spec.taskId,
    taskName: spec.taskName,
    fixtureId: spec.fixtureId,
    fixtureMetadata: fakeTask(spec.fixtureId, ".").fixtureMetadata,
    fixtureMetadataHash: spec.taskFingerprint,
    runConfigId: spec.runConfigId,
    runConfigName: spec.runConfigName,
    runnerId: "test",
    runnerVersion: null,
    runnerCapabilities: { findVulns: true, fixVulns: false, mcp: false },
    requestedModel: "model",
    groundTruth: "v1",
    primaryMetric: "f1",
    runConfigType: "model",
    effort: "high",
    thinking: null,
    promptTemplateId: null,
    score: 1,
    metrics,
    details: {
      agentFindings: [],
      truePositives: [],
      falsePositives: [],
      falseNegatives: [],
      precision: 1,
      recall: 1,
      byType: {},
      bySeverity: {},
    },
    timestamp: "2026-09-01T00:00:00.000Z",
    repetition: spec.repetition,
    totalRepetitions: spec.totalRepetitions,
  };
  return {
    schemaVersion: 1,
    executionId: manifest.executionId,
    runKey: spec.runKey,
    spec,
    status: "succeeded",
    attempts: [{
      attempt: 1,
      status: "succeeded",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:00:01.000Z",
      metrics,
    }],
    result,
    updatedAt: "2026-09-01T00:00:01.000Z",
  };
}

type ExecutionRunRecordWithResult = ReturnType<
  typeof listRunRecords
>[number] & { result: EvalResult };

