import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreAttackerReachableFindVulns,
  scoreFindVulns,
} from "../src/scorer.js";
import {
  EVAL_CATEGORIES,
  type AttackerReachableVulnerability,
  type EvalTask,
  type FileLocation,
  type VulnType,
  type Vulnerability,
} from "../src/types.js";

function attackerVuln(
  id: string,
  type: VulnType,
  filesRelated: FileLocation[],
  typeAliases: string[] = [],
): AttackerReachableVulnerability {
  return {
    id,
    type,
    typeAliases,
    severity: "high",
    filesRelated,
    file: filesRelated[0].file,
    line: filesRelated[0].line,
    description: id,
    vulnerabilityImpact: "test impact",
    codeflowMultiLine: filesRelated.length > 1 ? "yes" : "no",
    codeflowCrossFile: new Set(filesRelated.map((location) => location.file)).size > 1
      ? "yes"
      : "no",
  };
}

function attackerTask(
  knownVulns: AttackerReachableVulnerability[],
): EvalTask {
  return {
    id: "test-attacker-reachable",
    name: "Test attacker-reachable task",
    category: EVAL_CATEGORIES.ATTACKER_REACHABLE_FIND_VULNS,
    fixture: "/tmp/project",
    prompt: "",
    groundTruth: "attacker-reachable",
    knownVulns,
  };
}

function v1Task(knownVulns: Vulnerability[]): EvalTask {
  return {
    id: "test-v1",
    name: "Test V1 task",
    category: EVAL_CATEGORIES.FIND_VULNS,
    fixture: "/tmp/project",
    prompt: "",
    groundTruth: "v1",
    knownVulns,
  };
}

function output(findings: unknown[], withMarker = true): string {
  const json = JSON.stringify(findings);
  return withMarker ? `FINDINGS_JSON:\n\`\`\`json\n${json}\n\`\`\`` : json;
}

function finding(type: string, filesRelated: FileLocation[]): object {
  return {
    type,
    filesRelated,
    severity: "high",
    description: "reported finding",
  };
}

test("V1 matching remains type-only", () => {
  const task = v1Task([{
    id: "v1-sqli",
    type: "sql-injection",
    severity: "critical",
    file: "src/query.ts",
    line: 10,
    description: "SQL injection",
  }]);

  const details = scoreFindVulns(output([{
    type: "SQLi",
    file: "completely/wrong.ts",
    line: 999,
    severity: "low",
    description: "still matches in V1",
  }]), task);

  assert.equal(details.truePositives.length, 1);
  assert.equal(details.recall, 1);
});

test("V2 matches aliases, basenames, and the inclusive five-line boundary", () => {
  const known = attackerVuln(
    "xss-flow",
    "xss",
    [{ file: "src/views/route.ts", line: 40, type: "sink" }],
    ["cross-site scripting"],
  );

  const atBoundary = scoreAttackerReachableFindVulns(
    output([finding("Cross Site Scripting", [{ file: "route.ts", line: 45 }])]),
    attackerTask([known]),
  );
  const outsideBoundary = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "route.ts", line: 46 }])]),
    attackerTask([known]),
  );

  assert.equal(atBoundary.truePositives.length, 1);
  assert.equal(outsideBoundary.truePositives.length, 0);
});

test("one-location ground truth accepts a matching source or sink", () => {
  for (const type of ["source", "sink"] as const) {
    const known = attackerVuln(`one-${type}`, "path-traversal", [
      { file: "src/one.ts", line: 10, type },
    ]);
    const details = scoreAttackerReachableFindVulns(
      output([finding("path traversal", [{ file: "src/one.ts", line: 10 }])]),
      attackerTask([known]),
    );
    assert.equal(details.truePositives.length, 1);
  }
});

test("two-location ground truth accepts both locations or either endpoint", () => {
  const known = attackerVuln("two", "path-traversal", [
    { file: "src/two.ts", line: 10, type: "source" },
    { file: "src/two.ts", line: 20, type: "sink" },
  ]);

  const both = scoreAttackerReachableFindVulns(
    output([finding("path traversal", [
      { file: "src/two.ts", line: 10 },
      { file: "src/two.ts", line: 20 },
    ])]),
    attackerTask([known]),
  );
  const sourceOnly = scoreAttackerReachableFindVulns(
    output([finding("path traversal", [{ file: "src/two.ts", line: 10 }])]),
    attackerTask([known]),
  );
  const sinkOnly = scoreAttackerReachableFindVulns(
    output([finding("path traversal", [{ file: "src/two.ts", line: 20 }])]),
    attackerTask([known]),
  );

  assert.equal(both.truePositives.length, 1);
  assert.equal(sourceOnly.truePositives.length, 1);
  assert.equal(sinkOnly.truePositives.length, 1);
});

test("flows longer than two locations require distinct source and sink matches", () => {
  const known = attackerVuln("long-flow", "xss", [
    { file: "src/view.ts", line: 10, type: "source" },
    { file: "src/view.ts", line: 20 },
    { file: "src/view.ts", line: 30, type: "sink" },
  ]);

  const bothEndpoints = scoreAttackerReachableFindVulns(
    output([finding("xss", [
      { file: "src/view.ts", line: 10 },
      { file: "src/view.ts", line: 30 },
    ])]),
    attackerTask([known]),
  );
  const sourceOnly = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "src/view.ts", line: 10 }])]),
    attackerTask([known]),
  );
  const intermediateOnly = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "src/view.ts", line: 20 }])]),
    attackerTask([known]),
  );

  assert.equal(bothEndpoints.truePositives.length, 1);
  assert.equal(sourceOnly.truePositives.length, 0);
  assert.equal(intermediateOnly.truePositives.length, 0);
});

test("one reported location cannot satisfy both endpoints of a long flow", () => {
  const known = attackerVuln("overlap", "xss", [
    { file: "src/view.ts", line: 10, type: "source" },
    { file: "src/view.ts", line: 11 },
    { file: "src/view.ts", line: 12, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "src/view.ts", line: 11 }])]),
    attackerTask([known]),
  );

  assert.equal(details.truePositives.length, 0);
});

test("duplicate types pair by best location overlap instead of JSON order", () => {
  const first = attackerVuln("first-xss", "xss", [
    { file: "src/view.ts", line: 10, type: "sink" },
  ]);
  const second = attackerVuln("second-xss", "xss", [
    { file: "src/view.ts", line: 100, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([
      finding("xss", [{ file: "src/view.ts", line: 100 }]),
      finding("xss", [{ file: "src/view.ts", line: 10 }]),
    ]),
    attackerTask([first, second]),
  );

  assert.deepEqual(details.truePositives.map((match) => match.id), [
    "second-xss",
    "first-xss",
  ]);
});

test("nested filesRelated arrays parse without a FINDINGS_JSON marker", () => {
  const known = attackerVuln("nested", "sql-injection", [
    { file: "src/db.ts", line: 20, type: "source" },
    { file: "src/db.ts", line: 30, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([finding("sql injection", [
      { file: "src/db.ts", line: 20 },
      { file: "src/db.ts", line: 30 },
    ])], false),
    attackerTask([known]),
  );

  assert.equal(details.truePositives.length, 1);
});

test("malformed V2 findings produce false negatives instead of throwing", () => {
  const known = attackerVuln("malformed", "xss", [
    { file: "src/view.ts", line: 10, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    "FINDINGS_JSON:\n```json\n[{not-json}]\n```",
    attackerTask([known]),
  );

  assert.equal(details.agentFindings.length, 0);
  assert.equal(details.falseNegatives.length, 1);
});
