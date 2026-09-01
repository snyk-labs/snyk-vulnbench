import type {
  AggregatedConfigResult,
  AggregatedTaskResult,
  BenchmarkMetrics,
  EvalResult,
  RunFailure,
} from "../types.js";

export const EXECUTION_SCHEMA_VERSION = 1 as const;

export type ExecutionStatus =
  | "planned"
  | "running"
  | "paused"
  | "completed"
  | "completed-with-failures";

export type ExecutionRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted-uncertain";

export type AttemptStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted-uncertain";

export interface PlannedExecutionRun {
  runKey: string;
  ordinal: number;
  taskId: string;
  taskName: string;
  fixtureId: string;
  runConfigId: string;
  runConfigName: string;
  repetition: number;
  totalRepetitions: number;
  taskFingerprint: string;
  configFingerprint: string;
  /** Frozen phase assignment. Missing only on legacy phase-less manifests. */
  phaseId?: string;
}

export interface ExecutionPhase {
  id: string;
  name: string;
  configIds: string[];
}

export interface ExecutionSourceSnapshot {
  gitCommit: string | null;
  dirtyFingerprint: string | null;
  harnessFingerprint: string;
}

export interface ExecutionSelectionSnapshot {
  category: string | null;
  configGroup: string | null;
  taskIds: string[];
  configIds: string[];
  repetitions: number;
}

export interface ExecutionBudgets {
  maxCostUsd?: number;
  maxTokens?: number;
  maxRunTimeMs?: number;
}

export interface ExecutionManifest {
  schemaVersion: typeof EXECUTION_SCHEMA_VERSION;
  executionId: string;
  codename: string;
  createdAt: string;
  argv: string[];
  selection: ExecutionSelectionSnapshot;
  source: ExecutionSourceSnapshot;
  budgets: ExecutionBudgets;
  planFingerprint: string;
  /** Ordered execution phases. Missing only on legacy phase-less manifests. */
  phases?: ExecutionPhase[];
  plannedRuns: PlannedExecutionRun[];
  taskSnapshots: Record<string, unknown>;
  configSnapshots: Record<string, unknown>;
}

export interface ExecutionAttempt {
  attempt: number;
  status: AttemptStatus;
  startedAt: string;
  completedAt?: string;
  metrics?: BenchmarkMetrics;
  failure?: RunFailure;
}

export interface ExecutionRunRecord {
  schemaVersion: typeof EXECUTION_SCHEMA_VERSION;
  executionId: string;
  runKey: string;
  spec: PlannedExecutionRun;
  status: ExecutionRunStatus;
  attempts: ExecutionAttempt[];
  result?: EvalResult;
  updatedAt: string;
}

export interface ExecutionProgressItem {
  runKey: string;
  ordinal: number;
  taskId: string;
  runConfigId: string;
  repetition: number;
  status: ExecutionRunStatus;
  attempts: number;
  phaseId: string;
}

export interface ExecutionPhaseProgress {
  id: string;
  name: string;
  configIds: string[];
  totalRuns: number;
  status: ExecutionStatus;
  counts: Record<ExecutionRunStatus, number>;
  observedUsage: {
    logicalInputTokens: number;
    outputTokens: number;
    costUsd: number;
    attemptsWithUnknownCost: number;
  };
}

export interface ExecutionProgress {
  schemaVersion: typeof EXECUTION_SCHEMA_VERSION;
  executionId: string;
  status: ExecutionStatus;
  updatedAt: string;
  currentRunKey: string | null;
  totalRuns: number;
  counts: Record<ExecutionRunStatus, number>;
  observedUsage: {
    logicalInputTokens: number;
    outputTokens: number;
    costUsd: number;
    attemptsWithUnknownCost: number;
  };
  items: ExecutionProgressItem[];
  phases: ExecutionPhaseProgress[];
}

export interface ExecutionPhaseCoverage {
  phaseId: string;
  plannedRuns: number;
  succeededRuns: number;
  failedRuns: number;
  interruptedRuns: number;
}

export interface ExecutionAggregates {
  schemaVersion: typeof EXECUTION_SCHEMA_VERSION;
  executionId: string;
  generatedAt: string;
  partial: boolean;
  coverage: {
    succeededRuns: number;
    plannedRuns: number;
    failedRuns: number;
    interruptedRuns: number;
    phases: ExecutionPhaseCoverage[];
  };
  taskAggregates: AggregatedTaskResult[];
  configAggregates: AggregatedConfigResult[];
}

export interface ParsedBenchmarkResults {
  runs: EvalResult[];
  taskAggregates: AggregatedTaskResult[];
  configAggregates: AggregatedConfigResult[];
  manifest?: ExecutionManifest;
  progress?: ExecutionProgress;
}

