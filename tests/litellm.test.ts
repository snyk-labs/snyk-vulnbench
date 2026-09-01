import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  copyRuntimeEnvironment,
  createClaudeLiteLlmEnvironment,
  redactLiteLlmError,
  resolveLiteLlmConnection,
  stripDirectModelCredentials,
} from "../src/runners/litellm.js";

test("LiteLLM connection normalizes protocol-specific endpoints", () => {
  const connection = resolveLiteLlmConnection({
    ANTHROPIC_BASE_URL: "https://proxy.example/",
    ANTHROPIC_AUTH_TOKEN: "proxy-token",
  });

  assert.equal(connection.origin, "https://proxy.example");
  assert.equal(connection.anthropicBaseUrl, "https://proxy.example");
  assert.equal(connection.openAiBaseUrl, "https://proxy.example/v1");
  assert.equal(connection.authToken, "proxy-token");
});

test("LiteLLM rejects incomplete and unsafe proxy configuration", () => {
  assert.throws(
    () => resolveLiteLlmConnection({
      ANTHROPIC_BASE_URL: "https://proxy.example",
    }),
    /requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN together/,
  );
  assert.throws(
    () => resolveLiteLlmConnection({
      ANTHROPIC_BASE_URL: "http://proxy.example",
      ANTHROPIC_AUTH_TOKEN: "token",
    }),
    /must use HTTPS/,
  );
  assert.throws(
    () => resolveLiteLlmConnection({
      ANTHROPIC_BASE_URL: "https://user:pass@proxy.example/path?token=x",
      ANTHROPIC_AUTH_TOKEN: "token",
    }),
    /cannot contain credentials/,
  );
});

test("LiteLLM environment helpers remove direct credentials without mutation", () => {
  const source = {
    PATH: "/usr/bin",
    LANG: "en_US.UTF-8",
    ANTHROPIC_API_KEY: "anthropic-direct",
    OPENAI_API_KEY: "openai-direct",
    CODEX_API_KEY: "codex-direct",
    CLAUDE_CODE_OAUTH_TOKEN: "oauth",
  };
  const runtime = copyRuntimeEnvironment(source);
  const sanitized = stripDirectModelCredentials({ ...runtime, ...source });

  assert.equal(runtime.PATH, "/usr/bin");
  assert.equal(runtime.ANTHROPIC_API_KEY, undefined);
  assert.equal(sanitized.ANTHROPIC_API_KEY, undefined);
  assert.equal(sanitized.OPENAI_API_KEY, undefined);
  assert.equal(sanitized.CODEX_API_KEY, undefined);
  assert.equal(source.ANTHROPIC_API_KEY, "anthropic-direct");
});

test("LiteLLM error redaction removes tokens", () => {
  const connection = resolveLiteLlmConnection({
    ANTHROPIC_BASE_URL: "https://proxy.example",
    ANTHROPIC_AUTH_TOKEN: "highly-secret-token",
  });

  assert.equal(
    redactLiteLlmError(
      new Error("Bearer highly-secret-token was rejected"),
      connection,
    ),
    "Bearer [REDACTED] was rejected",
  );
});

test("Claude LiteLLM environment keeps proxy variables and strips fallbacks", () => {
  const directory = mkdtempSync(join(tmpdir(), "claude-litellm-test-"));
  try {
    const environment = createClaudeLiteLlmEnvironment({
      PATH: "/usr/bin",
      ANTHROPIC_BASE_URL: "https://proxy.example",
      ANTHROPIC_AUTH_TOKEN: "proxy-token",
      ANTHROPIC_API_KEY: "direct-key",
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
      ENABLE_TOOL_SEARCH: "true",
      SNYK_TOKEN: "unrelated",
    }, join(directory, "config"));

    assert.equal(environment.ANTHROPIC_BASE_URL, "https://proxy.example");
    assert.equal(environment.ANTHROPIC_AUTH_TOKEN, "proxy-token");
    assert.equal(environment.ENABLE_TOOL_SEARCH, "true");
    assert.equal(environment.ANTHROPIC_API_KEY, undefined);
    assert.equal(environment.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.equal(environment.SNYK_TOKEN, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
