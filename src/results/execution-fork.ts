import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import type { EvalResult } from "../types.js";
import {
  atomicWriteJson,
  createExecutionBundle,
  hashValue,
  listRunRecords,
  readExecutionManifest,
  reconcileExecutionProgress,
  writeRunRecord,
} from "./execution-store.js";
import {
  checkpointExecution,
  planExecution,
  type NewExecutionInput,
} from "./execution-runtime.js";
import type {
  ExecutionAttempt,
  ExecutionForkLineage,
  ExecutionManifest,
  ExecutionRunRecord,
  ExecutionRunStatus,
  ExecutionUsageSummary,
  PlannedExecutionRun,
} from "./execution-types.js";

export interface ForkExecutionOptions {
  parentDir: string;
  executionsRoot: string;
  childInput: NewExecutionInput;
  resetPhaseId: string;
  expectedImported: number;
  expectedPending: number;
  create: boolean;
  now?: Date;
  shortId?: string;
  testHooks?: {
    failAfterImportedRuns?: number;
  };
}

export interface ForkImportMapping {
  parentRunKey: string;
  childRunKey: string;
  taskId: string;
  runConfigId: string;
  repetition: number;
}

export interface ForkDiscardedRecord {
  parentRunKey: string;
  status: ExecutionRunStatus;
  taskId: string;
  runConfigId: string;
}

export interface ForkExecutionReport {
  parentExecutionId: string;
  parentIntegrityHash: string;
  parentManifestHash: string;
  parentRunLedgerHash: string;
  childManifest: ExecutionManifest;
  imported: ForkImportMapping[];
  discarded: ForkDiscardedRecord[];
  pendingRuns: number;
  childDir?: string;
}

export function forkExecutionBundle(
  options: ForkExecutionOptions,
): ForkExecutionReport {
  assertForkInputs(options);
  if (existsSync(join(options.parentDir, ".execution.lock"))) {
    throw new Error("Parent execution is locked; fork only a paused execution");
  }
  const parentManifest = readExecutionManifest(options.parentDir);
  const parentRecords = listRunRecords(options.parentDir);
  const before = authoritativeExecutionHash(options.parentDir);
  const now = options.now ?? new Date();
  const importedAt = now.toISOString();

  const provisional = planExecution(options.childInput, {
    codename: options.childInput.selectedGroup?.id ?? "fork",
    now,
    shortId: options.shortId,
  });
  validatePlanCompatibility(
    parentManifest,
    provisional,
    options.resetPhaseId,
  );
  const parentRecordsByLogicalKey = new Map(
    parentRecords.map((record) => [logicalRunKey(record.spec), record]),
  );
  const parentPlanByLogicalKey = new Map(
    parentManifest.plannedRuns.map((run) => [logicalRunKey(run), run]),
  );
  const imported: ForkImportMapping[] = [];
  const importRecords: Array<{
    parent: ExecutionRunRecord;
    childSpec: PlannedExecutionRun;
  }> = [];

  for (const childSpec of provisional.plannedRuns) {
    if (childSpec.phaseId === options.resetPhaseId) continue;
    const key = logicalRunKey(childSpec);
    const parentSpec = parentPlanByLogicalKey.get(key);
    const parentRecord = parentRecordsByLogicalKey.get(key);
    if (!parentSpec || !parentRecord) {
      throw new Error(`Missing parent record for reusable run "${key}"`);
    }
    if (parentRecord.status !== "succeeded" || !parentRecord.result) {
      throw new Error(`Reusable parent run "${key}" is not a successful result`);
    }
    if (
      parentSpec.taskFingerprint !== childSpec.taskFingerprint
      || parentSpec.configFingerprint !== childSpec.configFingerprint
    ) {
      throw new Error(`Fingerprint mismatch for reusable run "${key}"`);
    }
    importRecords.push({ parent: parentRecord, childSpec });
    imported.push({
      parentRunKey: parentRecord.runKey,
      childRunKey: childSpec.runKey,
      taskId: childSpec.taskId,
      runConfigId: childSpec.runConfigId,
      repetition: childSpec.repetition,
    });
  }

  const resetParentRecords = parentRecords.filter((record) =>
    record.spec.phaseId === options.resetPhaseId
  );
  const discarded = resetParentRecords.map((record) => ({
    parentRunKey: record.runKey,
    status: record.status,
    taskId: record.spec.taskId,
    runConfigId: record.spec.runConfigId,
  }));
  const pendingRuns = provisional.plannedRuns.length - imported.length;
  if (imported.length !== options.expectedImported) {
    throw new Error(
      `Expected ${options.expectedImported} imported runs, found ${imported.length}`,
    );
  }
  if (pendingRuns !== options.expectedPending) {
    throw new Error(
      `Expected ${options.expectedPending} pending runs, found ${pendingRuns}`,
    );
  }

  const lineage: ExecutionForkLineage = {
    kind: "fork",
    parentExecutionId: parentManifest.executionId,
    parentPlanFingerprint: parentManifest.planFingerprint,
    parentSource: parentManifest.source,
    parentManifestHash: before.manifestHash,
    parentRunLedgerHash: before.runLedgerHash,
    forkedAt: importedAt,
    resetPhaseId: options.resetPhaseId,
    importSummary: {
      importedRuns: imported.length,
      discardedRuns: discarded.length,
      discardedByStatus: countStatuses(resetParentRecords),
      discardedUsage: attemptedUsage(resetParentRecords),
    },
  };
  const childManifest = planExecution(options.childInput, {
    codename: options.childInput.selectedGroup?.id ?? "fork",
    now,
    shortId: options.shortId,
    lineage,
  });
  if (
    childManifest.planFingerprint !== provisional.planFingerprint
    || childManifest.plannedRuns.some(
      (run, index) => run.runKey !== provisional.plannedRuns[index]?.runKey,
    )
  ) {
    throw new Error("Fork lineage unexpectedly changed the child execution plan");
  }

  const report: ForkExecutionReport = {
    parentExecutionId: parentManifest.executionId,
    parentIntegrityHash: before.combinedHash,
    parentManifestHash: before.manifestHash,
    parentRunLedgerHash: before.runLedgerHash,
    childManifest,
    imported,
    discarded,
    pendingRuns,
  };
  if (!options.create) {
    assertParentUnchanged(options.parentDir, before.combinedHash);
    return report;
  }

  mkdirSync(options.executionsRoot, { recursive: true });
  const finalDir = join(options.executionsRoot, childManifest.executionId);
  if (existsSync(finalDir)) {
    throw new Error(`Child execution already exists at ${finalDir}`);
  }
  const stagingRoot = mkdtempSync(
    join(options.executionsRoot, ".fork-staging-"),
  );
  let published = false;
  try {
    const stagedChildDir = createExecutionBundle(stagingRoot, childManifest);
    for (let index = 0; index < importRecords.length; index++) {
      const { parent, childSpec } = importRecords[index];
      writeRunRecord(stagedChildDir, {
        ...parent,
        executionId: childManifest.executionId,
        runKey: childSpec.runKey,
        spec: childSpec,
        importedFrom: {
          parentExecutionId: parentManifest.executionId,
          parentRunKey: parent.runKey,
          parentPlanFingerprint: parentManifest.planFingerprint,
          parentSource: parentManifest.source,
          importedAt,
        },
        updatedAt: importedAt,
      });
      if (
        options.testHooks?.failAfterImportedRuns !== undefined
        && index + 1 >= options.testHooks.failAfterImportedRuns
      ) {
        throw new Error("Injected fork import failure");
      }
    }
    checkpointExecution(stagedChildDir);
    const stagedProgress = reconcileExecutionProgress(
      childManifest,
      listRunRecords(stagedChildDir),
    );
    if (
      stagedProgress.counts.succeeded !== options.expectedImported
      || stagedProgress.counts.pending !== options.expectedPending
      || stagedProgress.counts.failed !== 0
      || stagedProgress.counts["interrupted-uncertain"] !== 0
    ) {
      throw new Error("Staged child progress failed fork invariants");
    }
    atomicWriteJson(join(stagedChildDir, "artifacts", "fork-audit.json"), {
      ...report,
      childManifest: undefined,
    });
    assertParentUnchanged(options.parentDir, before.combinedHash);
    renameSync(stagedChildDir, finalDir);
    published = true;
    assertParentUnchanged(options.parentDir, before.combinedHash);
    report.childDir = finalDir;
    return report;
  } catch (error) {
    if (published) rmSync(finalDir, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export function authoritativeExecutionHash(executionDir: string): {
  manifestHash: string;
  runLedgerHash: string;
  combinedHash: string;
} {
  const manifestHash = hashFile(join(executionDir, "manifest.json"));
  const runsDir = join(executionDir, "runs");
  const files = existsSync(runsDir) ? recursiveJsonFiles(runsDir) : [];
  const ledger = createHash("sha256");
  for (const path of files) {
    ledger.update(relative(runsDir, path));
    ledger.update(readFileSync(path));
  }
  const runLedgerHash = ledger.digest("hex");
  return {
    manifestHash,
    runLedgerHash,
    combinedHash: hashValue({ manifestHash, runLedgerHash }),
  };
}

function validatePlanCompatibility(
  parent: ExecutionManifest,
  child: ExecutionManifest,
  resetPhaseId: string,
): void {
  if (parent.selection.category !== child.selection.category) {
    throw new Error("Parent and child categories differ");
  }
  if (
    parent.selection.repetitions !== child.selection.repetitions
    || JSON.stringify(parent.selection.taskIds) !== JSON.stringify(child.selection.taskIds)
    || parent.plannedRuns.length !== child.plannedRuns.length
  ) {
    throw new Error("Parent and child task/repetition plans differ");
  }
  const parentPhases = parent.phases ?? [];
  const childPhases = child.phases ?? [];
  if (
    !parentPhases.some((phase) => phase.id === resetPhaseId)
    || !childPhases.some((phase) => phase.id === resetPhaseId)
    || JSON.stringify(parentPhases.map((phase) => phase.id))
      !== JSON.stringify(childPhases.map((phase) => phase.id))
  ) {
    throw new Error(`Reset phase "${resetPhaseId}" is not aligned`);
  }
  const reusableParentConfigs = parentPhases
    .filter((phase) => phase.id !== resetPhaseId)
    .flatMap((phase) => phase.configIds);
  const reusableChildConfigs = childPhases
    .filter((phase) => phase.id !== resetPhaseId)
    .flatMap((phase) => phase.configIds);
  if (JSON.stringify(reusableParentConfigs) !== JSON.stringify(reusableChildConfigs)) {
    throw new Error("Non-reset phase config identities differ");
  }
  const resetRuns = child.plannedRuns.filter((run) =>
    run.phaseId === resetPhaseId
  );
  if (resetRuns.length === 0) {
    throw new Error(`Child reset phase "${resetPhaseId}" has no runs`);
  }
}

function logicalRunKey(
  run: Pick<PlannedExecutionRun, "taskId" | "runConfigId" | "repetition">,
): string {
  return `${run.taskId}\u0000${run.runConfigId}\u0000${run.repetition}`;
}

function recursiveJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return recursiveJsonFiles(path);
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    })
    .sort();
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function countStatuses(
  records: ExecutionRunRecord[],
): Partial<Record<ExecutionRunStatus, number>> {
  const counts: Partial<Record<ExecutionRunStatus, number>> = {};
  for (const record of records) {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
  }
  return counts;
}

function attemptedUsage(records: ExecutionRunRecord[]): ExecutionUsageSummary {
  const usage: ExecutionUsageSummary = {
    logicalInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    attemptsWithUnknownCost: 0,
  };
  for (const attempt of records.flatMap((record) => record.attempts)) {
    addAttemptUsage(usage, attempt);
  }
  return usage;
}

function addAttemptUsage(
  usage: ExecutionUsageSummary,
  attempt: ExecutionAttempt,
): void {
  if (!attempt.metrics) {
    if (attempt.status !== "running") usage.attemptsWithUnknownCost++;
    return;
  }
  usage.logicalInputTokens += attempt.metrics.totalLogicalInputTokens;
  usage.outputTokens += attempt.metrics.totalOutputTokens;
  if (attempt.metrics.totalCostUsd == null) usage.attemptsWithUnknownCost++;
  else usage.costUsd += attempt.metrics.totalCostUsd;
}

function assertParentUnchanged(
  parentDir: string,
  expectedHash: string,
): void {
  const current = authoritativeExecutionHash(parentDir).combinedHash;
  if (current !== expectedHash) {
    throw new Error("Parent execution changed during fork planning");
  }
}

function assertForkInputs(options: ForkExecutionOptions): void {
  if (!Number.isInteger(options.expectedImported) || options.expectedImported < 1) {
    throw new Error("expectedImported must be a positive integer");
  }
  if (!Number.isInteger(options.expectedPending) || options.expectedPending < 1) {
    throw new Error("expectedPending must be a positive integer");
  }
  if (!options.resetPhaseId) throw new Error("resetPhaseId is required");
}

