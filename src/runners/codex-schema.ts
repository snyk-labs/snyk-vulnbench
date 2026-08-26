import type { GroundTruthKind } from "../types.js";

const severity = {
  type: "string",
  enum: ["critical", "high", "medium", "low"],
} as const;

const location = {
  type: "object",
  properties: {
    file: { type: "string" },
    line: { type: "integer", minimum: 1 },
    type: { type: "string", enum: ["source", "sink"] },
  },
  required: ["file", "line"],
  additionalProperties: false,
} as const;

export function codexFindingsSchema(groundTruth: GroundTruthKind): object {
  const finding = groundTruth === "attacker-reachable"
    ? {
        type: "object",
        properties: {
          type: { type: "string" },
          typeAliases: {
            type: "array",
            items: { type: "string" },
          },
          filesRelated: {
            type: "array",
            minItems: 1,
            items: location,
          },
          severity,
          description: { type: "string" },
          vulnerabilityImpact: { type: "string" },
          codeFlowMultiLine: { type: "string", enum: ["yes", "no"] },
          codeFlowCrossFile: { type: "string", enum: ["yes", "no"] },
        },
        required: [
          "type",
          "filesRelated",
          "severity",
          "description",
          "vulnerabilityImpact",
          "codeFlowMultiLine",
          "codeFlowCrossFile",
        ],
        additionalProperties: false,
      }
    : {
        type: "object",
        properties: {
          type: { type: "string" },
          file: { type: "string" },
          line: {
            anyOf: [
              { type: "integer", minimum: 1 },
              { type: "null" },
            ],
          },
          severity,
          description: { type: "string" },
        },
        required: ["type", "file", "line", "severity", "description"],
        additionalProperties: false,
      };

  return {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: finding,
      },
    },
    required: ["findings"],
    additionalProperties: false,
  };
}

export function structuredFindingsToFinalText(value: string): string {
  const parsed = JSON.parse(value) as unknown;
  if (
    typeof parsed !== "object"
    || parsed === null
    || !Array.isArray((parsed as { findings?: unknown }).findings)
  ) {
    throw new Error("Codex final output must be an object with a findings array");
  }
  const findings = (parsed as { findings: unknown[] }).findings;
  return `FINDINGS_JSON:\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``;
}
