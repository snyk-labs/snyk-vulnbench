import assert from "node:assert/strict";
import test from "node:test";
import {
  findVulnsScore,
  primaryFindVulnsScore,
  scoreAttackerReachableFindVulns,
  scoreFindVulns,
  scoreLocalizedFindVulns,
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
    codeFlowMultiLine: filesRelated.length > 1 ? "yes" : "no",
    codeFlowCrossFile: new Set(filesRelated.map((location) => location.file)).size > 1
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
  assert.equal(details.matchDiagnostics, undefined);
  assert.equal(primaryFindVulnsScore(details, "v1"), findVulnsScore(details));
});

test("V2 primary score is attacker-reachable recall while F1 remains secondary", () => {
  const known = attackerVuln("xss-sink", "xss", [
    { file: "src/view.ts", line: 20, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([
      finding("xss", [{ file: "src/view.ts", line: 20 }]),
      finding("path traversal", [{ file: "src/other.ts", line: 99 }]),
    ]),
    attackerTask([known]),
  );

  assert.equal(details.recall, 1);
  assert.equal(details.precision, 0.5);
  assert.equal(primaryFindVulnsScore(details, "attacker-reachable"), 1);
  assert.equal(findVulnsScore(details), 2 / 3);
  assert.equal(details.scoreSuite?.lenientEndpointLocalizedF1.f1, 2 / 3);
});

test("V1 primary score remains F1 when precision and recall differ", () => {
  const task = v1Task([{
    id: "v1-sqli",
    type: "sql-injection",
    severity: "critical",
    file: "src/query.ts",
    line: 10,
    description: "SQL injection",
  }]);
  const details = scoreFindVulns(output([
    {
      type: "sql-injection",
      file: "src/query.ts",
      line: 10,
      severity: "critical",
      description: "correct",
    },
    {
      type: "xss",
      file: "src/view.ts",
      line: 20,
      severity: "high",
      description: "extra",
    },
  ]), task);

  assert.equal(details.recall, 1);
  assert.equal(details.precision, 0.5);
  assert.equal(primaryFindVulnsScore(details, "v1"), 2 / 3);
});

test("V2 matches aliases, basenames, and the inclusive two-line boundary", () => {
  const known = attackerVuln(
    "xss-flow",
    "xss",
    [{ file: "src/views/route.ts", line: 40, type: "sink" }],
    ["cross-site scripting"],
  );

  const atBoundary = scoreAttackerReachableFindVulns(
    output([finding("Cross Site Scripting", [{ file: "route.ts", line: 42 }])]),
    attackerTask([known]),
  );
  const outsideBoundary = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "route.ts", line: 43 }])]),
    attackerTask([known]),
  );

  assert.equal(atBoundary.truePositives.length, 1);
  assert.equal(outsideBoundary.truePositives.length, 0);
  const comparison = atBoundary.matchDiagnostics?.candidateComparisons[0];
  assert.equal(comparison?.locationComparisons[0].pathMatch, "basename");
  assert.equal(comparison?.locationComparisons[0].lineDelta, 2);
  assert.equal(comparison?.locationComparisons[0].locationMatched, true);
  assert.equal(comparison?.endpointEvidence[0].absoluteLineDelta, 2);
  assert.equal(comparison?.ranking.endpointMatchKind, "sink-only");
  assert.equal(comparison?.ranking.endpointEvidenceStrength, 2);
  assert.equal(comparison?.ranking.closestEndpointLineDelta, 2);
});

test("V2 score suite separates tolerant headline, strict flow, and detection-only F1", () => {
  const known = attackerVuln("strict-line", "xss", [
    { file: "src/view.ts", line: 10, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([finding("xss", [{ file: "src/view.ts", line: 12 }])]),
    attackerTask([known]),
  );

  assert.equal(details.scoreSuite?.lenientEndpointLocalizedF1.f1, 1);
  assert.equal(details.scoreSuite?.strictFlowF1.f1, 0);
  assert.equal(details.scoreSuite?.detectionOnlyF1.f1, 1);
  assert.deepEqual(details.scoreSuite?.endpointRecall.sink, {
    matched: 1,
    total: 1,
    recall: 1,
  });
  assert.deepEqual(details.scoreSuite?.fullFlowOverlap, {
    matchedLocationGroups: 1,
    totalLocationGroups: 1,
    overlap: 1,
  });
});

test("V2 score suite treats repeated endpoints as alternatives and tracks intermediates", () => {
  const known = attackerVuln("alternative-endpoints", "path-traversal", [
    { file: "src/flow.ts", line: 10, type: "source" },
    { file: "src/flow.ts", line: 11, type: "source" },
    { file: "src/flow.ts", line: 20 },
    { file: "src/flow.ts", line: 30, type: "sink" },
    { file: "src/flow.ts", line: 31, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([finding("path traversal", [
      { file: "src/flow.ts", line: 11 },
      { file: "src/flow.ts", line: 30 },
    ])]),
    attackerTask([known]),
  );

  assert.equal(details.scoreSuite?.strictFlowF1.f1, 1);
  assert.equal(details.scoreSuite?.endpointRecall.source.recall, 1);
  assert.equal(details.scoreSuite?.endpointRecall.sink.recall, 1);
  assert.deepEqual(details.scoreSuite?.fullFlowOverlap, {
    matchedLocationGroups: 2,
    totalLocationGroups: 3,
    overlap: 2 / 3,
  });
});

test("V2 strict flow falls back to its sole labelled endpoint", () => {
  const known = attackerVuln("sink-only", "open-redirect", [
    { file: "src/redirect.ts", line: 21, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([finding("open redirect", [{ file: "src/redirect.ts", line: 21 }])]),
    attackerTask([known]),
  );

  assert.equal(details.scoreSuite?.strictFlowF1.f1, 1);
  assert.deepEqual(details.scoreSuite?.endpointRecall.source, {
    matched: 0,
    total: 0,
    recall: null,
  });
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
  assert.equal(
    sourceOnly.matchDiagnostics?.candidateComparisons[0].ranking.endpointMatchKind,
    "source-only",
  );
  assert.equal(
    sinkOnly.matchDiagnostics?.candidateComparisons[0].ranking.endpointMatchKind,
    "sink-only",
  );
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

  const diagnostic = sourceOnly.matchDiagnostics;
  assert.equal(diagnostic?.schemaVersion, "v2-endpoint-diagnostics-2");
  assert.equal(diagnostic?.lineTolerance, 2);
  assert.equal(diagnostic?.candidateComparisons.length, 1);
  assert.deepEqual(
    diagnostic?.candidateComparisons[0].matchedEndpointTypes,
    ["source"],
  );
  assert.deepEqual(
    diagnostic?.candidateComparisons[0].missingEndpointTypes,
    ["sink"],
  );
  assert.ok(
    diagnostic?.candidateComparisons[0].failureReasons.includes("missing-sink"),
  );
  assert.equal(
    diagnostic?.candidateComparisons[0].locationComparisons.length,
    3,
  );
  assert.equal(
    diagnostic?.findingOutcomes[0].failureReason,
    "endpoint-requirement-not-met",
  );
  assert.equal(
    diagnostic?.vulnerabilityOutcomes[0].failureReason,
    "endpoint-requirement-not-met",
  );
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
  assert.equal(details.matchDiagnostics?.candidateComparisons.length, 4);
  assert.equal(
    details.matchDiagnostics?.candidateComparisons[0].ranking.rankAmongAllCandidates,
    2,
  );
  assert.equal(
    details.matchDiagnostics?.candidateComparisons[1].ranking.rankAmongAllCandidates,
    1,
  );
  assert.equal(
    details.matchDiagnostics?.candidateComparisons[1].ranking.endpointMatchKind,
    "sink-only",
  );
  assert.deepEqual(
    details.matchDiagnostics?.vulnerabilityOutcomes.map((outcome) => outcome.status),
    ["matched", "matched"],
  );
});

test("diagnostics retain duplicate candidate and finding outcomes", () => {
  const known = attackerVuln("single-xss", "xss", [
    { file: "src/view.ts", line: 10, type: "sink" },
  ]);
  const details = scoreAttackerReachableFindVulns(
    output([
      finding("xss", [{ file: "src/view.ts", line: 10 }]),
      finding("xss", [{ file: "src/view.ts", line: 10 }]),
    ]),
    attackerTask([known]),
  );

  assert.equal(details.truePositives.length, 1);
  assert.equal(details.falsePositives.length, 1);
  assert.equal(
    details.matchDiagnostics?.candidateComparisons[1].status,
    "ground-truth-already-matched",
  );
  assert.equal(
    details.matchDiagnostics?.findingOutcomes[1].failureReason,
    "duplicate-finding",
  );
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
  assert.equal(details.matchDiagnostics?.candidateComparisons.length, 0);
  assert.equal(
    details.matchDiagnostics?.vulnerabilityOutcomes[0].failureReason,
    "no-reported-findings",
  );
});

test("localized scoring matches any ground-truth flow location without endpoint coercion", () => {
  const task = attackerTask([
    attackerVuln("flow", "sql-injection", [
      { file: "src/route.ts", line: 10, type: "source" },
      { file: "src/service.ts", line: 20 },
      { file: "src/db.ts", line: 30, type: "sink" },
    ]),
  ]);
  const reported = output([
    finding("sql-injection", [{ file: "src/db.ts", line: 31 }]),
  ]);

  const localized = scoreLocalizedFindVulns(reported, task);
  const endpointAware = scoreAttackerReachableFindVulns(reported, task);

  assert.equal(localized.recall, 1);
  assert.equal(localized.localizedScore?.f1, 1);
  assert.equal(localized.localizedScore?.lineTolerance, 2);
  assert.equal(endpointAware.recall, 0);
});
