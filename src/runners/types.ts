import type {
  EvalTask,
  RunConfig,
  RunOutput,
} from "../types.js";
import type { IsolatedWorkspace } from "../isolated-workspace.js";

export type RunnerKind = "model" | "command";

export interface RunnerCapabilities {
  findVulns: boolean;
  fixVulns: boolean;
  mcp: boolean;
}

export interface RunnerContext {
  task: EvalTask;
  config: RunConfig;
  cwd: string;
  workspace: IsolatedWorkspace;
}

/**
 * Adapter boundary for every benchmark participant. Runners may use an SDK,
 * spawn a CLI, or execute a scanner pipeline, but must normalize their result
 * to RunOutput so scoring remains backend-independent.
 */
export interface BenchmarkRunner {
  readonly id: string;
  readonly kind: RunnerKind;
  readonly capabilities: RunnerCapabilities;
  supports(config: RunConfig): boolean;
  describe(config: RunConfig): string;
  run(context: RunnerContext): Promise<RunOutput>;
}
