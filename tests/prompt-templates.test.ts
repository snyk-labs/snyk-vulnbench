import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROMPT_TEMPLATE_ID,
  isPromptTemplateId,
  isPromptTemplateSupported,
  resolvePromptTemplate,
} from "../src/prompt-templates.js";
import {
  validateCommandRunConfig,
  validateModelRunConfig,
} from "../src/evals/loader.js";

test("default prompt template preserves the task prompt", () => {
  const prompt = "Audit this project.";
  assert.equal(resolvePromptTemplate(prompt), prompt);
  assert.equal(resolvePromptTemplate(prompt, DEFAULT_PROMPT_TEMPLATE_ID), prompt);
});

test("Snyk MCP template requires one Snyk Code scan", () => {
  const prompt = resolvePromptTemplate("Audit this project.", "snyk-mcp");

  assert.match(prompt, /MUST invoke the Snyk MCP `snyk_code_scan` tool exactly once/);
  assert.match(prompt, /Audit this project\./);
});

test("security review template replaces the task prompt", () => {
  assert.equal(
    resolvePromptTemplate("Audit this project.", "security-review"),
    "/security-review",
  );
});

test("security review can compose a required Snyk MCP policy", () => {
  const prompt = resolvePromptTemplate(
    "ignored task prompt",
    "security-review",
    "snyk-code-once",
  );

  assert.match(prompt, /^\/security-review/);
  assert.match(prompt, /invoke the Snyk MCP `snyk_code_scan` tool exactly once/);
  assert.doesNotMatch(prompt, /ignored task prompt/);
});

test("prompt template IDs are validated against the registry", () => {
  assert.equal(isPromptTemplateId("default"), true);
  assert.equal(isPromptTemplateId("snyk-mcp"), true);
  assert.equal(isPromptTemplateId("security-review"), true);
  assert.equal(isPromptTemplateId("unknown"), false);
  assert.equal(isPromptTemplateSupported("security-review", "claude-code"), true);
  assert.equal(isPromptTemplateSupported("security-review", "codex-cli"), false);
  assert.equal(isPromptTemplateSupported("snyk-mcp", "codex-cli"), true);
});

test("run config loader rejects an unknown prompt template", () => {
  assert.throws(
    () => validateModelRunConfig({
      id: "invalid-template",
      name: "Invalid template",
      model: "claude-haiku-4-5",
      promptTemplateId: "unknown",
    }),
    /unknown promptTemplateId "unknown"/,
  );
});

test("security review template is rejected for the Codex runner", () => {
  assert.throws(
    () => validateModelRunConfig({
      id: "invalid-security-review",
      name: "Invalid security review",
      runner: "codex-cli",
      model: "gpt-5.6-luna",
      promptTemplateId: "security-review",
    }),
    /cannot use promptTemplateId "security-review" with runner "codex-cli"/,
  );
});

test("command configs reject prompt templates", () => {
  assert.throws(
    () => validateCommandRunConfig({
      type: "command",
      id: "invalid-command-prompt",
      name: "Invalid command prompt",
      executable: "scanner",
      parser: "scanner",
      promptTemplateId: "security-review",
    }),
    /does not support prompt templates/,
  );
});

test("Claude model configs accept xhigh and validate required tool policies", () => {
  assert.equal(validateModelRunConfig({
    id: "claude-xhigh",
    name: "Claude XHigh",
    model: "claude-opus-5",
    effort: "xhigh",
    promptTemplateId: "security-review",
  }).effort, "xhigh");

  assert.throws(
    () => validateModelRunConfig({
      id: "missing-snyk",
      name: "Missing Snyk",
      model: "claude-opus-5",
      requiredToolPolicyId: "snyk-code-once",
    }),
    /requires a Snyk MCP server/,
  );
});
