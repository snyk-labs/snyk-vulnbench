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
import { buildCodexMcpConfiguration } from "../src/runners/codex-mcp.js";
import {
  codexFindingsSchema,
  structuredFindingsToFinalText,
} from "../src/runners/codex-schema.js";
import { probeCodexContainment } from "../src/runners/codex-containment.js";

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

test("Codex MCP config forwards referenced secrets without embedding values", () => {
  const config = buildCodexMcpConfiguration({
    Snyk: {
      command: "npx",
      args: ["-y", "snyk@latest", "mcp", "-t", "stdio"],
      env: {
        SNYK_TOKEN: "${SNYK_TOKEN}",
        SNYK_CFG_ORG: "${SNYK_CFG_ORG}",
      },
    },
  }, "/tmp/project");
  const rendered = config.configArgs.join(" ");

  assert.deepEqual(config.serverNames, ["Snyk"]);
  assert.deepEqual(
    [...config.environmentNames].sort(),
    ["SNYK_CFG_ORG", "SNYK_TOKEN"],
  );
  assert.match(rendered, /env_vars=\["SNYK_TOKEN","SNYK_CFG_ORG"\]/);
  assert.doesNotMatch(rendered, /secret-value/);
  assert.match(rendered, /required=true/);
});

test("Codex MCP config rejects renamed secret references", () => {
  assert.throws(
    () => buildCodexMcpConfiguration({
      Snyk: {
        command: "snyk",
        env: { SNYK_TOKEN: "${OTHER_TOKEN}" },
      },
    }, "/tmp/project"),
    /must reference the same variable name/,
  );
});

test("Codex JSONL collector records MCP invocation telemetry", () => {
  const collector = new CodexEventCollector(["Snyk"]);
  collector.feed([
    JSON.stringify({
      type: "item.started",
      item: {
        id: "mcp-1",
        type: "mcp_tool_call",
        server: "Snyk",
        tool: "snyk_code_scan",
        arguments: { path: "." },
        status: "in_progress",
      },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "mcp-1",
        type: "mcp_tool_call",
        server: "Snyk",
        tool: "snyk_code_scan",
        arguments: { path: "." },
        result: { content: [] },
        status: "completed",
      },
    }),
  ].join("\n"), 100);
  collector.finish(120);

  const metrics = collector.metrics(Date.now());
  assert.deepEqual(metrics.mcp.configuredServers, ["Snyk"]);
  assert.equal(metrics.mcp.toolStats.mcp__Snyk__snyk_code_scan.count, 1);
  assert.deepEqual(metrics.mcp.serverStatuses, [{
    name: "Snyk",
    status: "connected",
  }]);
});

test("Codex uses its legacy write sandbox inside the outer Landlock boundary", () => {
  const args = codexPermissionConfig("read").join(" ");
  assert.match(args, /--sandbox read-only/);
  assert.match(args, /features\.use_legacy_landlock=true/);
  assert.match(args, /OPEN_AI_API_KEY/);
});

test("Landlock containment reads the project and denies its sibling", async () => {
  const source = mkdtempSync(join(tmpdir(), "codex-containment-project-"));
  writeFileSync(join(source, "app.js"), "console.log('ok');\n");
  const workspace = createIsolatedWorkspace(source);
  try {
    const result = await probeCodexContainment(workspace, "read");
    assert.deepEqual(result, {
      ok: true,
      detail: "workspace readable; sibling path denied",
    });
  } finally {
    workspace.cleanup();
    rmSync(source, { recursive: true, force: true });
  }
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
