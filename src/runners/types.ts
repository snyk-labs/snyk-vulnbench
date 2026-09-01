import type {
  EvalTask,
  RunConfig,
  RunOutput,
  RunnerCapabilities,
} from "../types.js";
import type { IsolatedWorkspace } from "../isolated-workspace.js";

export type RunnerKind = "model" | "command";

export interface RunnerContext {
  task: EvalTask;
  config: RunConfig;
  cwd: string;
  workspace: IsolatedWorkspace;
  abortController: AbortController;
}

/**
 * Adapter boundary for every benchmark participant. Runners may use an SDK,
 * spawn a CLI, or execute a scanner pipeline, but must normalize their result
 * to RunOutput so scoring remains backend-independent.
 */
export interface BenchmarkRunner {
  readonly id: string;
  readonly version?: string;
  readonly kind: RunnerKind;
  readonly capabilities: RunnerCapabilities;
  supports(config: RunConfig): boolean;
  describe(config: RunConfig): string;
  run(context: RunnerContext): Promise<RunOutput>;
}
