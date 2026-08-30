import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateCodexSecurityRunConfig } from "../src/evals/loader.js";
import { createIsolatedWorkspace } from "../src/isolated-workspace.js";
import {
  buildCodexSecurityScanArgs,
  CODEX_SECURITY_VERSION,
  codexSecurityTelemetry,
  codexSecurityExecutable,
  collectCodexSecurityMetrics,
  createCodexSecurityEnvironment,
  parseCodexSecurityScanOutput,
} from "../src/runners/codex-security-cli.js";
import { parseCodexSecurityFindings } from "../src/parsers/codex-security.js";
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
      CODEX_API_KEY: "codex-key",
      SNYK_TOKEN: "must-not-leak",
    });

    assert.equal(environment.OPENAI_API_KEY, "canonical-key");
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

test("Codex Security metrics retain usage, coverage, and plugin provenance", () => {
  const document = JSON.parse(readFileSync(new URL(
    "./fixtures/codex-security/findings-v1.json",
    import.meta.url,
  ), "utf8")) as Record<string, unknown>;
  const parsed = parseCodexSecurityFindings(document, "v1");
  const output = {
    manifest: {
      scan: {
        status: "completed",
        producer: { version: "0.1.79" },
        target: {
          kind: "directory_snapshot",
          targetId: "target-1",
          snapshotDigest: "sha256:test",
        },
      },
    },
    findings: document,
    coverage: {
      documentType: "codex-security.coverage",
      schemaVersion: "1.0",
      completeness: "partial",
      mode: "repository",
      surfaces: [
        { disposition: "reported" },
        { disposition: "needs_follow_up" },
      ],
      deferred: [{ id: "deferred-1" }],
      explicitExclusions: [{ pattern: "vendor/**" }],
    },
    pluginVersion: "0.1.79",
    threadId: "thread-1",
    cost: { estimatedUsd: 1.25 },
    turn: {
      id: "turn-1",
      status: "completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 20,
        cache_write_input_tokens: 5,
        output_tokens: 30,
        reasoning_output_tokens: 12,
      },
    },
  };
  const telemetry = codexSecurityTelemetry(output, parsed.diagnostics);
  const metrics = collectCodexSecurityMetrics(
    Date.now(),
    [],
    parsed.findings,
    output,
    telemetry,
  );

  assert.equal(metrics.totalLogicalInputTokens, 125);
  assert.equal(metrics.totalOutputTokens, 30);
  assert.equal(metrics.totalReasoningOutputTokens, 12);
  assert.equal(metrics.totalCostUsd, 1.25);
  assert.equal(metrics.runner?.sessionId, "thread-1");
  assert.equal(metrics.codexSecurity?.pluginVersion, "0.1.79");
  assert.equal(metrics.codexSecurity?.coverage.completeness, "partial");
  assert.equal(metrics.codexSecurity?.coverage.needsFollowUpCount, 1);
  assert.equal(metrics.codexSecurity?.parser.typeMappings.length, 3);
});

test("Codex Security falls back to sealed artifacts when stdout is empty", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "codex-security-output-"));
  const findings = readFileSync(new URL(
    "./fixtures/codex-security/findings-v1.json",
    import.meta.url,
  ), "utf8");

  try {
    writeFileSync(join(outputDir, "scan-manifest.json"), JSON.stringify({
      documentType: "codex-security.scan-manifest",
      schemaVersion: "1.0",
      scan: { status: "completed" },
    }));
    writeFileSync(join(outputDir, "findings.json"), findings);
    writeFileSync(join(outputDir, "coverage.json"), JSON.stringify({
      documentType: "codex-security.coverage",
      schemaVersion: "1.0",
      completeness: "partial",
      mode: "repository",
      surfaces: [],
      deferred: [],
      explicitExclusions: [],
    }));

    const output = parseCodexSecurityScanOutput("", outputDir);
    assert.equal(
      (output.findings as { documentType: string }).documentType,
      "codex-security.findings",
    );
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("Codex Security empty output reports the exit diagnostic", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "codex-security-empty-"));
  try {
    assert.throws(
      () => parseCodexSecurityScanOutput("", outputDir, {
        stdout: "",
        stderr: "Estimated scan cost limit reached",
        exitCode: 2,
        signal: null,
        durationMs: 100,
      }),
      /exit 2.*Estimated scan cost limit reached/,
    );
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
