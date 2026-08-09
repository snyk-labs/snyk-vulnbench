import assert from "node:assert/strict";
import test from "node:test";
import { parseSnykCodeAttackerReachableOutput } from "../src/parsers/snyk-code-attacker-reachable.js";
import { parseSnykCodeOutput } from "../src/parsers/snyk-code.js";

const sarif = JSON.stringify({
  runs: [{
    tool: {
      driver: {
        rules: [{
          id: "javascript/PT",
          name: "PathTraversal",
          shortDescription: { text: "Path Traversal" },
        }],
      },
    },
    results: [{
      ruleId: "javascript/PT",
      ruleIndex: 0,
      level: "error",
      message: { text: "User input reaches readFile" },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: "./backend/services/files.ts" },
          region: { startLine: 30, endLine: 31 },
        },
      }],
      codeFlows: [{
        threadFlows: [{
          locations: [
            {
              location: {
                physicalLocation: {
                  artifactLocation: { uri: "backend/routes/files.ts" },
                  region: { startLine: 10 },
                },
              },
            },
            {
              location: {
                physicalLocation: {
                  artifactLocation: { uri: "backend/services/files.ts" },
                  region: { startLine: 30 },
                },
              },
            },
          ],
        }],
      }, {
        threadFlows: [{
          locations: [{
            location: {
              physicalLocation: {
                artifactLocation: { uri: "backend/services/files.ts" },
                region: { startLine: 30 },
              },
            },
          }],
        }],
      }],
    }],
  }],
});

test("rich Snyk parser extracts and deduplicates all code-flow locations", () => {
  const findings = parseSnykCodeAttackerReachableOutput(sarif);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    type: "path-traversal",
    typeAliases: ["Path Traversal", "PathTraversal"],
    filesRelated: [
      { file: "backend/routes/files.ts", line: 10, type: "source" },
      { file: "backend/services/files.ts", line: 30, type: "sink" },
    ],
    severity: "high",
    description: "User input reaches readFile",
    vulnerabilityImpact: "User input reaches readFile",
    codeflowMultiLine: "yes",
    codeflowCrossFile: "yes",
  });
});

test("V1 Snyk parser retains primary-location-only behavior", () => {
  const findings = parseSnykCodeOutput(sarif);

  assert.deepEqual(findings, [{
    type: "path-traversal",
    file: "./backend/services/files.ts",
    line: 30,
    severity: "high",
    description: "User input reaches readFile",
  }]);
});

test("rich parser handles invalid, empty, and location-free SARIF", () => {
  assert.deepEqual(parseSnykCodeAttackerReachableOutput(""), []);
  assert.deepEqual(parseSnykCodeAttackerReachableOutput("not-json"), []);

  const withoutLocations = parseSnykCodeAttackerReachableOutput(JSON.stringify({
    runs: [{
      results: [{
        ruleId: "javascript/DOMXSS",
        level: "warning",
        message: { text: "DOM XSS" },
      }],
    }],
  }));
  assert.deepEqual(withoutLocations[0]?.filesRelated, []);
  assert.equal(withoutLocations[0]?.codeflowMultiLine, "no");
  assert.equal(withoutLocations[0]?.codeflowCrossFile, "no");
});
