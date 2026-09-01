import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRunFailure,
  shouldPauseAfterFailure,
} from "../src/run-failure.js";
import type { BenchmarkMetrics } from "../src/types.js";

function metrics(tokens = 0, cost: number | null = null): BenchmarkMetrics {
  return {
    sessionDurationMs: 10,
    totalInputTokens: tokens,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalLogicalInputTokens: tokens,
    totalCostUsd: cost,
    totalTurns: 0,
    toolCalls: [],
    toolStats: {},
    filesScanned: [],
    mcp: {
      configuredServers: [],
      serverStatuses: [],
      advertisedToolCount: 0,
      toolStats: {},
    },
  };
}

test("quota and authentication failures are systemic stop conditions", () => {
  const quota = classifyRunFailure("429 insufficient_quota: usage limit reached");
  const auth = classifyRunFailure("401 invalid API key");

  assert.equal(quota.kind, "quota");
  assert.equal(quota.systemic, true);
  assert.equal(quota.retryable, false);
  assert.equal(auth.kind, "authentication");
  assert.equal(shouldPauseAfterFailure(auth), true);
});

test("late failures preserve whether usage was already observed", () => {
  const failure = classifyRunFailure(
    "gateway connection reset",
    metrics(12_000, 0.42),
  );

  assert.equal(failure.kind, "gateway");
  assert.equal(failure.retryable, true);
  assert.equal(failure.usageObserved, true);
});

test("invalid model output is isolated from systemic provider failures", () => {
  const failure = classifyRunFailure(
    "Claude Code completed without structured findings",
    metrics(),
  );

  assert.equal(failure.kind, "invalid-output");
  assert.equal(failure.systemic, false);
  assert.equal(shouldPauseAfterFailure(failure), false);
});

