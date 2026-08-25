import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROMPT_TEMPLATE_ID,
  isPromptTemplateId,
  resolvePromptTemplate,
} from "../src/prompt-templates.js";
import { validateModelRunConfig } from "../src/evals/loader.js";

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

test("prompt template IDs are validated against the registry", () => {
  assert.equal(isPromptTemplateId("default"), true);
  assert.equal(isPromptTemplateId("snyk-mcp"), true);
  assert.equal(isPromptTemplateId("unknown"), false);
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
