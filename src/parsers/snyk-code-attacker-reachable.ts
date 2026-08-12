import type { FileLocation } from "../types.js";
import type { FindingRecord } from "./index.js";
import { mapLevel, mapRuleId } from "./snyk-code.js";

interface SarifPhysicalLocation {
  artifactLocation?: { uri?: string };
  region?: { startLine?: number; endLine?: number };
}

interface SarifLocation {
  physicalLocation?: SarifPhysicalLocation;
}

interface SarifRule {
  id?: string;
  name?: string;
  shortDescription?: { text?: string };
}

interface SarifResult {
  ruleId?: string;
  ruleIndex?: number;
  level?: string;
  message?: { text?: string };
  locations?: SarifLocation[];
  codeFlows?: Array<{
    threadFlows?: Array<{
      locations?: Array<{ location?: SarifLocation }>;
    }>;
  }>;
}

interface SarifRun {
  tool?: { driver?: { rules?: SarifRule[] } };
  results?: SarifResult[];
}

interface SarifOutput {
  runs?: SarifRun[];
}

/**
 * Parses Snyk Code SARIF into VulnBench 2.0 findings. Unlike the V1 parser,
 * this preserves the complete source-to-sink code flow for location-aware
 * attacker-reachability scoring.
 */
export function parseSnykCodeAttackerReachableOutput(stdout: string): FindingRecord[] {
  if (!stdout.trim()) return [];

  let sarif: SarifOutput;
  try {
    sarif = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (!Array.isArray(sarif.runs)) return [];

  return sarif.runs.flatMap((run) => {
    if (!Array.isArray(run.results)) return [];

    const rules = run.tool?.driver?.rules ?? [];
    const rulesById = new Map(
      rules
        .filter((rule): rule is SarifRule & { id: string } => typeof rule.id === "string")
        .map((rule) => [rule.id, rule]),
    );

    return run.results
      .filter((result): result is SarifResult & { ruleId: string } =>
        typeof result.ruleId === "string" && result.ruleId.length > 0
      )
      .map((result) => {
        const rule = rulesById.get(result.ruleId)
          ?? (typeof result.ruleIndex === "number" ? rules[result.ruleIndex] : undefined);
        const filesRelated = extractFilesRelated(result);
        const description = result.message?.text ?? rule?.shortDescription?.text ?? "";
        const typeAliases = uniqueStrings([
          rule?.shortDescription?.text,
          rule?.name,
        ]);

        return {
          type: mapRuleId(result.ruleId),
          ...(typeAliases.length > 0 && { typeAliases }),
          filesRelated,
          severity: mapLevel(result.level ?? ""),
          description,
          vulnerabilityImpact: description,
          codeFlowMultiLine: filesRelated.length > 1 ? "yes" as const : "no" as const,
          codeFlowCrossFile: new Set(filesRelated.map((location) => location.file)).size > 1
            ? "yes" as const
            : "no" as const,
        };
      });
  });
}

function extractFilesRelated(result: SarifResult): FileLocation[] {
  const locations: FileLocation[] = [];
  let hasCodeFlowLocations = false;

  for (const codeFlow of result.codeFlows ?? []) {
    for (const threadFlow of codeFlow.threadFlows ?? []) {
      const flowLocations = deduplicateLocations(
        (threadFlow.locations ?? [])
          .map((threadLocation) => toFileLocation(threadLocation.location))
          .filter((location): location is FileLocation => location !== undefined),
      );
      if (flowLocations.length === 0) continue;

      hasCodeFlowLocations = true;
      for (let index = 0; index < flowLocations.length; index++) {
        const endpointType = flowLocations.length === 1
          ? "sink"
          : index === 0
            ? "source"
            : index === flowLocations.length - 1
              ? "sink"
              : undefined;
        addLocation(locations, {
          ...flowLocations[index],
          ...(endpointType && { type: endpointType }),
        });
      }
    }
  }

  for (const primaryLocation of result.locations ?? []) {
    const location = toFileLocation(primaryLocation);
    if (location) {
      addLocation(locations, {
        ...location,
        ...(!hasCodeFlowLocations && { type: "sink" as const }),
      });
    }
  }

  return locations;
}

function deduplicateLocations(locations: FileLocation[]): FileLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.file}:${location.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addLocation(locations: FileLocation[], candidate: FileLocation): void {
  const existing = locations.find(
    (location) =>
      location.file === candidate.file
      && location.line === candidate.line,
  );
  if (!existing) {
    locations.push(candidate);
  } else if (!existing.type && candidate.type) {
    existing.type = candidate.type;
  }
}

function toFileLocation(location: SarifLocation | undefined): FileLocation | undefined {
  const uri = location?.physicalLocation?.artifactLocation?.uri;
  const region = location?.physicalLocation?.region;
  const line = region?.startLine ?? region?.endLine;
  if (!uri || typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    return undefined;
  }
  return { file: normalizeUri(uri), line };
}

function normalizeUri(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // Keep the original URI when percent decoding fails.
  }
  return decoded
    .replace(/^file:\/\//i, "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
