import type { RunConfig } from "../types.js";
import { executionPhases } from "./execution-store.js";
import type {
  ExecutionManifest,
  ExecutionPhase,
  ExecutionRunRecord,
  PlannedExecutionRun,
} from "./execution-types.js";

export interface RunnablePhaseOptions {
  retryFailed: boolean;
  retryInterrupted: boolean;
}

export function resolveExecutionPhase(
  manifest: ExecutionManifest,
  phaseId?: string,
): ExecutionPhase | undefined {
  return resolvePhaseById(executionPhases(manifest), phaseId);
}

export function resolvePhaseById(
  phases: ExecutionPhase[],
  phaseId?: string,
): ExecutionPhase | undefined {
  if (!phaseId) return undefined;
  const phase = phases.find((candidate) =>
    candidate.id === phaseId
  );
  if (!phase) {
    throw new Error(
      `Unknown phase "${phaseId}". Available: ${phases.map((candidate) => candidate.id).join(", ")}`,
    );
  }
  return phase;
}

export function configsForPhase(
  configs: RunConfig[],
  phase?: ExecutionPhase,
): RunConfig[] {
  if (!phase) return configs;
  const ids = new Set(phase.configIds);
  return configs.filter((config) => ids.has(config.id));
}

export function runsForPhase(
  manifest: ExecutionManifest,
  phase?: ExecutionPhase,
): PlannedExecutionRun[] {
  if (!phase) return manifest.plannedRuns;
  return manifest.plannedRuns.filter((run) =>
    (run.phaseId ?? "all") === phase.id
  );
}

export function runnableRunsForPhase(
  manifest: ExecutionManifest,
  records: Map<string, ExecutionRunRecord>,
  phase: ExecutionPhase | undefined,
  options: RunnablePhaseOptions,
): PlannedExecutionRun[] {
  return runsForPhase(manifest, phase).filter((spec) => {
    const existing = records.get(spec.runKey);
    return !existing
      || (existing.status === "failed" && options.retryFailed)
      || (
        existing.status === "interrupted-uncertain"
        && options.retryInterrupted
      );
  });
}

