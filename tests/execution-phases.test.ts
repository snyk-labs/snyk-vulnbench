import assert from "node:assert/strict";
import test from "node:test";
import {
  configsForPhase,
  resolveExecutionPhase,
  runnableRunsForPhase,
  runsForPhase,
} from "../src/results/execution-phases.js";
import { reconcileExecutionProgress } from "../src/results/execution-store.js";
import type {
  ExecutionManifest,
  ExecutionRunRecord,
  PlannedExecutionRun,
} from "../src/results/execution-types.js";
import type { RunConfig } from "../src/types.js";

const phases = [
  { id: "snyk-code", name: "Snyk Code", configIds: ["snyk"] },
  { id: "claude-code", name: "Claude Code", configIds: ["opus", "sonnet"] },
];

const plannedRuns: PlannedExecutionRun[] = [
  run("snyk-1", 1, "snyk", "snyk-code"),
  run("snyk-2", 2, "snyk", "snyk-code"),
  run("opus-1", 3, "opus", "claude-code"),
  run("sonnet-1", 4, "sonnet", "claude-code"),
];

const manifest = {
  schemaVersion: 1,
  executionId: "execution",
  codename: "test",
  createdAt: "2026-09-01T00:00:00.000Z",
  argv: [],
  selection: {
    category: null,
    configGroup: "test",
    taskIds: ["task"],
    configIds: ["snyk", "opus", "sonnet"],
    repetitions: 1,
  },
  source: {
    gitCommit: null,
    dirtyFingerprint: null,
    harnessFingerprint: "hash",
  },
  budgets: {},
  planFingerprint: "plan",
  phases,
  plannedRuns,
  taskSnapshots: {},
  configSnapshots: {},
} satisfies ExecutionManifest;

test("phase scope preserves the frozen plan and global order", () => {
  const phase = resolveExecutionPhase(manifest, "claude-code");
  const scoped = runsForPhase(manifest, phase);

  assert.deepEqual(scoped.map((run) => run.runKey), ["opus-1", "sonnet-1"]);
  assert.equal(manifest.plannedRuns.length, 4);
  assert.throws(
    () => resolveExecutionPhase(manifest, "missing"),
    /Available: snyk-code, claude-code/,
  );
});

test("phase-scoped preflight receives only matching configs", () => {
  const configs: RunConfig[] = [
    { type: "command", id: "snyk", name: "Snyk", parser: "snyk" },
    { id: "opus", name: "Opus", model: "opus" },
    { id: "sonnet", name: "Sonnet", model: "sonnet" },
  ];
  const phase = resolveExecutionPhase(manifest, "snyk-code");

  assert.deepEqual(
    configsForPhase(configs, phase).map((config) => config.id),
    ["snyk"],
  );
});

test("retries and pending work remain scoped to the selected phase", () => {
  const records = new Map<string, ExecutionRunRecord>([
    ["snyk-1", record(plannedRuns[0], "succeeded")],
    ["snyk-2", record(plannedRuns[1], "failed")],
    ["opus-1", record(plannedRuns[2], "failed")],
  ]);

  const snyk = runnableRunsForPhase(
    manifest,
    records,
    resolveExecutionPhase(manifest, "snyk-code"),
    { retryFailed: true, retryInterrupted: false },
  );
  const claude = runnableRunsForPhase(
    manifest,
    records,
    resolveExecutionPhase(manifest, "claude-code"),
    { retryFailed: false, retryInterrupted: false },
  );

  assert.deepEqual(snyk.map((run) => run.runKey), ["snyk-2"]);
  assert.deepEqual(claude.map((run) => run.runKey), ["sonnet-1"]);
});

test("legacy phase-less manifests expose only the implicit all phase", () => {
  const legacy = {
    ...manifest,
    phases: undefined,
    plannedRuns: manifest.plannedRuns.map(({ phaseId: _phaseId, ...run }) => run),
  };
  const all = resolveExecutionPhase(legacy, "all");

  assert.equal(runsForPhase(legacy, all).length, 4);
  assert.throws(
    () => resolveExecutionPhase(legacy, "claude-code"),
    /Available: all/,
  );
});

test("phase progress completes independently from the global execution", () => {
  const records = [
    record(plannedRuns[0], "succeeded"),
    record(plannedRuns[1], "succeeded"),
  ];
  const progress = reconcileExecutionProgress(
    manifest,
    records,
    "2026-09-01T01:00:00.000Z",
  );

  assert.equal(progress.status, "paused");
  assert.deepEqual(
    progress.phases.map((phase) => ({
      id: phase.id,
      status: phase.status,
      succeeded: phase.counts.succeeded,
      pending: phase.counts.pending,
    })),
    [
      { id: "snyk-code", status: "completed", succeeded: 2, pending: 0 },
      { id: "claude-code", status: "planned", succeeded: 0, pending: 2 },
    ],
  );
});

test("four canonical phases accumulate into one complete 180-run execution", () => {
  const phaseSizes = [
    ["snyk-code", 20],
    ["claude-code", 60],
    ["codex-security", 60],
    ["deepsec", 40],
  ] as const;
  const canonicalPhases = phaseSizes.map(([id]) => ({
    id,
    name: id,
    configIds: [id],
  }));
  const canonicalRuns = phaseSizes.flatMap(([phaseId, size]) =>
    Array.from({ length: size }, (_, index) =>
      run(
        `${phaseId}-${index + 1}`,
        phaseSizes
          .slice(0, phaseSizes.findIndex(([id]) => id === phaseId))
          .reduce((total, [, count]) => total + count, 0) + index + 1,
        phaseId,
        phaseId,
      )
    )
  );
  const canonicalManifest: ExecutionManifest = {
    ...manifest,
    selection: {
      ...manifest.selection,
      configIds: canonicalPhases.flatMap((phase) => phase.configIds),
    },
    phases: canonicalPhases,
    plannedRuns: canonicalRuns,
  };
  const records: ExecutionRunRecord[] = [];
  const cumulative: number[] = [];
  for (const phase of canonicalPhases) {
    records.push(
      ...canonicalRuns
        .filter((spec) => spec.phaseId === phase.id)
        .map((spec) => record(spec, "succeeded")),
    );
    const progress = reconcileExecutionProgress(canonicalManifest, records);
    cumulative.push(progress.counts.succeeded);
  }

  assert.deepEqual(cumulative, [20, 80, 140, 180]);
  assert.equal(
    reconcileExecutionProgress(canonicalManifest, records).status,
    "completed",
  );
});

function run(
  runKey: string,
  ordinal: number,
  runConfigId: string,
  phaseId: string,
): PlannedExecutionRun {
  return {
    runKey,
    ordinal,
    taskId: "task",
    taskName: "Task",
    fixtureId: "fixture",
    runConfigId,
    runConfigName: runConfigId,
    repetition: 1,
    totalRepetitions: 1,
    taskFingerprint: "task",
    configFingerprint: runConfigId,
    phaseId,
  };
}

function record(
  spec: PlannedExecutionRun,
  status: ExecutionRunRecord["status"],
): ExecutionRunRecord {
  return {
    schemaVersion: 1,
    executionId: "execution",
    runKey: spec.runKey,
    spec,
    status,
    attempts: [],
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

