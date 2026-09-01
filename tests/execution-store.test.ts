import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  atomicWriteJson,
  buildExecutionManifest,
  createExecutionBundle,
  executionPhases,
  hashValue,
  listRunRecords,
  readExecutionManifest,
  reconcileExecutionProgress,
  refreshExecutionProgress,
  writeRunRecord,
} from "../src/results/execution-store.js";
import {
  readBenchmarkResults,
  writeBenchmarkJsonl,
} from "../src/results/results-io.js";
import {
  beginExecutionRun,
  checkpointExecution,
  finishExecutionRun,
} from "../src/results/execution-runtime.js";
import type {
  ExecutionRunRecord,
  PlannedExecutionRun,
} from "../src/results/execution-types.js";
import type { BenchmarkMetrics, EvalResult } from "../src/types.js";

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

function plannedRun() {
  return {
    taskId: "task-one",
    taskName: "Task One",
    fixtureId: "fixture-one",
    runConfigId: "config-one",
    runConfigName: "Config One",
    repetition: 1,
    totalRepetitions: 1,
    taskFingerprint: hashValue({ task: 1 }),
    configFingerprint: hashValue({ config: 1 }),
  };
}

function manifest() {
  return buildExecutionManifest({
    codename: "VulnBench V2",
    argv: ["--config-group", "vulnbench-v2", "--token", "secret-value"],
    selection: {
      category: "attacker-reachable-find-vulns",
      configGroup: "vulnbench-v2",
      taskIds: ["task-one"],
      configIds: ["config-one"],
      repetitions: 1,
    },
    source: {
      gitCommit: "abc123",
      dirtyFingerprint: null,
      harnessFingerprint: hashValue("harness"),
    },
    plannedRuns: [plannedRun()],
    taskSnapshots: { "task-one": { prompt: "review" } },
    configSnapshots: {
      "config-one": {
        model: "model-one",
        ANTHROPIC_AUTH_TOKEN: "do-not-store",
      },
    },
    now: new Date("2026-09-01T10:00:00.000Z"),
    shortId: "a1b2c3d4",
  });
}

function successfulRecord(
  executionId: string,
  spec: PlannedExecutionRun,
): ExecutionRunRecord {
  return {
    schemaVersion: 1,
    executionId,
    runKey: spec.runKey,
    spec,
    status: "succeeded",
    attempts: [{
      attempt: 1,
      status: "succeeded",
      startedAt: "2026-09-01T10:01:00.000Z",
      completedAt: "2026-09-01T10:01:01.000Z",
      metrics,
    }],
    result: {
      taskId: spec.taskId,
      runConfigId: spec.runConfigId,
      repetition: spec.repetition,
      totalRepetitions: spec.totalRepetitions,
      metrics,
      score: 1,
      details: {},
    } as unknown as EvalResult,
    updatedAt: "2026-09-01T10:01:01.000Z",
  };
}

test("execution manifests are deterministic, versioned, and redact secrets", () => {
  const first = manifest();
  const second = manifest();

  assert.equal(first.schemaVersion, 1);
  assert.equal(first.executionId, "20260901-vulnbench-v2-a1b2c3d4");
  assert.equal(first.planFingerprint, second.planFingerprint);
  assert.equal(first.plannedRuns[0].runKey, second.plannedRuns[0].runKey);
  assert.equal(
    (first.configSnapshots["config-one"] as Record<string, unknown>)
      .ANTHROPIC_AUTH_TOKEN,
    "[REDACTED]",
  );
  assert.equal(first.argv.at(-1), "[REDACTED]");
  assert.deepEqual(executionPhases(first), [{
    id: "all",
    name: "All configs",
    configIds: ["config-one"],
  }]);
});

test("new phase metadata is frozen into the plan fingerprint", () => {
  const base = {
    codename: "phased",
    argv: [],
    selection: {
      category: null,
      configGroup: "phased",
      taskIds: ["task-one"],
      configIds: ["config-one"],
      repetitions: 1,
    },
    source: {
      gitCommit: "abc123",
      dirtyFingerprint: null,
      harnessFingerprint: hashValue("harness"),
    },
    plannedRuns: [{ ...plannedRun(), phaseId: "phase-one" }],
    taskSnapshots: {},
    configSnapshots: {},
    phases: [{
      id: "phase-one",
      name: "Phase One",
      configIds: ["config-one"],
    }],
    shortId: "phased",
  };
  const phased = buildExecutionManifest(base);
  const renamed = buildExecutionManifest({
    ...base,
    plannedRuns: [{ ...plannedRun(), phaseId: "renamed" }],
    phases: [{
      id: "renamed",
      name: "Renamed",
      configIds: ["config-one"],
    }],
  });

  assert.equal(phased.plannedRuns[0].phaseId, "phase-one");
  assert.notEqual(phased.planFingerprint, renamed.planFingerprint);
  assert.notEqual(phased.plannedRuns[0].runKey, renamed.plannedRuns[0].runKey);
});

test("duplicate work items are rejected before an execution starts", () => {
  assert.throws(
    () => buildExecutionManifest({
      codename: "duplicate",
      argv: [],
      selection: {
        category: null,
        configGroup: null,
        taskIds: ["task-one"],
        configIds: ["config-one"],
        repetitions: 1,
      },
      source: {
        gitCommit: null,
        dirtyFingerprint: null,
        harnessFingerprint: hashValue("harness"),
      },
      plannedRuns: [plannedRun(), plannedRun()],
      taskSnapshots: {},
      configSnapshots: {},
      shortId: "duplicate",
    }),
    /Duplicate execution run key/,
  );
});

test("run records reconstruct progress and observed attempted spend", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-execution-"));
  try {
    const expectedManifest = manifest();
    const executionDir = createExecutionBundle(root, expectedManifest);
    const loadedManifest = readExecutionManifest(executionDir);
    const record = successfulRecord(
      loadedManifest.executionId,
      loadedManifest.plannedRuns[0],
    );
    writeRunRecord(executionDir, record);

    const records = listRunRecords(executionDir);
    const progress = reconcileExecutionProgress(
      loadedManifest,
      records,
      "2026-09-01T10:02:00.000Z",
    );
    assert.equal(progress.status, "completed");
    assert.equal(progress.counts.succeeded, 1);
    assert.equal(progress.observedUsage.logicalInputTokens, 10);
    assert.equal(progress.observedUsage.outputTokens, 5);
    assert.equal(progress.observedUsage.costUsd, 0.02);

    atomicWriteJson(join(executionDir, "progress.json"), { stale: true });
    assert.deepEqual(refreshExecutionProgress(executionDir).counts, progress.counts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic JSON replacement leaves a complete document and no temp files", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-atomic-"));
  const path = join(root, "state.json");
  try {
    atomicWriteJson(path, { version: 1 });
    atomicWriteJson(path, { version: 2, values: [1, 2, 3] });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      version: 2,
      values: [1, 2, 3],
    });
    assert.deepEqual(
      readdirSync(root).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundle and JSONL readers share the same successful run contract", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-results-io-"));
  try {
    const expectedManifest = manifest();
    const executionDir = createExecutionBundle(root, expectedManifest);
    writeRunRecord(
      executionDir,
      successfulRecord(
        expectedManifest.executionId,
        expectedManifest.plannedRuns[0],
      ),
    );

    const fromBundle = readBenchmarkResults(executionDir);
    assert.equal(fromBundle.runs.length, 1);
    const jsonlPath = join(root, "benchmark.jsonl");
    writeBenchmarkJsonl(jsonlPath, fromBundle);
    const fromJsonl = readBenchmarkResults(jsonlPath);
    assert.deepEqual(fromJsonl.runs, fromBundle.runs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a completed run is checkpointed while later planned work remains pending", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-checkpoint-"));
  try {
    const expectedManifest = buildExecutionManifest({
      codename: "checkpoint",
      argv: [],
      selection: {
        category: null,
        configGroup: null,
        taskIds: ["task-one", "task-two"],
        configIds: ["config-one"],
        repetitions: 1,
      },
      source: {
        gitCommit: "abc123",
        dirtyFingerprint: null,
        harnessFingerprint: hashValue("harness"),
      },
      plannedRuns: [
        plannedRun(),
        {
          ...plannedRun(),
          taskId: "task-two",
          taskName: "Task Two",
          fixtureId: "fixture-two",
          taskFingerprint: hashValue({ task: 2 }),
        },
      ],
      taskSnapshots: {},
      configSnapshots: {},
      shortId: "partial",
    });
    const executionDir = createExecutionBundle(
      join(root, "executions"),
      expectedManifest,
    );
    const spec = expectedManifest.plannedRuns[0];
    const active = beginExecutionRun(
      executionDir,
      spec,
      "2026-09-01T10:01:00.000Z",
    );
    finishExecutionRun(
      executionDir,
      active,
      successfulRecord(expectedManifest.executionId, spec).result!,
      "2026-09-01T10:01:01.000Z",
    );
    const checkpoint = checkpointExecution(
      executionDir,
      root,
      "2026-09-01T10:01:02.000Z",
    );

    assert.equal(checkpoint.aggregates.partial, true);
    assert.deepEqual(checkpoint.aggregates.coverage, {
      succeededRuns: 1,
      plannedRuns: 2,
      failedRuns: 0,
      interruptedRuns: 0,
      phases: [{
        phaseId: "all",
        plannedRuns: 2,
        succeededRuns: 1,
        failedRuns: 0,
        interruptedRuns: 0,
      }],
    });
    const progress = refreshExecutionProgress(executionDir);
    assert.equal(progress.counts.succeeded, 1);
    assert.equal(progress.counts.pending, 1);
    assert.equal(progress.phases[0].status, "paused");
    assert.equal(readBenchmarkResults(executionDir).runs.length, 1);
    assert.equal(
      readBenchmarkResults(checkpoint.compatibilityJsonlPath).runs.length,
      1,
    );
    const jsonlRow = JSON.parse(
      readFileSync(checkpoint.compatibilityJsonlPath, "utf8").trim().split("\n")[0],
    );
    assert.equal(jsonlRow.executionCoverage.phases[0].phaseId, "all");
    assert.equal(jsonlRow.executionCoverage.phases[0].succeededRuns, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

