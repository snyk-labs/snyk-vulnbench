import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSdkModelUsage } from "../src/runner.js";

test("SDK model usage aggregates main-agent and subagent models", () => {
  assert.deepEqual(
    aggregateSdkModelUsage({
      "claude-sonnet-5": {
        inputTokens: 8,
        outputTokens: 5_414,
        cacheReadInputTokens: 118_059,
        cacheCreationInputTokens: 43_345,
        costUSD: 0.27919545,
      },
      "claude-haiku-4-5": {
        inputTokens: 45,
        outputTokens: 2_608,
        cacheReadInputTokens: 63_144,
        cacheCreationInputTokens: 13_593,
        costUSD: 0.03639065,
      },
    }),
    {
      input_tokens: 53,
      output_tokens: 8_022,
      cache_read_input_tokens: 181_203,
      cache_creation_input_tokens: 56_938,
    },
  );
});

test("SDK model usage returns null when no usage is reported", () => {
  assert.equal(aggregateSdkModelUsage(undefined), null);
  assert.equal(aggregateSdkModelUsage({}), null);
});
