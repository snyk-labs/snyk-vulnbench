import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  readBenchmarkResults,
  writeBenchmarkJsonl,
} from "../src/results/results-io.js";

const golden = resolve(
  "reports/vulnbench-js-1.0/benchmark-2026-05-20T23-06-29-348Z.jsonl",
);

test("legacy JSONL round-trips through the shared results reader", () => {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-golden-"));
  try {
    const parsed = readBenchmarkResults(golden);
    const output = join(root, "round-trip.jsonl");
    writeBenchmarkJsonl(output, parsed);
    const roundTrip = readBenchmarkResults(output);

    assert.equal(parsed.runs.length, 300);
    assert.equal(parsed.taskAggregates.length, 60);
    assert.equal(parsed.configAggregates.length, 6);
    assert.deepEqual(roundTrip.runs, parsed.runs);
    assert.deepEqual(roundTrip.taskAggregates, parsed.taskAggregates);
    assert.deepEqual(roundTrip.configAggregates, parsed.configAggregates);
    const rowTypes = readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)._type);
    assert.deepEqual(rowTypes.slice(0, 300), Array(300).fill("run"));
    assert.deepEqual(
      rowTypes.slice(300, 360),
      Array(60).fill("task-aggregate"),
    );
    assert.deepEqual(
      rowTypes.slice(360),
      Array(6).fill("config-aggregate"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

