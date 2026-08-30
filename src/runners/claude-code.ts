import { DEFAULT_PROMPT_TEMPLATE_ID } from "../prompt-templates.js";
import { runTask } from "../runner.js";
import type { ModelRunConfig, RunConfig } from "../types.js";
import type { BenchmarkRunner, RunnerContext } from "./types.js";

export const claudeCodeRunner: BenchmarkRunner = {
  id: "claude-code",
  kind: "model",
  capabilities: {
    findVulns: true,
    fixVulns: true,
    mcp: true,
  },
  supports(config: RunConfig): boolean {
    return config.type !== "command"
      && config.type !== "deepsec"
      && config.type !== "codex-security"
      && (config.runner === undefined || config.runner === "claude-code");
  },
  describe(config: RunConfig): string {
    const modelConfig = config as ModelRunConfig;
    const effort = modelConfig.effort ?? "high";
    const thinking = modelConfig.thinking?.type ?? "adaptive";
    const prompt = modelConfig.promptTemplateId ?? DEFAULT_PROMPT_TEMPLATE_ID;
    return `${modelConfig.model} (effort: ${effort}, thinking: ${thinking}, prompt: ${prompt})`;
  },
  run({ task, config, cwd }: RunnerContext) {
    return runTask(task, config as ModelRunConfig, cwd);
  },
};
