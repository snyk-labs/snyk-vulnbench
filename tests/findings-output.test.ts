import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFindingsEnvelope,
  findingsOutputSchema,
  serializeFindingsToFinalText,
} from "../src/findings-output.js";

test("shared V1 schema requires the scorer contract fields", () => {
  const schema = findingsOutputSchema("v1") as {
    properties: { findings: { items: { required: string[] } } };
  };

  assert.deepEqual(
    schema.properties.findings.items.required,
    ["type", "file", "line", "severity", "description"],
  );
});

test("shared V2 envelope validates complete flow findings", () => {
  const findings = extractFindingsEnvelope({
    findings: [{
      type: "sql-injection",
      typeAliases: ["SQL injection"],
      filesRelated: [
        { file: "routes.ts", line: 10, type: "source" },
        { file: "db.ts", line: 42, type: "sink" },
      ],
      severity: "high",
      description: "Request input reaches a raw query.",
      vulnerabilityImpact: "Database compromise",
      codeFlowMultiLine: "yes",
      codeFlowCrossFile: "yes",
    }],
  }, "attacker-reachable");

  assert.equal(findings.length, 1);
  assert.equal(findings[0].filesRelated?.[1].type, "sink");
});

test("shared envelope rejects malformed and unexpected fields", () => {
  assert.throws(
    () => extractFindingsEnvelope({
      findings: [{
        type: "xss",
        file: "app.js",
        line: 1,
        severity: "urgent",
        description: "unsafe output",
      }],
    }, "v1"),
    /severity must be one of/,
  );
  assert.throws(
    () => extractFindingsEnvelope({ findings: [], extra: true }, "v1"),
    /unexpected field/,
  );
});

test("shared findings serializer preserves the legacy scorer envelope", () => {
  assert.equal(
    serializeFindingsToFinalText([{
      type: "xss",
      file: "app.js",
      line: 7,
      severity: "high",
      description: "unsafe output",
    }]),
    [
      "FINDINGS_JSON:",
      "```json",
      "[",
      "  {",
      '    "type": "xss",',
      '    "file": "app.js",',
      '    "line": 7,',
      '    "severity": "high",',
      '    "description": "unsafe output"',
      "  }",
      "]",
      "```",
    ].join("\n"),
  );
});
