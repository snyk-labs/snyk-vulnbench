import assert from "node:assert/strict";
import test from "node:test";
import { validateDeepSecRunConfig } from "../src/evals/loader.js";
import {
  buildDeepSecConfig,
  createDeepSecEnvironment,
  parseDeepSecExport,
} from "../src/runners/deepsec-cli.js";

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

test("DeepSec config validation supports compatible Codex and Claude backends", () => {
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
  assert.equal(validateDeepSecRunConfig({
    type: "deepsec",
    id: "deepsec-claude",
    name: "DeepSec Claude",
    agent: "claude",
    model: "claude-opus-5",
    thinkingLevel: "xhigh",
  }).agent, "claude");
  assert.throws(
    () => validateDeepSecRunConfig({
      type: "deepsec",
      id: "invalid-pair",
      name: "Invalid pair",
      agent: "claude",
      model: "gpt-5.6-sol",
      thinkingLevel: "xhigh",
    }),
    /Claude agent requires a Claude model/,
  );

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
  assert.throws(
    () => validateDeepSecRunConfig({
      type: "deepsec",
      id: "invalid-prompt",
      name: "Invalid prompt",
      agent: "codex",
      model: "gpt-5.6-luna",
      thinkingLevel: "high",
      promptTemplateId: "security-review",
    }),
    /does not support prompt templates/,
  );
});

test("DeepSec config and environment route credentials by agent provider", () => {
  const claudeConfig = {
    type: "deepsec",
    id: "claude",
    name: "Claude",
    agent: "claude",
    model: "claude-opus-5",
    thinkingLevel: "xhigh",
  } as const;
  const codexConfig = {
    ...claudeConfig,
    id: "codex",
    name: "Codex",
    agent: "codex",
    model: "gpt-5.6-sol",
  } as const;
  const source = {
    PATH: "/usr/bin",
    OPENAI_API_KEY: "openai-key",
    ANTHROPIC_API_KEY: "anthropic-key",
  };

  assert.match(
    buildDeepSecConfig("project", "/tmp/project", "/tmp/data", claudeConfig),
    /"provider": "anthropic"[\s\S]*"apiKeyEnv": "ANTHROPIC_API_KEY"/,
  );
  assert.match(
    buildDeepSecConfig("project", "/tmp/project", "/tmp/data", codexConfig),
    /"provider": "openai"[\s\S]*"apiKeyEnv": "OPENAI_API_KEY"/,
  );
  const claudeEnvironment = createDeepSecEnvironment(claudeConfig, source);
  const codexEnvironment = createDeepSecEnvironment(codexConfig, source);
  assert.equal(claudeEnvironment.ANTHROPIC_API_KEY, "anthropic-key");
  assert.equal(claudeEnvironment.OPENAI_API_KEY, undefined);
  assert.equal(codexEnvironment.OPENAI_API_KEY, "openai-key");
  assert.equal(codexEnvironment.ANTHROPIC_API_KEY, undefined);
});
