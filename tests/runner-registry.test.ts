import assert from "node:assert/strict";
import test from "node:test";
import { getRegisteredRunners, getRunner } from "../src/runners/registry.js";
import type { CommandRunConfig, ModelRunConfig } from "../src/types.js";

test("legacy model configs resolve to the Claude Code runner", () => {
  const config: ModelRunConfig = {
    id: "claude",
    name: "Claude",
    model: "claude-sonnet-4-6",
  };

  const runner = getRunner(config);

  assert.equal(runner.id, "claude-code");
  assert.equal(runner.kind, "model");
  assert.equal(runner.capabilities.fixVulns, true);
  assert.match(runner.describe(config), /claude-sonnet-4-6/);
});

test("command configs resolve to the command runner", () => {
  const config: CommandRunConfig = {
    type: "command",
    id: "snyk",
    name: "Snyk",
    command: "snyk code test {fixturePath} --json",
    parser: "snyk-code",
  };

  const runner = getRunner(config);

  assert.equal(runner.id, "command");
  assert.equal(runner.kind, "command");
  assert.equal(runner.capabilities.fixVulns, false);
  assert.match(runner.describe(config), /snyk code test/);
});

test("Codex configs resolve to the Codex CLI runner", () => {
  const config: ModelRunConfig = {
    id: "codex",
    name: "Codex",
    runner: "codex-cli",
    model: "gpt-5.6-luna",
    effort: "high",
  };

  const runner = getRunner(config);

  assert.equal(runner.id, "codex-cli");
  assert.equal(runner.kind, "model");
  assert.equal(runner.capabilities.fixVulns, true);
  assert.match(runner.describe(config), /gpt-5.6-luna via Codex CLI/);
});

test("runner registry has one adapter for each legacy config kind", () => {
  assert.deepEqual(
    getRegisteredRunners().map((runner) => runner.id),
    ["claude-code", "codex-cli", "command"],
  );
});
