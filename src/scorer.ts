import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type {
  EvalTask,
  Vulnerability,
  FindVulnsDetails,
  FixVulnsDetails,
  VulnType,
  Severity,
  VulnMatch,
  BreakdownEntry,
  AttackerReachableVulnerability,
  AttackerReachableCandidateDiagnostic,
  AttackerReachableEndpointMatchKind,
  AttackerReachableEndpointEvidence,
  AttackerReachableFailureReason,
  AttackerReachableFindingDiagnostic,
  AttackerReachableLocationComparison,
  AttackerReachableLocationRequirement,
  AttackerReachablePathMatch,
  AttackerReachableTypeComparison,
  AttackerReachableVulnerabilityDiagnostic,
  FileLocation,
} from "./types.js";

const anthropic = new Anthropic();

// ─── Find-Vulns Scoring ───────────────────────────────────────────────────────

/**
 * Parses the agent's output for a FINDINGS_JSON block and scores against known vulns.
 * Expected output format from agent: a section ending with:
 *   FINDINGS_JSON:
 *   ```json
 *   [{ "type": "...", "file": "...", "line": 42, "severity": "...", "description": "..." }]
 *   ```
 */
export function scoreFindVulns(agentOutput: string, task: EvalTask): FindVulnsDetails {
  const agentFindings = parseFindings(agentOutput);
  const knownVulns = task.knownVulns;

  const truePositives: VulnMatch[] = [];
  const matchedKnownIds = new Set<string>();
  const matchedFindingIdxs = new Set<number>();

  for (let i = 0; i < agentFindings.length; i++) {
    const found = agentFindings[i];
    const match = knownVulns.find(
      (kv) => !matchedKnownIds.has(kv.id) && vulnTypesMatch(kv.type, found.type),
    );
    if (match) {
      truePositives.push({ id: match.id, type: match.type, severity: match.severity });
      matchedKnownIds.add(match.id);
      matchedFindingIdxs.add(i);
    }
  }

  const falsePositives = agentFindings.filter((_, i) => !matchedFindingIdxs.has(i));
  const falseNegatives: VulnMatch[] = knownVulns
    .filter((kv) => !matchedKnownIds.has(kv.id))
    .map((kv) => ({ id: kv.id, type: kv.type, severity: kv.severity }));

  const precision = agentFindings.length === 0 ? 0 : truePositives.length / agentFindings.length;
  const recall = knownVulns.length === 0 ? 1 : truePositives.length / knownVulns.length;

  const byType = computeBreakdown(knownVulns, truePositives, falsePositives, (v) => v.type);
  const bySeverity = computeBreakdown(knownVulns, truePositives, falsePositives, (v) => v.severity);

  return { agentFindings, truePositives, falsePositives, falseNegatives, precision, recall, byType, bySeverity };
}

export const ATTACKER_REACHABLE_LINE_TOLERANCE = 5;

/**
 * VulnBench 2.0 scorer. A finding must match both the vulnerability label and
 * enough distinct source-to-sink locations to count as a true positive.
 */
export function scoreAttackerReachableFindVulns(
  agentOutput: string,
  task: EvalTask,
): FindVulnsDetails {
  const agentFindings = parseAttackerReachableFindings(agentOutput);
  const knownVulns = task.knownVulns.map((vulnerability) => {
    if (!isAttackerReachableVulnerability(vulnerability)) {
      throw new Error(
        `Task "${task.id}" uses attacker-reachable scoring with non-attacker-reachable ground truth`,
      );
    }
    return vulnerability;
  });

  const truePositives: VulnMatch[] = [];
  const matchedKnownIds = new Set<string>();
  const matchedFindingIdxs = new Set<number>();
  const candidateComparisons: AttackerReachableCandidateDiagnostic[] = [];
  const findingOutcomes: AttackerReachableFindingDiagnostic[] = [];

  for (let findingIndex = 0; findingIndex < agentFindings.length; findingIndex++) {
    const found = agentFindings[findingIndex];
    const candidates = knownVulns.map((known, knownIndex) => {
      const diagnostic = buildCandidateDiagnostic(found, known, knownIndex);
      diagnostic.groundTruthAlreadyMatchedBeforeFinding = matchedKnownIds.has(known.id);
      return { known, knownIndex, diagnostic };
    });
    const rankedCandidates = [...candidates].sort(compareCandidateEvaluations);
    const availableCandidates = candidates
      .filter((candidate) =>
        candidate.diagnostic.eligible
        && !candidate.diagnostic.groundTruthAlreadyMatchedBeforeFinding
      )
      .sort(compareCandidateEvaluations);
    const selectedCandidate = availableCandidates[0];

    for (const candidate of candidates) {
      candidate.diagnostic.ranking.rankAmongAllCandidates =
        rankedCandidates.indexOf(candidate) + 1;
      const availableRank = availableCandidates.indexOf(candidate);
      candidate.diagnostic.ranking.rankAmongAvailableCandidates =
        availableRank >= 0 ? availableRank + 1 : null;
      candidate.diagnostic.ranking.candidateCount = candidates.length;
      candidate.diagnostic.ranking.availableCandidateCount =
        availableCandidates.length;
      if (candidate === selectedCandidate) {
        candidate.diagnostic.selected = true;
        candidate.diagnostic.status = "selected";
      } else if (!candidate.diagnostic.eligible) {
        candidate.diagnostic.status = "ineligible";
      } else if (candidate.diagnostic.groundTruthAlreadyMatchedBeforeFinding) {
        candidate.diagnostic.status = "ground-truth-already-matched";
        candidate.diagnostic.failureReasons.push("ground-truth-already-matched");
      } else {
        candidate.diagnostic.status = "lower-ranked-candidate";
        candidate.diagnostic.failureReasons.push("lower-ranked-candidate");
      }
      candidateComparisons.push(candidate.diagnostic);
    }

    const bestCandidate = rankedCandidates[0];
    const eligibleCandidateVulnerabilityIds = candidates
      .filter((candidate) => candidate.diagnostic.eligible)
      .map((candidate) => candidate.known.id);

    if (!selectedCandidate) {
      findingOutcomes.push({
        findingId: found.id,
        status: "false-positive",
        ...(bestCandidate && {
          bestCandidateVulnerabilityId: bestCandidate.known.id,
        }),
        eligibleCandidateVulnerabilityIds,
        failureReason: eligibleCandidateVulnerabilityIds.length > 0
          ? "duplicate-finding"
          : candidates.some((candidate) => candidate.diagnostic.typeMatched)
            ? "endpoint-requirement-not-met"
            : "no-type-match",
      });
      continue;
    }

    const bestMatch = selectedCandidate.known;

    truePositives.push({
      id: bestMatch.id,
      type: bestMatch.type,
      severity: bestMatch.severity,
    });
    matchedKnownIds.add(bestMatch.id);
    matchedFindingIdxs.add(findingIndex);
    findingOutcomes.push({
      findingId: found.id,
      status: "matched",
      matchedVulnerabilityId: bestMatch.id,
      bestCandidateVulnerabilityId: bestCandidate?.known.id,
      eligibleCandidateVulnerabilityIds,
    });
  }

  const falsePositives = agentFindings.filter((_, index) => !matchedFindingIdxs.has(index));
  const falseNegatives: VulnMatch[] = knownVulns
    .filter((known) => !matchedKnownIds.has(known.id))
    .map((known) => ({ id: known.id, type: known.type, severity: known.severity }));
  const precision = agentFindings.length === 0
    ? 0
    : truePositives.length / agentFindings.length;
  const recall = knownVulns.length === 0
    ? 1
    : truePositives.length / knownVulns.length;
  const byType = computeBreakdown(
    knownVulns,
    truePositives,
    falsePositives,
    (vulnerability) => vulnerability.type,
  );
  const bySeverity = computeBreakdown(
    knownVulns,
    truePositives,
    falsePositives,
    (vulnerability) => vulnerability.severity,
  );
  const vulnerabilityOutcomes = buildVulnerabilityOutcomes(
    knownVulns,
    agentFindings,
    candidateComparisons,
  );

  return {
    agentFindings,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    byType,
    bySeverity,
    matchDiagnostics: {
      schemaVersion: "v2-endpoint-diagnostics-2",
      lineTolerance: ATTACKER_REACHABLE_LINE_TOLERANCE,
      candidateComparisons,
      findingOutcomes,
      vulnerabilityOutcomes,
    },
  };
}

export function findVulnsScore(details: FindVulnsDetails): number {
  const { precision, recall } = details;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ─── Per-type / Per-severity Breakdown ────────────────────────────────────────

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Computes a breakdown of precision/recall/F1 grouped by an arbitrary key
 * extracted from each vulnerability (e.g. `v => v.type` or `v => v.severity`).
 *
 * For each group:
 * - total  = number of ground-truth vulns in that group
 * - found  = number of those correctly identified (true positives)
 * - recall = found / total
 * - precision = found / (found + false positives in that group)
 * - f1     = harmonic mean of precision and recall
 */
function computeBreakdown(
  knownVulns: Vulnerability[],
  truePositives: VulnMatch[],
  falsePositives: Vulnerability[],
  keyFn: (v: { type: VulnType; severity: Severity }) => string,
): Record<string, BreakdownEntry> {
  const result: Record<string, BreakdownEntry> = {};

  const totalByKey = new Map<string, number>();
  for (const kv of knownVulns) {
    const key = keyFn(kv);
    totalByKey.set(key, (totalByKey.get(key) ?? 0) + 1);
  }

  const foundByKey = new Map<string, number>();
  for (const tp of truePositives) {
    const key = keyFn(tp);
    foundByKey.set(key, (foundByKey.get(key) ?? 0) + 1);
  }

  const fpByKey = new Map<string, number>();
  for (const fp of falsePositives) {
    const key = keyFn(fp);
    fpByKey.set(key, (fpByKey.get(key) ?? 0) + 1);
  }

  const allKeys = new Set([...totalByKey.keys(), ...fpByKey.keys()]);
  for (const key of allKeys) {
    const total = totalByKey.get(key) ?? 0;
    const found = foundByKey.get(key) ?? 0;
    const fp = fpByKey.get(key) ?? 0;
    const recall = total === 0 ? 0 : found / total;
    const prec = (found + fp) === 0 ? 0 : found / (found + fp);
    result[key] = { total, found, precision: prec, recall, f1: f1(prec, recall) };
  }

  return result;
}

// ─── Fix-Vulns Scoring ────────────────────────────────────────────────────────

/**
 * Uses Claude API directly to judge whether the fixed code in `fixedDir`
 * still contains the original vulnerabilities.
 */
export async function scoreFixVulns(
  fixedDir: string,
  task: EvalTask,
): Promise<FixVulnsDetails> {
  // Gather all source files from the fixed directory
  const files = gatherSourceFiles(fixedDir);
  const codeContext = files
    .map(({ path, content }) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const vulnList = task.knownVulns
    .map((v) => `- ${v.id}: ${v.type} in ${v.file} (${v.severity}) — ${v.description}`)
    .join("\n");

  const prompt = `You are a security code reviewer. The following code has been modified to fix security vulnerabilities.

Original vulnerabilities to fix:
${vulnList}

Modified code:
${codeContext}

For each vulnerability listed, determine if it has been fixed. Respond with JSON:
{
  "results": [
    { "id": "vuln-id", "fixed": true/false, "note": "brief explanation" }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";

  let results: Array<{ id: string; fixed: boolean; note: string }> = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      results = parsed.results ?? [];
    }
  } catch {
    // ignore parse errors
  }

  const fixedCount = results.filter((r) => r.fixed).length;
  const notes = results.map((r) => `${r.id}: ${r.fixed ? "✓" : "✗"} ${r.note}`).join("; ");

  return {
    vulnsAttempted: task.knownVulns.length,
    vulnsFixed: fixedCount,
    judgeNotes: notes || text.slice(0, 300),
  };
}

export function fixVulnsScore(details: FixVulnsDetails): number {
  if (details.vulnsAttempted === 0) return 1;
  return details.vulnsFixed / details.vulnsAttempted;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFindings(output: string): Vulnerability[] {
  // Look for a JSON block after FINDINGS_JSON: marker
  const marker = /FINDINGS_JSON:\s*```(?:json)?\s*([\s\S]*?)```/i;
  const match = output.match(marker);
  if (!match) {
    // Fall back to any JSON array in the output
    const arrayMatch = output.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) return [];
    try {
      return normalizeFindings(JSON.parse(arrayMatch[0]));
    } catch {
      return [];
    }
  }
  try {
    return normalizeFindings(JSON.parse(match[1]));
  } catch {
    return [];
  }
}

function parseAttackerReachableFindings(output: string): AttackerReachableVulnerability[] {
  const marker = /FINDINGS_JSON:\s*```(?:json)?\s*([\s\S]*?)```/i;
  const markerMatch = output.match(marker);
  const json = markerMatch?.[1] ?? extractFirstJsonArray(output);
  if (!json) return [];

  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? normalizeAttackerReachableFindings(parsed)
      : [];
  } catch {
    return [];
  }
}

function normalizeAttackerReachableFindings(
  raw: unknown[],
): AttackerReachableVulnerability[] {
  return raw
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    )
    .map((item, index) => {
      const rawType = String(item.type ?? "other");
      const rawAliases = Array.isArray(item.typeAliases)
        ? item.typeAliases.filter((alias): alias is string => typeof alias === "string")
        : [];
      const typeAliases = [...new Set([rawType, ...rawAliases])];
      const filesRelated = normalizeReportedLocations(item.filesRelated);
      const inferredMultiLine = filesRelated.length > 1 ? "yes" : "no";
      const inferredCrossFile = new Set(
        filesRelated.map((location) => normalizeFilePath(location.file)),
      ).size > 1
        ? "yes"
        : "no";

      return {
        id: `found-${index}`,
        type: normalizeVulnType(rawType),
        typeAliases,
        severity: normalizeSeverity(String(item.severity ?? "medium")),
        filesRelated,
        file: filesRelated[0]?.file ?? "",
        line: filesRelated[0]?.line,
        description: String(item.description ?? ""),
        vulnerabilityImpact: String(item.vulnerabilityImpact ?? ""),
        codeFlowMultiLine: item.codeFlowMultiLine === "yes" || item.codeFlowMultiLine === "no"
          ? item.codeFlowMultiLine
          : inferredMultiLine,
        codeFlowCrossFile: item.codeFlowCrossFile === "yes" || item.codeFlowCrossFile === "no"
          ? item.codeFlowCrossFile
          : inferredCrossFile,
        ...(item.codeFlowCrossService === "yes" || item.codeFlowCrossService === "no"
          ? { codeFlowCrossService: item.codeFlowCrossService }
          : {}),
      };
    });
}

function normalizeReportedLocations(value: unknown): FileLocation[] {
  if (!Array.isArray(value)) return [];
  return uniqueLocations(
    value.flatMap((location) => {
      if (typeof location !== "object" || location === null) return [];
      const candidate = location as Record<string, unknown>;
      if (
        typeof candidate.file !== "string"
        || candidate.file.trim().length === 0
        || typeof candidate.line !== "number"
        || !Number.isInteger(candidate.line)
        || candidate.line < 1
      ) {
        return [];
      }
      const type = candidate.type === "source" || candidate.type === "sink"
        ? candidate.type
        : undefined;
      return [{
        file: candidate.file,
        line: candidate.line,
        ...(type && { type }),
      }];
    }),
  );
}

function extractFirstJsonArray(output: string): string | undefined {
  const start = output.indexOf("[");
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index++) {
    const char = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }
  return undefined;
}

function normalizeFindings(raw: unknown[]): Vulnerability[] {
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, idx) => ({
      id: `found-${idx}`,
      type: normalizeVulnType(String(item.type ?? "other")),
      severity: normalizeSeverity(String(item.severity ?? "medium")),
      file: String(item.file ?? ""),
      line: typeof item.line === "number" ? item.line : undefined,
      description: String(item.description ?? ""),
    }));
}

function normalizeVulnType(raw: string): VulnType {
  const map: Record<string, VulnType> = {
    "sql injection": "sql-injection",
    "sql-injection": "sql-injection",
    "sqli": "sql-injection",
    "cross-site scripting": "xss",
    "xss": "xss",
    "dom xss": "xss",
    "dom-xss": "xss",
    "dom based xss": "xss",
    "path traversal": "path-traversal",
    "path-traversal": "path-traversal",
    "directory traversal": "path-traversal",
    "command injection": "command-injection",
    "command-injection": "command-injection",
    "rce": "command-injection",
    "code injection": "code-injection",
    "code-injection": "code-injection",
    "eval injection": "code-injection",
    "mass assignment": "mass-assignment",
    "mass-assignment": "mass-assignment",
    "template injection": "template-injection",
    "template-injection": "template-injection",
    "hardcoded credentials": "hardcoded-credentials",
    "hardcoded-credentials": "hardcoded-credentials",
    "hardcoded secret": "hardcoded-credentials",
    "hardcoded non-cryptographic secret": "hardcoded-credentials",
    "hardcoded-non-cryptographic-secret": "hardcoded-credentials",
    "insecure deserialization": "insecure-deserialization",
    "insecure-deserialization": "insecure-deserialization",
    "idor": "idor",
    "broken object level authorization": "idor",
    "xxe": "xxe",
    "xml external entity": "xxe",
    "ssrf": "ssrf",
    "server-side request forgery": "ssrf",
    "server side request forgery": "ssrf",
    "open redirect": "open-redirect",
    "open-redirect": "open-redirect",
    "csrf": "csrf",
    "cross-site request forgery": "csrf",
    "cross site request forgery": "csrf",
    "information-exposure": "information-exposure",
    "information exposure": "information-exposure",
    "information disclosure": "information-exposure",
    "info leak": "information-exposure",
    "sensitive data exposure": "information-exposure",
    "allocation-of-resources-without-limits-or-throttling": "allocation-of-resources-without-limits-or-throttling",
    "allocation-of-resources-without-limits": "allocation-of-resources-without-limits-or-throttling",
    "allocation of resources without limits or throttling": "allocation-of-resources-without-limits-or-throttling",
    "missing rate limiting": "allocation-of-resources-without-limits-or-throttling",
    "no rate limit": "allocation-of-resources-without-limits-or-throttling",
    "resource exhaustion": "allocation-of-resources-without-limits-or-throttling",
    "denial of service": "allocation-of-resources-without-limits-or-throttling",
    "dos": "allocation-of-resources-without-limits-or-throttling",
    "redos": "redos",
    "redospolynomial": "redos",
    "regular expression denial of service": "redos",
    "regular-expression-denial-of-service": "redos",
    "polynomial regular expression denial of service": "redos",
    "improper code sanitization": "improper-code-sanitization",
    "improper-code-sanitization": "improper-code-sanitization",
    "code injection through eval": "improper-code-sanitization",
    "unsafe eval": "improper-code-sanitization",
    "improper type validation": "improper-type-validation",
    "improper-type-validation": "improper-type-validation",
    "type confusion": "improper-type-validation",
    "insecure transport": "insecure-transport",
    "insecure-transport": "insecure-transport",
    "cleartext transmission": "insecure-transport",
    "cleartext-transmission": "insecure-transport",
    "http to https": "insecure-transport",
    "http-to-https": "insecure-transport",
    "insecure cryptography": "insecure-cryptography",
    "insecure-cryptography": "insecure-cryptography",
    "insecure cipher": "insecure-cryptography",
    "weak cryptography": "insecure-cryptography",
    "weak-cryptography": "insecure-cryptography",
    "weak cipher": "insecure-cryptography",
    "broken cryptographic algorithm": "insecure-cryptography",
    "risky cryptographic algorithm": "insecure-cryptography",
    "sensitive cookie with secure flag false": "information-exposure",
    "sensitive-cookie-with-secure-flag-false": "information-exposure",
    "insecure cookie": "information-exposure",
    "missing secure cookie": "information-exposure",
    "prototype pollution": "prototype-pollution",
    "prototype-pollution": "prototype-pollution",
    "prototype pollution vulnerability": "prototype-pollution",
    "origin validation error": "origin-validation-error",
    "origin-validation-error": "origin-validation-error",
    "cors misconfiguration": "origin-validation-error",
    "permissive cors": "origin-validation-error",
    "insecure cors": "origin-validation-error",
    "too permissive cors": "origin-validation-error",
    "overly permissive cors": "origin-validation-error",
    "other": "other",
  };
  const key = raw.toLowerCase().trim();
  return map[key] ?? "other";
}

function normalizeSeverity(raw: string): Severity {
  const s = raw.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

function vulnTypesMatch(known: VulnType, found: VulnType): boolean {
  if (known === found) return true;
  // Allow "other" to match anything as a fallback
  if (found === "other") return false;
  return false;
}

function isAttackerReachableVulnerability(
  vulnerability: Vulnerability,
): vulnerability is AttackerReachableVulnerability {
  return Array.isArray((vulnerability as Partial<AttackerReachableVulnerability>).filesRelated);
}

function compareAttackerReachableTypes(
  known: AttackerReachableVulnerability,
  found: AttackerReachableVulnerability,
): AttackerReachableTypeComparison[] {
  const knownLabels = [known.type, ...(known.typeAliases ?? [])];
  const foundLabels = [found.type, ...(found.typeAliases ?? [])];
  const comparisons: AttackerReachableTypeComparison[] = [];

  for (const knownLabel of knownLabels) {
    for (const foundLabel of foundLabels) {
      const normalizedKnown = normalizeTypeLabel(knownLabel);
      const normalizedFound = normalizeTypeLabel(foundLabel);
      const canonicalKnown = normalizeVulnType(normalizedKnown);
      const canonicalFound = normalizeVulnType(normalizedFound);
      const matchedBy = normalizedKnown === normalizedFound
        ? "normalized-label" as const
        : canonicalKnown !== "other"
            && canonicalFound !== "other"
            && canonicalKnown === canonicalFound
          ? "canonical-type" as const
          : null;
      comparisons.push({
        groundTruthLabel: knownLabel,
        reportedLabel: foundLabel,
        normalizedGroundTruthLabel: normalizedKnown,
        normalizedReportedLabel: normalizedFound,
        canonicalGroundTruthType: canonicalKnown,
        canonicalReportedType: canonicalFound,
        matchedBy,
      });
    }
  }
  return comparisons;
}

function normalizeTypeLabel(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface CandidateEvaluation {
  known: AttackerReachableVulnerability;
  knownIndex: number;
  diagnostic: AttackerReachableCandidateDiagnostic;
}

function buildCandidateDiagnostic(
  found: AttackerReachableVulnerability,
  known: AttackerReachableVulnerability,
  groundTruthCandidateIndex: number,
): AttackerReachableCandidateDiagnostic {
  const typeComparisons = compareAttackerReachableTypes(known, found);
  const typeMatched = typeComparisons.some((comparison) => comparison.matchedBy !== null);
  const locationMatch = summarizeLocationMatches(known.filesRelated, found.filesRelated);
  const locationRequirement = locationRequirementFor(known.filesRelated);
  const locationRequirementMet = attackerReachableLocationsMatch(
    known.filesRelated,
    locationMatch,
  );
  const endpointMatchKind = endpointMatchKindFor(locationMatch.matchedEndpointTypes);
  const endpointEvidenceStrength = endpointMatchKind === "source-and-sink"
    ? 3
    : endpointMatchKind === "sink-only"
      ? 2
      : endpointMatchKind === "source-only"
        ? 1
        : 0;
  const closestEndpointEvidence = [...locationMatch.endpointEvidence]
    .sort((a, b) => a.absoluteLineDelta - b.absoluteLineDelta)[0];
  const failureReasons: AttackerReachableFailureReason[] = [];

  if (!typeMatched) {
    failureReasons.push("type-mismatch");
  }
  if (!locationRequirementMet) {
    if (locationMatch.totalMatches === 0) {
      failureReasons.push("no-location-match");
    }
    if (locationRequirement === "single-endpoint") {
      failureReasons.push("single-endpoint-requirement-not-met");
    } else if (locationRequirement === "both-locations-or-either-endpoint") {
      failureReasons.push("two-location-requirement-not-met");
    } else if (
      locationMatch.missingEndpointTypes.includes("source")
      && locationMatch.missingEndpointTypes.includes("sink")
    ) {
      failureReasons.push("missing-source-and-sink");
    } else if (locationMatch.missingEndpointTypes.includes("source")) {
      failureReasons.push("missing-source");
    } else if (locationMatch.missingEndpointTypes.includes("sink")) {
      failureReasons.push("missing-sink");
    }
  }

  return {
    findingId: found.id,
    vulnerabilityId: known.id,
    groundTruthCandidateIndex,
    reportedType: found.typeAliases?.[0] ?? found.type,
    groundTruthType: known.type,
    typeMatched,
    typeComparisons,
    groundTruthLocationCount: uniqueLocations(known.filesRelated).length,
    reportedLocationCount: uniqueLocations(found.filesRelated).length,
    locationRequirement,
    locationRequirementMet,
    totalLocationMatches: locationMatch.totalMatches,
    matchedEndpointTypes: locationMatch.matchedEndpointTypes,
    missingEndpointTypes: locationMatch.missingEndpointTypes,
    distinctSourceSinkPairMatched: locationMatch.sourceAndSinkMatched,
    endpointEvidence: locationMatch.endpointEvidence,
    locationComparisons: locationMatch.locationComparisons,
    ranking: {
      endpointMatchKind,
      endpointEvidenceStrength,
      closestEndpointLineDelta: closestEndpointEvidence?.lineDelta ?? null,
      closestEndpointAbsoluteLineDelta:
        closestEndpointEvidence?.absoluteLineDelta ?? null,
      rankAmongAllCandidates: 0,
      rankAmongAvailableCandidates: null,
      candidateCount: 0,
      availableCandidateCount: 0,
      factors: {
        eligible: typeMatched && locationRequirementMet,
        typeMatched,
        distinctSourceSinkPairMatched: locationMatch.sourceAndSinkMatched,
        matchedEndpointTypeCount: locationMatch.matchedEndpointTypes.length,
        totalLocationMatches: locationMatch.totalMatches,
        groundTruthCandidateIndex,
      },
    },
    eligible: typeMatched && locationRequirementMet,
    groundTruthAlreadyMatchedBeforeFinding: false,
    selected: false,
    status: "ineligible",
    failureReasons,
  };
}

function endpointMatchKindFor(
  matchedEndpointTypes: Array<"source" | "sink">,
): AttackerReachableEndpointMatchKind {
  const sourceMatched = matchedEndpointTypes.includes("source");
  const sinkMatched = matchedEndpointTypes.includes("sink");
  if (sourceMatched && sinkMatched) return "source-and-sink";
  if (sinkMatched) return "sink-only";
  if (sourceMatched) return "source-only";
  return "none";
}

function compareCandidateEvaluations(
  a: CandidateEvaluation,
  b: CandidateEvaluation,
): number {
  return compareCandidateDiagnostics(a.diagnostic, b.diagnostic)
    || a.knownIndex - b.knownIndex;
}

function compareCandidateDiagnostics(
  a: AttackerReachableCandidateDiagnostic,
  b: AttackerReachableCandidateDiagnostic,
): number {
  return Number(b.eligible) - Number(a.eligible)
    || Number(b.typeMatched) - Number(a.typeMatched)
    || Number(b.distinctSourceSinkPairMatched) - Number(a.distinctSourceSinkPairMatched)
    || b.matchedEndpointTypes.length - a.matchedEndpointTypes.length
    || b.totalLocationMatches - a.totalLocationMatches;
}

function locationRequirementFor(
  knownLocations: FileLocation[],
): AttackerReachableLocationRequirement {
  const locationCount = uniqueLocations(knownLocations).length;
  if (locationCount === 1) return "single-endpoint";
  if (locationCount === 2) return "both-locations-or-either-endpoint";
  return "source-and-sink";
}

function buildVulnerabilityOutcomes(
  knownVulns: AttackerReachableVulnerability[],
  agentFindings: AttackerReachableVulnerability[],
  candidateComparisons: AttackerReachableCandidateDiagnostic[],
): AttackerReachableVulnerabilityDiagnostic[] {
  return knownVulns.map((known) => {
    const comparisons = candidateComparisons.filter(
      (comparison) => comparison.vulnerabilityId === known.id,
    );
    const selected = comparisons.find((comparison) => comparison.selected);
    const bestCandidate = [...comparisons].sort(compareCandidateDiagnostics)[0];
    const comparedFindingIds = comparisons.map((comparison) => comparison.findingId);

    if (selected) {
      return {
        vulnerabilityId: known.id,
        status: "matched",
        matchedFindingId: selected.findingId,
        bestCandidateFindingId: bestCandidate?.findingId,
        comparedFindingIds,
      };
    }

    const failureReason = agentFindings.length === 0
      ? "no-reported-findings" as const
      : !comparisons.some((comparison) => comparison.typeMatched)
        ? "no-type-match" as const
        : !comparisons.some((comparison) => comparison.eligible)
          ? "endpoint-requirement-not-met" as const
          : "eligible-candidate-not-selected" as const;

    return {
      vulnerabilityId: known.id,
      status: "missed",
      ...(bestCandidate && { bestCandidateFindingId: bestCandidate.findingId }),
      comparedFindingIds,
      failureReason,
    };
  });
}

function countLocationMatches(
  knownLocations: FileLocation[],
  foundLocations: FileLocation[],
): number {
  const known = uniqueLocations(knownLocations);
  const found = uniqueLocations(foundLocations);
  const foundToKnown = new Array<number>(found.length).fill(-1);

  function assignKnown(knownIndex: number, visitedFound: Set<number>): boolean {
    for (let foundIndex = 0; foundIndex < found.length; foundIndex++) {
      if (
        visitedFound.has(foundIndex)
        || !locationsMatch(known[knownIndex], found[foundIndex])
      ) {
        continue;
      }
      visitedFound.add(foundIndex);
      if (
        foundToKnown[foundIndex] === -1
        || assignKnown(foundToKnown[foundIndex], visitedFound)
      ) {
        foundToKnown[foundIndex] = knownIndex;
        return true;
      }
    }
    return false;
  }

  let matches = 0;
  for (let knownIndex = 0; knownIndex < known.length; knownIndex++) {
    if (assignKnown(knownIndex, new Set())) matches++;
  }
  return matches;
}

interface LocationMatchSummary {
  totalMatches: number;
  endpointTypesMatched: number;
  sourceAndSinkMatched: boolean;
  matchedEndpointTypes: Array<"source" | "sink">;
  missingEndpointTypes: Array<"source" | "sink">;
  endpointEvidence: AttackerReachableEndpointEvidence[];
  locationComparisons: AttackerReachableLocationComparison[];
}

function summarizeLocationMatches(
  knownLocations: FileLocation[],
  foundLocations: FileLocation[],
): LocationMatchSummary {
  const known = uniqueLocations(knownLocations);
  const found = uniqueLocations(foundLocations);
  const locationComparisons = buildLocationComparisons(known, found);
  const endpointEvidence: AttackerReachableEndpointEvidence[] = locationComparisons
    .filter((comparison) =>
      comparison.locationMatched
      && (
        comparison.groundTruth.type === "source"
        || comparison.groundTruth.type === "sink"
      )
      && comparison.pathMatch !== "none"
    )
    .map((comparison) => ({
      endpoint: comparison.groundTruth.type as "source" | "sink",
      groundTruthLocationIndex: comparison.groundTruthLocationIndex,
      reportedLocationIndex: comparison.reportedLocationIndex,
      groundTruth: comparison.groundTruth,
      reported: comparison.reported,
      pathMatch: comparison.pathMatch as Exclude<AttackerReachablePathMatch, "none">,
      lineDelta: comparison.lineDelta,
      absoluteLineDelta: comparison.absoluteLineDelta,
    }));
  const sourceEvidence = endpointEvidence.filter((evidence) => evidence.endpoint === "source");
  const sinkEvidence = endpointEvidence.filter((evidence) => evidence.endpoint === "sink");
  const sourceAndSinkMatched = sourceEvidence.some((source) =>
    sinkEvidence.some((sink) => sink.reportedLocationIndex !== source.reportedLocationIndex)
  );
  const groundTruthEndpointTypes = [...new Set(
    known.flatMap((location) =>
      location.type === "source" || location.type === "sink"
        ? [location.type]
        : []
    ),
  )] as Array<"source" | "sink">;
  const matchedEndpointTypes = groundTruthEndpointTypes.filter((type) =>
    endpointEvidence.some((evidence) => evidence.endpoint === type)
  );
  const missingEndpointTypes = groundTruthEndpointTypes.filter(
    (type) => !matchedEndpointTypes.includes(type),
  );

  return {
    totalMatches: countLocationMatches(known, found),
    endpointTypesMatched: matchedEndpointTypes.length,
    sourceAndSinkMatched,
    matchedEndpointTypes,
    missingEndpointTypes,
    endpointEvidence,
    locationComparisons,
  };
}

function buildLocationComparisons(
  knownLocations: FileLocation[],
  foundLocations: FileLocation[],
): AttackerReachableLocationComparison[] {
  const comparisons: AttackerReachableLocationComparison[] = [];
  for (
    let groundTruthLocationIndex = 0;
    groundTruthLocationIndex < knownLocations.length;
    groundTruthLocationIndex++
  ) {
    for (
      let reportedLocationIndex = 0;
      reportedLocationIndex < foundLocations.length;
      reportedLocationIndex++
    ) {
      const groundTruth = knownLocations[groundTruthLocationIndex];
      const reported = foundLocations[reportedLocationIndex];
      const pathMatch = filePathMatchKind(groundTruth.file, reported.file);
      const lineDelta = reported.line - groundTruth.line;
      const absoluteLineDelta = Math.abs(lineDelta);
      const withinLineTolerance = absoluteLineDelta
        <= ATTACKER_REACHABLE_LINE_TOLERANCE;
      comparisons.push({
        groundTruthLocationIndex,
        reportedLocationIndex,
        groundTruth,
        reported,
        pathMatch,
        lineDelta,
        absoluteLineDelta,
        withinLineTolerance,
        locationMatched: pathMatch !== "none" && withinLineTolerance,
      });
    }
  }
  return comparisons;
}

function attackerReachableLocationsMatch(
  knownLocations: FileLocation[],
  match: LocationMatchSummary,
): boolean {
  const locationCount = uniqueLocations(knownLocations).length;
  if (locationCount === 1) {
    return match.endpointTypesMatched >= 1 && match.totalMatches >= 1;
  }
  if (locationCount === 2) {
    return match.totalMatches >= 2 || match.endpointTypesMatched >= 1;
  }
  return match.sourceAndSinkMatched;
}

function locationsMatch(known: FileLocation, found: FileLocation): boolean {
  return filePathsMatch(known.file, found.file)
    && Math.abs(known.line - found.line) <= ATTACKER_REACHABLE_LINE_TOLERANCE;
}

function filePathsMatch(knownPath: string, foundPath: string): boolean {
  return filePathMatchKind(knownPath, foundPath) !== "none";
}

function filePathMatchKind(
  knownPath: string,
  foundPath: string,
): AttackerReachablePathMatch {
  const known = normalizeFilePath(knownPath);
  const found = normalizeFilePath(foundPath);
  if (known === found) {
    return "relative-path";
  }

  const knownBase = baseName(known);
  const foundBase = baseName(found);
  if (knownBase === foundBase && (known === knownBase || found === foundBase)) {
    return "basename";
  }
  return found.endsWith(`/${known}`) || known.endsWith(`/${found}`)
    ? "relative-path"
    : "none";
}

function normalizeFilePath(value: string): string {
  let path = value;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the original path when percent decoding fails.
  }
  return path
    .replace(/^file:\/\//i, "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function uniqueLocations(locations: FileLocation[]): FileLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const normalizedFile = normalizeFilePath(location.file);
    const key = `${normalizedFile}:${location.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function gatherSourceFiles(dir: string): Array<{ path: string; content: string }> {
  const sourceExtensions = [".js", ".ts", ".py", ".rb", ".php", ".java", ".go", ".html", ".hbs"];
  const results: Array<{ path: string; content: string }> = [];

  function walk(currentDir: string, relativePrefix: string): void {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(fullPath, rel);
        } else if (entry.isFile() && sourceExtensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            results.push({ path: rel, content: readFileSync(fullPath, "utf-8") });
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // directory not accessible
    }
  }

  walk(dir, "");
  return results;
}
