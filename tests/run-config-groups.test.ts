import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadEvalTasks,
  loadRunConfigGroups,
  loadRunConfigs,
} from "../src/evals/loader.js";
import { configSupportsTask } from "../src/evals/selection.js";

test("run config groups load safe defaults and the V2 profile", () => {
  const configs = loadRunConfigs();
  const groups = loadRunConfigGroups(configs);
  const defaultGroup = groups.find((group) => group.id === "default");
  const v2Group = groups.find((group) => group.id === "vulnbench-v2");

  assert.ok(defaultGroup);
  assert.ok(!defaultGroup.configIds.some((id) =>
    id.startsWith("codex-security-") || id.startsWith("deepsec-")
  ));
  assert.equal(v2Group?.category, "attacker-reachable-find-vulns");
  assert.equal(v2Group?.defaultRepetitions, 1);
  assert.deepEqual(v2Group?.configIds, [
    "snyk-code",
    "opus-5-medium-security-review-with-snyk-mcp",
    "opus-5-xhigh-security-review",
    "sonnet-5-xhigh-security-review",
    "codex-security-luna-xhigh",
    "codex-security-terra-xhigh",
    "codex-security-sol-xhigh",
    "deepsec-claude-opus-5-xhigh",
    "deepsec-codex-sol-xhigh",
  ]);
  assert.deepEqual(
    v2Group?.phases?.map((phase) => ({
      id: phase.id,
      configCount: phase.configIds.length,
    })),
    [
      { id: "snyk-code", configCount: 1 },
      { id: "claude-code", configCount: 3 },
      { id: "codex-security", configCount: 3 },
      { id: "deepsec", configCount: 2 },
    ],
  );
  assert.deepEqual(
    v2Group?.phases?.flatMap((phase) => phase.configIds),
    v2Group?.configIds,
  );
  const v2Tasks = loadEvalTasks().filter((task) =>
    task.category.id === v2Group?.category
  );
  const v2Configs = configs.filter((config) =>
    v2Group?.configIds.includes(config.id)
  );
  const compatibleRuns = v2Configs.reduce(
    (total, config) =>
      total + v2Tasks.filter((task) => configSupportsTask(config, task)).length,
    0,
  );
  assert.equal(v2Tasks.length, 20);
  assert.equal(compatibleRuns, 180);
});

test("revised V2 fork matrix changes only DeepSec profiles to 150 turns", () => {
  const configs = loadRunConfigs();
  const groups = loadRunConfigGroups(configs);
  const original = groups.find((group) => group.id === "vulnbench-v2");
  const revised = groups.find((group) =>
    group.id === "vulnbench-v2-deepsec-150"
  );

  assert.ok(original);
  assert.ok(revised);
  assert.deepEqual(
    revised.configIds.slice(0, 7),
    original.configIds.slice(0, 7),
  );
  assert.deepEqual(revised.configIds.slice(7), [
    "deepsec-claude-opus-5-xhigh-turns-150",
    "deepsec-codex-sol-xhigh-turns-150",
  ]);
  const configById = new Map(configs.map((config) => [config.id, config]));
  assert.equal(
    (configById.get("deepsec-claude-opus-5-xhigh") as { maxTurns: number })
      .maxTurns,
    30,
  );
  assert.equal(
    (configById.get("deepsec-codex-sol-xhigh") as { maxTurns: number })
      .maxTurns,
    30,
  );
  assert.equal(
    (configById.get(revised.configIds[7]) as { maxTurns: number }).maxTurns,
    150,
  );
  assert.equal(
    (configById.get(revised.configIds[8]) as { maxTurns: number }).maxTurns,
    150,
  );
});

test("run config group validation rejects unknown and duplicate config IDs", () => {
  const directory = mkdtempSync(join(tmpdir(), "vulnbench-groups-"));
  const file = join(directory, "groups.json");
  const configs = loadRunConfigs();

  try {
    writeFileSync(file, JSON.stringify([{
      id: "invalid",
      name: "Invalid",
      configIds: ["missing"],
    }]));
    assert.throws(
      () => loadRunConfigGroups(configs, file),
      /references unknown config "missing"/,
    );

    writeFileSync(file, JSON.stringify([{
      id: "duplicate",
      name: "Duplicate",
      configIds: ["snyk-code", "snyk-code"],
    }]));
    assert.throws(
      () => loadRunConfigGroups(configs, file),
      /contains duplicate config id "snyk-code"/,
    );

    writeFileSync(file, JSON.stringify([{
      id: "invalid-phases",
      name: "Invalid phases",
      configIds: ["snyk-code", "opus-4-6-high"],
      phases: [
        { id: "snyk", name: "Snyk", configIds: ["snyk-code"] },
        { id: "models", name: "Models", configIds: ["snyk-code"] },
      ],
    }]));
    assert.throws(
      () => loadRunConfigGroups(configs, file),
      /phases must partition configIds in order/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("supported categories remove incompatible task pairings", () => {
  const config = loadRunConfigs().find((entry) =>
    entry.id === "sonnet-5-medium-security-review"
  );
  const tasks = loadEvalTasks();
  const v2Task = tasks.find((task) =>
    task.category.id === "attacker-reachable-find-vulns"
  );
  const fixTask = tasks.find((task) => task.category.id === "fix-vulns");

  assert.ok(config);
  assert.ok(v2Task);
  assert.ok(fixTask);
  assert.equal(configSupportsTask(config, v2Task), true);
  assert.equal(configSupportsTask(config, fixTask), false);
});
