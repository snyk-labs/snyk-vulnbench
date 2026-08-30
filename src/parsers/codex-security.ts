import type {
  Finding as CodexSecurityFinding,
  FindingsDocument,
} from "@openai/codex-security";
import type {
  FileLocation,
  FindingRecord,
  GroundTruthKind,
  Severity,
  VulnType,
} from "../types.js";

export interface CodexSecurityTypeMappingDiagnostic {
  findingIndex: number;
  findingId?: string;
  ruleId: string;
  category: string;
  cwe: string[];
  resolvedType: VulnType;
  mappingSource: "ruleId" | "category" | "cwe" | "fallback";
}

export interface CodexSecurityRoleMappingDiagnostic {
  findingIndex: number;
  originalRole?: string;
  mappedEndpoint?: "source" | "sink";
  file: string;
  line: number;
}

export interface CodexSecurityParserDiagnostics {
  schemaVersion: "codex-security-parser-diagnostics-1";
  documentType: string;
  documentSchemaVersion: string;
  scanId: string;
  findingCount: number;
  informationalCount: number;
  typeMappings: CodexSecurityTypeMappingDiagnostic[];
  roleMappings: CodexSecurityRoleMappingDiagnostic[];
  skippedFindings: Array<{ findingIndex: number; reason: string }>;
}

export interface ParsedCodexSecurityFindings {
  findings: FindingRecord[];
  diagnostics: CodexSecurityParserDiagnostics;
}

const TYPE_PATTERNS: Array<[RegExp, VulnType]> = [
  [/\b(sql[-_ ]?injection|sqli)\b/i, "sql-injection"],
  [/\b(cross[-_ ]?site[-_ ]?scripting|xss|dom[-_ ]?xss)\b/i, "xss"],
  [/\b(path|directory)[-_ ]?traversal\b/i, "path-traversal"],
  [/\b(command|os)[-_ ]?injection\b/i, "command-injection"],
  [/\b(code|eval)[-_ ]?injection\b/i, "code-injection"],
  [/\b(hardcoded|embedded)[-_ ]?(credential|secret|password|key)s?\b/i, "hardcoded-credentials"],
  [/\b(insecure[-_ ]?deserialization|unsafe[-_ ]?deserialization)\b/i, "insecure-deserialization"],
  [/\b(idor|insecure[-_ ]?direct[-_ ]?object[-_ ]?reference)\b/i, "idor"],
  [/\b(xxe|xml[-_ ]?external[-_ ]?entit(?:y|ies))\b/i, "xxe"],
  [/\b(ssrf|server[-_ ]?side[-_ ]?request[-_ ]?forgery)\b/i, "ssrf"],
  [/\bopen[-_ ]?redirect\b/i, "open-redirect"],
  [/\b(csrf|cross[-_ ]?site[-_ ]?request[-_ ]?forgery)\b/i, "csrf"],
  [/\b(information|data)[-_ ]?(exposure|disclosure|leak)\b/i, "information-exposure"],
  [/\b(resource[-_ ]?exhaustion|uncontrolled[-_ ]?resource|allocation[-_ ]?without[-_ ]?limits)\b/i, "allocation-of-resources-without-limits-or-throttling"],
  [/\b(redos|regular[-_ ]?expression[-_ ]?denial)\b/i, "redos"],
  [/\bprototype[-_ ]?pollution\b/i, "prototype-pollution"],
  [/\b(origin[-_ ]?validation|cors[-_ ]?misconfiguration|permissive[-_ ]?cors)\b/i, "origin-validation-error"],
  [/\bmass[-_ ]?assignment\b/i, "mass-assignment"],
  [/\btemplate[-_ ]?injection\b/i, "template-injection"],
  [/\b(insecure|weak)[-_ ]?cryptograph/i, "insecure-cryptography"],
  [/\b(insecure[-_ ]?transport|cleartext[-_ ]?transmission)\b/i, "insecure-transport"],
  [/\bimproper[-_ ]?type[-_ ]?validation\b/i, "improper-type-validation"],
  [/\bimproper[-_ ]?(code[-_ ]?)?sanitization\b/i, "improper-code-sanitization"],
];

const CWE_TYPES: Record<string, VulnType> = {
  "22": "path-traversal",
  "78": "command-injection",
  "79": "xss",
  "80": "xss",
  "89": "sql-injection",
  "94": "code-injection",
  "259": "hardcoded-credentials",
  "319": "insecure-transport",
  "327": "insecure-cryptography",
  "328": "insecure-cryptography",
  "330": "insecure-cryptography",
  "346": "origin-validation-error",
  "352": "csrf",
  "400": "allocation-of-resources-without-limits-or-throttling",
  "502": "insecure-deserialization",
  "601": "open-redirect",
  "611": "xxe",
  "639": "idor",
  "757": "insecure-transport",
  "770": "allocation-of-resources-without-limits-or-throttling",
  "798": "hardcoded-credentials",
  "915": "mass-assignment",
  "918": "ssrf",
  "942": "origin-validation-error",
  "1321": "prototype-pollution",
  "1333": "redos",
};

const SOURCE_ROLES = new Set(["entrypoint", "entrypoint_wrapper", "source"]);
const SINK_ROLES = new Set(["sink", "root_control", "concrete_implementation"]);

export function parseCodexSecurityFindings(
  value: unknown,
  groundTruth: GroundTruthKind,
): ParsedCodexSecurityFindings {
  const document = parseFindingsDocument(value);
  const findings: FindingRecord[] = [];
  const diagnostics: CodexSecurityParserDiagnostics = {
    schemaVersion: "codex-security-parser-diagnostics-1",
    documentType: document.documentType,
    documentSchemaVersion: document.schemaVersion,
    scanId: document.scanId,
    findingCount: document.findings.length,
    informationalCount: 0,
    typeMappings: [],
    roleMappings: [],
    skippedFindings: [],
  };

  document.findings.forEach((finding, findingIndex) => {
    const locations = collectLocations(finding, findingIndex, diagnostics);
    if (locations.length === 0) {
      diagnostics.skippedFindings.push({
        findingIndex,
        reason: "finding has no valid source location",
      });
      return;
    }

    const typeMapping = mapCodexSecurityType(finding);
    diagnostics.typeMappings.push({
      findingIndex,
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      category: finding.taxonomy.category,
      cwe: finding.taxonomy.cwe,
      ...typeMapping,
    });

    const severity = normalizeSeverity(finding.severity.level);
    if (finding.severity.level === "informational") {
      diagnostics.informationalCount++;
    }
    const aliases = uniqueStrings([
      finding.title,
      finding.taxonomy.category,
      finding.ruleId,
      ...finding.taxonomy.cwe,
    ]);
    const description = finding.summary || finding.title;
    const impact = extractImpact(finding) || description;

    findings.push(groundTruth === "attacker-reachable"
      ? {
          type: typeMapping.resolvedType,
          typeAliases: aliases,
          filesRelated: locations,
          severity,
          description,
          vulnerabilityImpact: impact,
          codeFlowMultiLine: locations.length > 1 ? "yes" : "no",
          codeFlowCrossFile: new Set(locations.map((location) => location.file)).size > 1
            ? "yes"
            : "no",
        }
      : {
          type: typeMapping.resolvedType,
          typeAliases: aliases,
          file: locations[0].file,
          line: locations[0].line,
          severity,
          description,
        });
  });

  return { findings, diagnostics };
}

function parseFindingsDocument(value: unknown): FindingsDocument {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!isRecord(parsed)) {
    throw new Error("Codex Security findings output must be an object");
  }
  if (parsed.documentType !== "codex-security.findings") {
    throw new Error(
      `Unexpected Codex Security documentType "${String(parsed.documentType)}"`,
    );
  }
  if (parsed.schemaVersion !== "1.0") {
    throw new Error(
      `Unsupported Codex Security findings schemaVersion "${String(parsed.schemaVersion)}"`,
    );
  }
  if (typeof parsed.scanId !== "string" || !Array.isArray(parsed.findings)) {
    throw new Error("Codex Security findings document is missing scanId or findings");
  }
  return parsed as unknown as FindingsDocument;
}

function mapCodexSecurityType(
  finding: CodexSecurityFinding,
): Pick<CodexSecurityTypeMappingDiagnostic, "resolvedType" | "mappingSource"> {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(finding.ruleId)) {
      return { resolvedType: type, mappingSource: "ruleId" };
    }
  }
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(finding.taxonomy.category)) {
      return { resolvedType: type, mappingSource: "category" };
    }
  }
  for (const cwe of finding.taxonomy.cwe) {
    const normalized = cwe.replace(/^CWE-/i, "");
    const type = CWE_TYPES[normalized];
    if (type) return { resolvedType: type, mappingSource: "cwe" };
  }
  return { resolvedType: "other", mappingSource: "fallback" };
}

function collectLocations(
  finding: CodexSecurityFinding,
  findingIndex: number,
  diagnostics: CodexSecurityParserDiagnostics,
): FileLocation[] {
  const locations = [
    ...finding.locations.map((location) => ({
      path: location.path,
      line: location.startLine,
      role: location.role,
    })),
    ...(finding.codeEvidence ?? []).map((evidence) => ({
      path: evidence.path,
      line: evidence.startLine,
      role: evidence.role,
    })),
  ];
  const unique = new Map<string, FileLocation>();

  for (const location of locations) {
    if (
      typeof location.path !== "string"
      || location.path.trim().length === 0
      || !Number.isInteger(location.line)
      || location.line < 1
    ) {
      continue;
    }
    const mappedEndpoint = mapRole(location.role);
    diagnostics.roleMappings.push({
      findingIndex,
      ...(typeof location.role === "string" && { originalRole: location.role }),
      ...(mappedEndpoint && { mappedEndpoint }),
      file: location.path,
      line: location.line,
    });
    const key = `${location.path}\0${location.line}`;
    const candidate: FileLocation = {
      file: location.path,
      line: location.line,
      ...(mappedEndpoint && { type: mappedEndpoint }),
    };
    const previous = unique.get(key);
    if (!previous || (!previous.type && candidate.type)) unique.set(key, candidate);
  }

  return [...unique.values()];
}

function mapRole(role: unknown): "source" | "sink" | undefined {
  if (typeof role !== "string") return undefined;
  const normalized = role.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (SOURCE_ROLES.has(normalized)) return "source";
  if (SINK_ROLES.has(normalized)) return "sink";
  return undefined;
}

function normalizeSeverity(
  severity: CodexSecurityFinding["severity"]["level"],
): Severity {
  return severity === "informational" ? "low" : severity;
}

function extractImpact(finding: CodexSecurityFinding): string | undefined {
  const impact = finding.attackPath?.impact;
  if (typeof impact === "string") return impact;
  if (isRecord(impact)) {
    for (const key of ["rationale", "why", "level"]) {
      if (typeof impact[key] === "string" && impact[key].trim()) return impact[key];
    }
  }
  return undefined;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(
    values.filter((value): value is string =>
      typeof value === "string" && value.trim().length > 0
    ),
  )];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
