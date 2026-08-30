import type {
  FindingRecord,
  GroundTruthKind,
} from "./types.js";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const FLOW_FLAGS = ["yes", "no"] as const;
const ENDPOINT_TYPES = ["source", "sink"] as const;

const severitySchema = {
  type: "string",
  enum: SEVERITIES,
} as const;

const locationSchema = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description: "Project-relative path containing this code-flow location.",
    },
    line: {
      type: "integer",
      minimum: 1,
      description: "Precise one-based source line.",
    },
    type: {
      type: "string",
      enum: ENDPOINT_TYPES,
      description: "Use source for attacker-controlled input and sink for the vulnerable operation; omit for intermediate locations.",
    },
  },
  required: ["file", "line"],
  additionalProperties: false,
} as const;

export function findingsOutputSchema(
  groundTruth: GroundTruthKind,
): Record<string, unknown> {
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
            items: locationSchema,
            description: "Complete source-to-sink flow in execution order.",
          },
          severity: severitySchema,
          description: { type: "string" },
          vulnerabilityImpact: { type: "string" },
          codeFlowMultiLine: { type: "string", enum: FLOW_FLAGS },
          codeFlowCrossFile: { type: "string", enum: FLOW_FLAGS },
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
          severity: severitySchema,
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

export function extractFindingsEnvelope(
  value: unknown,
  groundTruth: GroundTruthKind,
): FindingRecord[] {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  assertObject(parsed, "Structured output must be an object");
  assertOnlyKeys(parsed, ["findings"], "Structured output");
  if (!Array.isArray(parsed.findings)) {
    throw new Error("Structured output must contain a findings array");
  }

  return parsed.findings.map((finding, index) =>
    validateFinding(finding, groundTruth, index)
  );
}

export function serializeFindingsToFinalText(
  findings: readonly FindingRecord[],
): string {
  return `FINDINGS_JSON:\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Structured output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateFinding(
  value: unknown,
  groundTruth: GroundTruthKind,
  index: number,
): FindingRecord {
  assertObject(value, `Finding ${index} must be an object`);
  return groundTruth === "attacker-reachable"
    ? validateAttackerReachableFinding(value, index)
    : validateV1Finding(value, index);
}

function validateV1Finding(
  finding: Record<string, unknown>,
  index: number,
): FindingRecord {
  assertOnlyKeys(
    finding,
    ["type", "file", "line", "severity", "description"],
    `Finding ${index}`,
  );
  assertNonEmptyString(finding.type, `Finding ${index}.type`);
  assertNonEmptyString(finding.file, `Finding ${index}.file`);
  if (
    finding.line !== null
    && (
      typeof finding.line !== "number"
      || !Number.isInteger(finding.line)
      || finding.line < 1
    )
  ) {
    throw new Error(`Finding ${index}.line must be a positive integer or null`);
  }
  assertSeverity(finding.severity, index);
  assertString(finding.description, `Finding ${index}.description`);
  return finding as unknown as FindingRecord;
}

function validateAttackerReachableFinding(
  finding: Record<string, unknown>,
  index: number,
): FindingRecord {
  assertOnlyKeys(
    finding,
    [
      "type",
      "typeAliases",
      "filesRelated",
      "severity",
      "description",
      "vulnerabilityImpact",
      "codeFlowMultiLine",
      "codeFlowCrossFile",
    ],
    `Finding ${index}`,
  );
  assertNonEmptyString(finding.type, `Finding ${index}.type`);
  if (
    finding.typeAliases !== undefined
    && (
      !Array.isArray(finding.typeAliases)
      || !finding.typeAliases.every((alias) => typeof alias === "string")
    )
  ) {
    throw new Error(`Finding ${index}.typeAliases must be an array of strings`);
  }
  if (!Array.isArray(finding.filesRelated) || finding.filesRelated.length === 0) {
    throw new Error(`Finding ${index}.filesRelated must be a non-empty array`);
  }
  for (const [locationIndex, location] of finding.filesRelated.entries()) {
    assertObject(
      location,
      `Finding ${index}.filesRelated[${locationIndex}] must be an object`,
    );
    assertOnlyKeys(
      location,
      ["file", "line", "type"],
      `Finding ${index}.filesRelated[${locationIndex}]`,
    );
    assertNonEmptyString(
      location.file,
      `Finding ${index}.filesRelated[${locationIndex}].file`,
    );
    if (
      typeof location.line !== "number"
      || !Number.isInteger(location.line)
      || location.line < 1
    ) {
      throw new Error(
        `Finding ${index}.filesRelated[${locationIndex}].line must be a positive integer`,
      );
    }
    if (
      location.type !== undefined
      && !ENDPOINT_TYPES.includes(location.type as typeof ENDPOINT_TYPES[number])
    ) {
      throw new Error(
        `Finding ${index}.filesRelated[${locationIndex}].type must be source or sink`,
      );
    }
  }
  assertSeverity(finding.severity, index);
  assertString(finding.description, `Finding ${index}.description`);
  assertString(
    finding.vulnerabilityImpact,
    `Finding ${index}.vulnerabilityImpact`,
  );
  assertFlowFlag(finding.codeFlowMultiLine, `Finding ${index}.codeFlowMultiLine`);
  assertFlowFlag(finding.codeFlowCrossFile, `Finding ${index}.codeFlowCrossFile`);
  return finding as unknown as FindingRecord;
}

function assertObject(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} has unexpected field(s): ${unexpected.join(", ")}`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertSeverity(value: unknown, index: number): void {
  if (!SEVERITIES.includes(value as typeof SEVERITIES[number])) {
    throw new Error(
      `Finding ${index}.severity must be one of ${SEVERITIES.join(", ")}`,
    );
  }
}

function assertFlowFlag(value: unknown, label: string): void {
  if (!FLOW_FLAGS.includes(value as typeof FLOW_FLAGS[number])) {
    throw new Error(`${label} must be yes or no`);
  }
}
