import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateModelRunConfig } from "../src/evals/loader.js";
import { createIsolatedWorkspace } from "../src/isolated-workspace.js";
import { CodexEventCollector } from "../src/runners/codex-cli.js";
import {
  codexPermissionConfig,
  createCodexEnvironment,
} from "../src/runners/codex-config.js";
import {
  codexFindingsSchema,
  structuredFindingsToFinalText,
} from "../src/runners/codex-schema.js";

test("Codex JSONL events produce reported usage and tool metrics", () => {
  const collector = new CodexEventCollector();
  const events = [
    { type: "thread.started", thread_id: "thread-123" },
    {
      type: "item.started",
      item: { id: "cmd-1", type: "command_execution", command: "rg foo" },
    },
    {
      type: "item.completed",
      item: {
        id: "cmd-1",
        type: "command_execution",
        command: "rg foo",
        aggregated_output: "match",
        status: "completed",
        exit_code: 0,
      },
    },
    {
      type: "item.completed",
      item: { id: "msg-1", type: "agent_message", text: "{\"findings\":[]}" },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        cache_write_input_tokens: 5,
        output_tokens: 30,
        reasoning_output_tokens: 12,
      },
    },
  ];

  collector.feed(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, 100);
  const metrics = collector.metrics(Date.now());

  assert.equal(collector.finalMessage, "{\"findings\":[]}");
  assert.equal(metrics.totalInputTokens, 100);
  assert.equal(metrics.totalReasoningOutputTokens, 12);
  assert.equal(metrics.totalTurns, 1);
  assert.equal(metrics.toolStats.Command.count, 1);
  assert.equal(metrics.runner?.sessionId, "thread-123");
});

test("Codex structured findings are normalized to scorer input", () => {
  const finalText = structuredFindingsToFinalText(JSON.stringify({
    findings: [{
      type: "xss",
      file: "app.js",
      line: 10,
      severity: "high",
      description: "unsafe output",
    }],
  }));

  assert.match(finalText, /^FINDINGS_JSON:/);
  assert.match(finalText, /"type": "xss"/);
  assert.throws(
    () => structuredFindingsToFinalText("{}"),
    /findings array/,
  );
});

test("Codex V2 output schema requires flow locations", () => {
  const schema = codexFindingsSchema("attacker-reachable") as {
    properties: { findings: { items: { required: string[] } } };
  };

  assert.ok(schema.properties.findings.items.required.includes("filesRelated"));
});

test("Codex child environment maps the dedicated key without retaining its alias", () => {
  const source = mkdtempSync(join(tmpdir(), "codex-env-project-"));
  writeFileSync(join(source, "app.js"), "console.log('ok');\n");
  const workspace = createIsolatedWorkspace(source);
  try {
    const environment = createCodexEnvironment(workspace, {
      PATH: "/usr/bin",
      HOME: "/home/test",
      OPEN_AI_API_KEY: "dedicated-key",
      SNYK_TOKEN: "must-not-leak",
    });
    assert.equal(environment.CODEX_API_KEY, "dedicated-key");
    assert.equal(environment.OPEN_AI_API_KEY, undefined);
    assert.equal(environment.SNYK_TOKEN, undefined);
  } finally {
    workspace.cleanup();
    rmSync(source, { recursive: true, force: true });
  }
});

test("Codex permission profile denies root and scopes workspace access", () => {
  const args = codexPermissionConfig("read").join(" ");
  assert.match(args, /":root"="deny"/);
  assert.match(args, /":workspace_roots"=\{"\."="read"\}/);
  assert.match(args, /network=\{enabled=false\}/);
});

test("model config validation rejects unknown runners", () => {
  assert.throws(
    () => validateModelRunConfig({
      id: "unknown",
      name: "Unknown",
      model: "test",
      runner: "other-cli",
    }),
    /unknown runner/,
  );
});
