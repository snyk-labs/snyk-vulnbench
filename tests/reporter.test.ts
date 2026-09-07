import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { printExecutionStatus, saveResults } from "../src/reporter.js";
import type { EvalResult } from "../src/types.js";

test("JSONL run rows persist normalized findings without transient runner fields", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "vulnbench-results-"));
  const result = {
    taskId: "task",
    details: {
      agentFindings: [{
        id: "found-0",
        type: "xss",
        severity: "high",
        file: "app.js",
        line: 7,
        description: "unsafe output",
      }],
    },
  } as unknown as EvalResult;

  try {
    const outputPath = saveResults([result], outputDir, [], []);
    const row = JSON.parse(readFileSync(outputPath, "utf8").trim()) as {
      _type: string;
      findings?: unknown;
      details: { agentFindings: unknown[] };
    };

    assert.equal(row._type, "run");
    assert.equal(row.findings, undefined);
    assert.equal(row.details.agentFindings.length, 1);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("execution status reports durable progress and uncertain cost", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => lines.push(values.join(" "));
  try {
    printExecutionStatus({
      schemaVersion: 1,
      executionId: "20260901-v2-a1b2c3d4",
      status: "paused",
      updatedAt: "2026-09-01T10:00:00.000Z",
      currentRunKey: null,
      totalRuns: 180,
      counts: {
        pending: 159,
        running: 0,
        succeeded: 20,
        failed: 0,
        "interrupted-uncertain": 1,
      },
      observedUsage: {
        logicalInputTokens: 10_000,
        outputTokens: 2_000,
        costUsd: 12.34,
        attemptsWithUnknownCost: 1,
      },
      items: [],
      phases: [{
        id: "snyk-code",
        name: "Snyk Code",
        configIds: ["snyk-code"],
        totalRuns: 20,
        status: "completed",
        counts: {
          pending: 0,
          running: 0,
          succeeded: 20,
          failed: 0,
          "interrupted-uncertain": 0,
        },
        observedUsage: {
          logicalInputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          attemptsWithUnknownCost: 0,
        },
      }],
    }, {
      kind: "fork",
      parentExecutionId: "parent-execution",
      parentPlanFingerprint: "parent-plan",
      parentSource: {
        gitCommit: "abc",
        dirtyFingerprint: null,
        harnessFingerprint: "harness",
      },
      parentManifestHash: "manifest",
      parentRunLedgerHash: "ledger",
      forkedAt: "2026-09-01T00:00:00.000Z",
      resetPhaseId: "deepsec",
      importSummary: {
        importedRuns: 140,
        discardedRuns: 11,
        discardedByStatus: { succeeded: 10, failed: 1 },
        discardedUsage: {
          logicalInputTokens: 100,
          outputTokens: 10,
          costUsd: 1,
          attemptsWithUnknownCost: 0,
        },
      },
    });
  } finally {
    console.log = original;
  }

  const output = lines.join("\n");
  assert.match(output, /20\/180 succeeded/);
  assert.match(output, /Interrupted.*1/);
  assert.match(output, /\$12\.3400 observed; 1 attempt\(s\) unknown/);
  assert.match(output, /snyk-code.*completed.*20\/20/);
  assert.match(output, /Forked from.*parent-execution.*140 imported; 11 discarded/);
});
