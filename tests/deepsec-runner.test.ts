import assert from "node:assert/strict";
import test from "node:test";
import { validateDeepSecRunConfig } from "../src/evals/loader.js";
import { parseDeepSecExport } from "../src/runners/deepsec-cli.js";

test("DeepSec JSON export maps file and line evidence without inventing endpoint roles", () => {
  const findings = parseDeepSecExport(JSON.stringify([{
    title: "[HIGH] SQL injection",
    description: "Attacker input reaches a dynamic query.",
    severity: "HIGH",
    metadata: {
      filePath: "src/db.ts",
      lineNumbers: [40, 42],
      vulnSlug: "sql-injection",
      severity: "HIGH",
    },
  }]));

  assert.deepEqual(findings, [{
    type: "sql-injection",
    typeAliases: ["[HIGH] SQL injection"],
    file: "src/db.ts",
    line: 40,
    filesRelated: [
      { file: "src/db.ts", line: 40 },
      { file: "src/db.ts", line: 42 },
    ],
    severity: "high",
    description: "Attacker input reaches a dynamic query.",
    vulnerabilityImpact: "Attacker input reaches a dynamic query.",
    codeFlowMultiLine: "yes",
    codeFlowCrossFile: "no",
  }]);
  assert.equal("type" in findings[0].filesRelated[0], false);
});

test("DeepSec parser rejects non-array exports", () => {
  assert.throws(() => parseDeepSecExport("{}"), /JSON array/);
});

test("DeepSec config validation pins the Codex backend and reasoning level", () => {
  const config = validateDeepSecRunConfig({
    type: "deepsec",
    id: "deepsec",
    name: "DeepSec",
    agent: "codex",
    model: "gpt-5.6-luna",
    thinkingLevel: "high",
  });
  assert.equal(config.agent, "codex");
  assert.equal(config.thinkingLevel, "high");

  assert.throws(
    () => validateDeepSecRunConfig({
      type: "deepsec",
      id: "invalid",
      name: "Invalid",
      agent: "codex",
      model: "gpt-5.6-luna",
      thinkingLevel: "high",
      mcpServers: {},
    }),
    /does not support MCP/,
  );
});
