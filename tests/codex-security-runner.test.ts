import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateCodexSecurityRunConfig } from "../src/evals/loader.js";
import { createIsolatedWorkspace } from "../src/isolated-workspace.js";
import {
  buildCodexSecurityScanArgs,
  CODEX_SECURITY_VERSION,
  codexSecurityExecutable,
  createCodexSecurityEnvironment,
} from "../src/runners/codex-security-cli.js";
import type { CodexSecurityRunConfig } from "../src/types.js";

const config: CodexSecurityRunConfig = {
  type: "codex-security",
  id: "codex-security-test",
  name: "Codex Security Test",
  model: "gpt-5.6-sol",
  effort: "xhigh",
  mode: "standard",
  auth: "api-key",
  maxCostUsd: 2,
};

test("Codex Security config validates its fixed benchmark surface", () => {
  assert.deepEqual(
    validateCodexSecurityRunConfig(config as unknown as Record<string, unknown>),
    config,
  );
  assert.throws(
    () => validateCodexSecurityRunConfig({
      ...config,
      mode: "deep",
    }),
    /only supports mode "standard"/,
  );
  assert.throws(
    () => validateCodexSecurityRunConfig({
      ...config,
      promptTemplateId: "security-review",
    }),
    /does not support promptTemplateId/,
  );
});

test("Codex Security environment exposes only canonical OpenAI authentication", () => {
  const source = mkdtempSync(join(tmpdir(), "codex-security-source-"));
  writeFileSync(join(source, "app.js"), "console.log('ok');\n");
  const workspace = createIsolatedWorkspace(source);

  try {
    const environment = createCodexSecurityEnvironment(workspace, {
      PATH: "/usr/bin",
      HOME: "/home/test",
      OPENAI_API_KEY: "canonical-key",
      OPEN_AI_API_KEY: "legacy-key",
      CODEX_API_KEY: "codex-key",
      SNYK_TOKEN: "must-not-leak",
    });

    assert.equal(environment.OPENAI_API_KEY, "canonical-key");
    assert.equal(environment.OPEN_AI_API_KEY, undefined);
    assert.equal(environment.CODEX_API_KEY, undefined);
    assert.equal(environment.SNYK_TOKEN, undefined);
    assert.match(environment.CODEX_HOME ?? "", /codex-home$/);
    assert.match(environment.CODEX_SECURITY_STATE_DIR ?? "", /codex-security-state$/);
    assert.equal(environment.CODEX_CLI_PATH?.endsWith("/node_modules/.bin/codex"), true);
  } finally {
    workspace.cleanup();
    rmSync(source, { recursive: true, force: true });
  }
});

test("Codex Security scan arguments pin standard report-only behavior", () => {
  const args = buildCodexSecurityScanArgs(
    config,
    "/tmp/project",
    "/tmp/output",
    "python3",
  );

  assert.deepEqual(args.slice(0, 2), ["scan", "/tmp/project"]);
  assert.deepEqual(args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2), [
    "--mode",
    "standard",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--auth"), args.indexOf("--auth") + 2), [
    "--auth",
    "api-key",
  ]);
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--headless"));
  assert.ok(!args.includes("--patch"));
  assert.ok(!args.includes("--scan-prompt-file"));
});

test("pinned Codex Security executable reports the expected version", () => {
  const version = execFileSync(codexSecurityExecutable(), ["--version"], {
    encoding: "utf8",
  }).trim();

  assert.equal(version, CODEX_SECURITY_VERSION);
});
