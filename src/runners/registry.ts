import type { RunConfig } from "../types.js";
import { claudeCodeRunner } from "./claude-code.js";
import { snykCommandRunner } from "./snyk-command.js";
import type { BenchmarkRunner } from "./types.js";

const RUNNERS: BenchmarkRunner[] = [
  claudeCodeRunner,
  snykCommandRunner,
];

export function getRunner(config: RunConfig): BenchmarkRunner {
  const matches = RUNNERS.filter((runner) => runner.supports(config));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one runner for config "${config.id}", found ${matches.length}`,
    );
  }
  return matches[0];
}

export function getRegisteredRunners(): readonly BenchmarkRunner[] {
  return RUNNERS;
}
