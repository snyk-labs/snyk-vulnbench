import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveResults } from "../src/reporter.js";
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
