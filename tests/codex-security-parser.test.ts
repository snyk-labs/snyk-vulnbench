import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseCodexSecurityFindings } from "../src/parsers/codex-security.js";

const fixturePath = fileURLToPath(new URL(
  "./fixtures/codex-security/findings-v1.json",
  import.meta.url,
));
const fixture = readFileSync(fixturePath, "utf8");

test("Codex Security findings map to V1 records and diagnostics", () => {
  const parsed = parseCodexSecurityFindings(fixture, "v1");

  assert.equal(parsed.findings.length, 3);
  assert.deepEqual(parsed.findings[0], {
    type: "sql-injection",
    typeAliases: [
      "SQL injection in user lookup",
      "Injection",
      "sql-injection",
      "CWE-89",
    ],
    file: "routes/users.js",
    line: 12,
    severity: "high",
    description: "Attacker-controlled user ID reaches an unparameterized query.",
  });
  assert.equal(parsed.findings[1].type, "xss");
  assert.equal(parsed.diagnostics.typeMappings[1].mappingSource, "cwe");
  assert.equal(parsed.findings[2].type, "other");
  assert.equal(parsed.findings[2].severity, "low");
  assert.equal(parsed.diagnostics.informationalCount, 1);
});

test("Codex Security findings map explicit roles to V2 endpoints", () => {
  const parsed = parseCodexSecurityFindings(fixture, "attacker-reachable");
  const sqlInjection = parsed.findings[0];

  assert.deepEqual(sqlInjection.filesRelated, [
    { file: "routes/users.js", line: 12, type: "source" },
    { file: "db/users.js", line: 31, type: "sink" },
  ]);
  assert.equal(sqlInjection.vulnerabilityImpact, "An attacker can read or modify database records.");
  assert.equal(sqlInjection.codeFlowMultiLine, "yes");
  assert.equal(sqlInjection.codeFlowCrossFile, "yes");
  assert.deepEqual(parsed.findings[2].filesRelated, [
    { file: "app.js", line: 3 },
  ]);
  assert.equal(
    parsed.diagnostics.roleMappings.find((mapping) =>
      mapping.originalRole === "evidence"
    )?.mappedEndpoint,
    undefined,
  );
});

test("Codex Security parser rejects unsupported contracts", () => {
  assert.throws(
    () => parseCodexSecurityFindings({
      documentType: "other",
      schemaVersion: "1.0",
      scanId: "scan",
      findings: [],
    }, "v1"),
    /Unexpected Codex Security documentType/,
  );
  assert.throws(
    () => parseCodexSecurityFindings({
      documentType: "codex-security.findings",
      schemaVersion: "2.0",
      scanId: "scan",
      findings: [],
    }, "v1"),
    /Unsupported Codex Security findings schemaVersion/,
  );
});

test("Codex Security parser skips findings without valid locations", () => {
  const document = JSON.parse(fixture) as {
    findings: Array<Record<string, unknown>>;
  } & Record<string, unknown>;
  document.findings = [{
    ...document.findings[0],
    locations: [],
    codeEvidence: [],
  }];

  const parsed = parseCodexSecurityFindings(document, "v1");

  assert.deepEqual(parsed.findings, []);
  assert.deepEqual(parsed.diagnostics.skippedFindings, [{
    findingIndex: 0,
    reason: "finding has no valid source location",
  }]);
});
