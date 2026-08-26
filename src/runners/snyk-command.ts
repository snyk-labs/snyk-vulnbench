import { runCommandTask } from "../command-runner.js";
import type { CommandRunConfig, RunConfig } from "../types.js";
import type { BenchmarkRunner, RunnerContext } from "./types.js";

export const snykCommandRunner: BenchmarkRunner = {
  id: "command",
  kind: "command",
  capabilities: {
    findVulns: true,
    fixVulns: false,
    mcp: false,
  },
  supports(config: RunConfig): boolean {
    return config.type === "command";
  },
  describe(config: RunConfig): string {
    return `[sast] ${(config as CommandRunConfig).command}`;
  },
  run({ task, config, cwd }: RunnerContext) {
    return runCommandTask(task, config as CommandRunConfig, cwd);
  },
};
