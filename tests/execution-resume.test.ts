import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireExecutionLock } from "../src/results/execution-lock.js";
import {
  buildExecutionManifest,
  createExecutionBundle,
  hashValue,
  listRunRecords,
  refreshExecutionProgress,
} from "../src/results/execution-store.js";
import {
  beginExecutionRun,
  checkpointExecution,
  finishExecutionRun,
  initializeExecution,
  reconcileInterruptedRuns,
  validateExecutionInputs,
} from "../src/results/execution-runtime.js";
import type {
  BenchmarkMetrics,
  EvalResult,
  EvalTask,
  RunConfig,
} from "../src/types.js";

const metrics: BenchmarkMetrics = {
  sessionDurationMs: 100,
  totalInputTokens: 2,
  totalOutputTokens: 1,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalLogicalInputTokens: 2,
  totalCostUsd: 0.01,
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

test("execution locks reject live owners and replace stale owners", () => {
  const executionDir = mkdtempSync(join(tmpdir(), "vulnbench-lock-"));
  try {
    const first = acquireExecutionLock(executionDir);
    assert.throws(
      () => acquireExecutionLock(executionDir),
      /already active/,
    );
    first.release();

    writeFileSync(
      join(executionDir, ".execution.lock"),
      JSON.stringify({
        pid: 2_147_483_647,
        hostname: hostname(),
        startedAt: new Date().toISOString(),
        ownerToken: "stale",
      }),
    );
    const replacement = acquireExecutionLock(executionDir);
    assert.notEqual(replacement.metadata.ownerToken, "stale");
    replacement.release();
  } finally {
    rmSync(executionDir, { recursive: true, force: true });
  }
});

test("stale running attempts become explicit uncertain interruptions", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-interrupted-"));
  try {
    const manifest = buildExecutionManifest({
      codename: "resume",
      argv: [],
      selection: {
        category: null,
        configGroup: null,
        taskIds: ["task"],
        configIds: ["config"],
        repetitions: 1,
      },
      source: {
        gitCommit: null,
        dirtyFingerprint: null,
        harnessFingerprint: hashValue("harness"),
      },
      plannedRuns: [{
        taskId: "task",
        taskName: "Task",
        fixtureId: "fixture",
        runConfigId: "config",
        runConfigName: "Config",
        repetition: 1,
        totalRepetitions: 1,
        taskFingerprint: hashValue("task"),
        configFingerprint: hashValue("config"),
      }],
      taskSnapshots: {},
      configSnapshots: {},
      shortId: "resume",
    });
    const executionDir = createExecutionBundle(root, manifest);
    beginExecutionRun(
      executionDir,
      manifest.plannedRuns[0],
      "2026-09-01T10:00:00.000Z",
    );
    reconcileInterruptedRuns(executionDir, "2026-09-01T10:05:00.000Z");

    const interrupted = listRunRecords(executionDir)[0];
    assert.equal(interrupted.status, "interrupted-uncertain");
    assert.equal(interrupted.attempts[0].failure?.kind, "interrupted");
    assert.equal(
      refreshExecutionProgress(executionDir).counts["interrupted-uncertain"],
      1,
    );

    const retry = beginExecutionRun(
      executionDir,
      manifest.plannedRuns[0],
      "2026-09-01T10:06:00.000Z",
    );
    assert.equal(retry.attempts.length, 2);
    assert.equal(retry.attempts[1].attempt, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("successful work cannot be started twice", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-no-duplicate-"));
  try {
    const { executionDir, manifest } = createMinimalExecution(root);
    const spec = manifest.plannedRuns[0];
    const running = beginExecutionRun(executionDir, spec);
    const result = fakeResult(spec.taskId, spec.runConfigId);
    finishExecutionRun(executionDir, running, result);
    checkpointExecution(executionDir, root);

    assert.throws(
      () => beginExecutionRun(executionDir, spec),
      /cannot start from status "succeeded"/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution input fingerprints detect project changes", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-fingerprint-"));
  const projectDir = join(root, "project");
  const resultsDir = join(root, "results");
  try {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "app.js"), "const value = 1;\n");
    const task = fakeTask(projectDir);
    const config: RunConfig = {
      id: "config",
      name: "Config",
      model: "model",
      effort: "high",
    };
    const input = {
      projectRoot: root,
      resultsDir,
      argv: [],
      tasks: [task],
      configs: [config],
      compatibleTasks: new Map([["config", [task]]]),
      repetitions: 1,
    };
    const execution = initializeExecution(input);
    validateExecutionInputs(execution.manifest, input);

    writeFileSync(join(projectDir, "app.js"), "const value = 2;\n");
    assert.throws(
      () => validateExecutionInputs(execution.manifest, input),
      /do not match the execution manifest/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createMinimalExecution(root: string) {
  const manifest = buildExecutionManifest({
    codename: "minimal",
    argv: [],
    selection: {
      category: null,
      configGroup: null,
      taskIds: ["task"],
      configIds: ["config"],
      repetitions: 1,
    },
    source: {
      gitCommit: null,
      dirtyFingerprint: null,
      harnessFingerprint: hashValue("harness"),
    },
    plannedRuns: [{
      taskId: "task",
      taskName: "Task",
      fixtureId: "fixture",
      runConfigId: "config",
      runConfigName: "Config",
      repetition: 1,
      totalRepetitions: 1,
      taskFingerprint: hashValue("task"),
      configFingerprint: hashValue("config"),
    }],
    taskSnapshots: {},
    configSnapshots: {},
    shortId: "minimal",
  });
  return {
    manifest,
    executionDir: createExecutionBundle(join(root, "executions"), manifest),
  };
}

function fakeResult(taskId: string, runConfigId: string): EvalResult {
  return {
    taskId,
    taskName: "Task",
    fixtureId: "fixture",
    fixtureMetadata: fakeTask(".").fixtureMetadata,
    fixtureMetadataHash: "fixture-hash",
    runConfigId,
    runConfigName: "Config",
    runnerId: "claude-code",
    runnerVersion: null,
    runnerCapabilities: { findVulns: true, fixVulns: true, mcp: false },
    requestedModel: "model",
    groundTruth: "v1",
    primaryMetric: "f1",
    runConfigType: "model",
    effort: "high",
    thinking: { type: "adaptive" },
    promptTemplateId: "default",
    score: 0,
    metrics,
    details: {
      agentFindings: [],
      truePositives: [],
      falsePositives: [],
      falseNegatives: [],
      precision: 0,
      recall: 0,
      byType: {},
      bySeverity: {},
    },
    timestamp: new Date().toISOString(),
    repetition: 1,
    totalRepetitions: 1,
  };
}

function fakeTask(projectDir: string): EvalTask {
  return {
    id: "task",
    name: "Task",
    fixture: projectDir,
    fixtureId: "fixture",
    fixtureMetadata: {
      schemaVersion: 1,
      id: "fixture",
      name: "Fixture",
      kind: "api-service",
      languages: ["javascript"],
      frameworks: [],
      runtimes: [{ name: "node" }],
      datastores: [],
      provenance: { origin: "synthetic" },
      todos: [],
    },
    fixtureMetadataHash: "fixture-hash",
    category: {
      id: "find-vulns",
      name: "Find",
      description: "Find",
      defaultSystemPrompt: "system",
      defaultPrompt: "prompt",
    },
    systemPrompt: "system",
    prompt: "prompt",
    groundTruth: "v1",
    knownVulns: [],
  };
}

