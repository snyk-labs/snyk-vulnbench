export type VulnType =
  | "sql-injection"
  | "xss"
  | "path-traversal"
  | "command-injection"
  | "code-injection"
  | "hardcoded-credentials"
  | "insecure-deserialization"
  | "idor"
  | "xxe"
  | "ssrf"
  | "open-redirect"
  | "csrf"
  | "information-exposure"
  | "allocation-of-resources-without-limits-or-throttling"
  | "redos"
  | "improper-code-sanitization"
  | "improper-type-validation"
  | "insecure-transport"
  | "insecure-cryptography"
  | "prototype-pollution"
  | "origin-validation-error"
  | "other";

export type Severity = "critical" | "high" | "medium" | "low";

export type GroundTruthKind = "v1" | "attacker-reachable";

export interface FileLocation {
  file: string;
  line: number;
  /** VulnBench 2.0 endpoint role. Intermediate flow locations omit this. */
  type?: "source" | "sink";
}

export interface Vulnerability {
  id: string;
  type: VulnType;
  severity: Severity;
  file: string;
  line?: number;
  description: string;
}

/**
 * VulnBench 2.0 ground truth. The inherited `file`/`line` fields are normalized
 * from the first `filesRelated` entry so existing reporting code can continue
 * to consume the common Vulnerability shape.
 */
export interface AttackerReachableVulnerability extends Vulnerability {
  typeAliases?: string[];
  filesRelated: FileLocation[];
  vulnerabilityImpact: string;
  codeflowMultiLine: "yes" | "no";
  codeflowCrossFile: "yes" | "no";
  /** Captured when present, but intentionally excluded from V2 scoring. */
  codeflowCrossService?: "yes" | "no";
}

export interface EvalCategory {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Default system prompt used when a task JSON does not override it. */
  readonly defaultSystemPrompt: string;
  /** Default user-facing prompt used when a task JSON does not override it. */
  readonly defaultPrompt: string;
}

const FIND_VULNS_DEFAULTS = {
  defaultSystemPrompt: `You are a security expert performing a code audit.
Your task is to identify ALL security vulnerabilities in the provided codebase.

After completing your analysis, you MUST output your findings in this exact format at the END of your response:

FINDINGS_JSON:
\`\`\`json
[
  {
    "type": "<one of the VulnType strings documented for this benchmark, e.g. sql-injection|xss|path-traversal|command-injection|code-injection|hardcoded-credentials|ssrf|csrf|open-redirect|information-exposure|allocation-of-resources-without-limits-or-throttling|redos|improper-code-sanitization|improper-type-validation|insecure-transport|insecure-cryptography|prototype-pollution|origin-validation-error|insecure-deserialization|idor|xxe|other>",
    "file": "filename.ext",
    "line": <line number or null>,
    "severity": "critical|high|medium|low",
    "description": "Brief explanation of the vulnerability"
  }
]
\`\`\`

Be thorough — scan all files. Include every distinct vulnerability you find.`,
  defaultPrompt: "Audit all files in this directory for security vulnerabilities. Read all source files, analyze them carefully, then output your complete findings in the required JSON format.",
} as const;

const ATTACKER_REACHABLE_FIND_VULNS_DEFAULTS = {
  defaultSystemPrompt: `You are a security expert performing a source-code reachability audit.
Your task is to identify ALL security vulnerabilities that are genuinely reachable through the provided application's source code. Trace attacker-controlled input through the application to the vulnerable operation, and report each distinct vulnerability once.

After completing your analysis, you MUST output your findings in this exact format at the END of your response:

FINDINGS_JSON:
\`\`\`json
[
  {
    "type": "<the vulnerability type, e.g. sql-injection|xss|path-traversal|prototype-pollution|improper-type-validation>",
    "typeAliases": ["optional alternative vulnerability names"],
    "filesRelated": [
      {
        "file": "path/relative/to/the/project.ext",
        "line": <line number>,
        "type": "source|sink"
      }
    ],
    "severity": "critical|high|medium|low",
    "description": "Brief explanation of the attacker-controlled source, code flow, and vulnerable sink",
    "vulnerabilityImpact": "Security impact if the vulnerability is exploited",
    "codeflowMultiLine": "yes|no",
    "codeflowCrossFile": "yes|no"
  }
]
\`\`\`

For every finding, include all relevant source-to-sink code-flow locations in filesRelated, in flow order. Mark the attacker-controlled entry location as "source" and the vulnerable operation as "sink"; omit type from intermediate locations. Use project-relative paths and precise line numbers. Do not report configuration-only or synthetic findings that are not reachable through application source code.`,
  defaultPrompt: "Audit all application source files for attacker-reachable security vulnerabilities. Trace each vulnerability from attacker-controlled input to its vulnerable sink, then output every distinct finding with its complete filesRelated code flow in the required JSON format.",
} as const;

export const EVAL_CATEGORIES = {
  FIND_VULNS: {
    id: "find-vulns",
    name: "Find Vulnerabilities",
    description: "Agent identifies security vulnerabilities in code and reports findings",
    ...FIND_VULNS_DEFAULTS,
  },
  LLM_FIND_VULNS: {
    id: "llm-find-vulns",
    name: "Find LLM Integration Vulnerabilities",
    description: "Agent identifies security vulnerabilities specific to LLM integration code and reports findings",
    ...FIND_VULNS_DEFAULTS,
  },
  APP_FIND_VULNS: {
    id: "app-find-vulns",
    name: "Find App Vulnerabilities",
    description: "Agent identifies security vulnerabilities in a full application codebase and reports findings",
    ...FIND_VULNS_DEFAULTS,
  },
  ATTACKER_REACHABLE_FIND_VULNS: {
    id: "attacker-reachable-find-vulns",
    name: "Find Attacker-Reachable Vulnerabilities",
    description: "Agent identifies source-code-reachable vulnerabilities and reports their code flows",
    ...ATTACKER_REACHABLE_FIND_VULNS_DEFAULTS,
  },
  FIX_VULNS: {
    id: "fix-vulns",
    name: "Fix Vulnerabilities",
    description: "Agent remediates security vulnerabilities by editing source files",
    defaultSystemPrompt: `You are a security expert tasked with fixing ALL security vulnerabilities in a codebase.
Apply minimal, targeted fixes that eliminate each vulnerability without changing application logic.
After fixing, briefly explain what you changed and why.`,
    defaultPrompt: "This codebase contains security vulnerabilities. Read all source files, identify the vulnerabilities, and fix all of them. Apply secure coding practices.",
  },
} as const satisfies Record<string, EvalCategory>;

/** Union of all registered category id strings — expands automatically as categories are added. */
export type EvalCategoryId = typeof EVAL_CATEGORIES[keyof typeof EVAL_CATEGORIES]["id"];

export interface EvalTask {
  id: string;
  name: string;
  category: EvalCategory;
  /** Path to fixture directory (relative to project root) */
  fixture: string;
  /** System prompt to inject */
  systemPrompt?: string;
  /** Main prompt sent to agent */
  prompt: string;
  /** Selects the ground-truth schema, parser, and scorer. Defaults to VulnBench 1.0. */
  groundTruth: GroundTruthKind;
  /** Ground-truth vulnerabilities in the fixture */
  knownVulns: Vulnerability[];
  /** Max agent turns allowed */
  maxTurns?: number;
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type EffortLevel = "low" | "medium" | "high" | "max";

export type ThinkingConfig =
  | { type: "adaptive" }
  | { type: "enabled"; budgetTokens?: number }
  | { type: "disabled" };

/** Standard agent run using the Claude Agent SDK. */
export interface ModelRunConfig {
  type?: "model";
  id: string;
  name: string;
  model: string;
  /** Controls how much reasoning effort Claude applies. Defaults to "high". */
  effort?: EffortLevel;
  /** Controls extended thinking mode. Defaults to { type: "adaptive" }. */
  thinking?: ThinkingConfig;
  mcpServers?: Record<string, MCPServerConfig>;
  maxTurns?: number;
}

/**
 * SAST or other CLI tool run.
 * The command is a template where `{fixturePath}` is substituted at runtime.
 * `parser` is a key into the registry in src/parsers/index.ts.
 */
export interface CommandRunConfig {
  type: "command";
  id: string;
  name: string;
  /** e.g. "snyk code test {fixturePath} --json" */
  command: string;
  /** Parser key — must match an entry in the parser registry */
  parser: string;
}

export type RunConfig = ModelRunConfig | CommandRunConfig;

export interface ToolCallRecord {
  tool: string;
  durationMs: number;
  /** Estimated tokens in the tool's input parameters (approx. chars/4) */
  inputTokensEst: number;
  /** Estimated tokens in the tool's output/result (approx. chars/4) */
  outputTokensEst: number;
}

export interface BenchmarkMetrics {
  sessionDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Tokens served from the prompt cache (billed at reduced rate but still consumed) */
  totalCacheReadTokens: number;
  /** Tokens written into the prompt cache on this session */
  totalCacheCreationTokens: number;
  /** Total logical input tokens (input + cache_read + cache_creation) — the actual context size the model processed */
  totalLogicalInputTokens: number;
  /** Session cost in USD from the SDK (accounts for cached vs non-cached pricing). Null when unavailable. */
  totalCostUsd: number | null;
  totalTurns: number;
  toolCalls: ToolCallRecord[];
  /** Aggregated per-tool stats */
  toolStats: Record<string, { count: number; totalDurationMs: number; totalInputTokensEst: number; totalOutputTokensEst: number }>;
  /** Unique file paths touched by Read, Write, or Edit tool calls */
  filesScanned: string[];
}

export interface RunOutput {
  finalText: string;
  metrics: BenchmarkMetrics;
  error?: string;
}

export interface VulnMatch {
  id: string;
  type: VulnType;
  severity: Severity;
}

export interface BreakdownEntry {
  total: number;
  found: number;
  precision: number;
  recall: number;
  f1: number;
}

export type AttackerReachablePathMatch = "relative-path" | "basename" | "none";
export type AttackerReachableEndpointMatchKind =
  | "source-and-sink"
  | "sink-only"
  | "source-only"
  | "none";
export type AttackerReachableLocationRequirement =
  | "single-endpoint"
  | "both-locations-or-either-endpoint"
  | "source-and-sink";
export type AttackerReachableCandidateStatus =
  | "selected"
  | "ineligible"
  | "ground-truth-already-matched"
  | "lower-ranked-candidate";
export type AttackerReachableFailureReason =
  | "type-mismatch"
  | "no-location-match"
  | "single-endpoint-requirement-not-met"
  | "two-location-requirement-not-met"
  | "missing-source"
  | "missing-sink"
  | "missing-source-and-sink"
  | "ground-truth-already-matched"
  | "lower-ranked-candidate";

export interface AttackerReachableTypeComparison {
  groundTruthLabel: string;
  reportedLabel: string;
  normalizedGroundTruthLabel: string;
  normalizedReportedLabel: string;
  canonicalGroundTruthType: VulnType;
  canonicalReportedType: VulnType;
  matchedBy: "normalized-label" | "canonical-type" | null;
}

export interface AttackerReachableLocationComparison {
  groundTruthLocationIndex: number;
  reportedLocationIndex: number;
  groundTruth: FileLocation;
  reported: FileLocation;
  pathMatch: AttackerReachablePathMatch;
  lineDelta: number;
  absoluteLineDelta: number;
  withinLineTolerance: boolean;
  locationMatched: boolean;
}

export interface AttackerReachableEndpointEvidence {
  endpoint: "source" | "sink";
  groundTruthLocationIndex: number;
  reportedLocationIndex: number;
  groundTruth: FileLocation;
  reported: FileLocation;
  pathMatch: Exclude<AttackerReachablePathMatch, "none">;
  lineDelta: number;
  absoluteLineDelta: number;
}

export interface AttackerReachableCandidateRanking {
  /** Compact endpoint evidence classification; does not itself change eligibility. */
  endpointMatchKind: AttackerReachableEndpointMatchKind;
  /** Evidence tier for analysis: both=3, sink=2, source=1, none=0. */
  endpointEvidenceStrength: 0 | 1 | 2 | 3;
  /** Signed offset of the closest endpoint match, or null when no endpoint matched. */
  closestEndpointLineDelta: number | null;
  closestEndpointAbsoluteLineDelta: number | null;
  /** 1-based rank among every ground-truth candidate for this reported finding. */
  rankAmongAllCandidates: number;
  /** 1-based rank after excluding already-consumed/ineligible candidates. */
  rankAmongAvailableCandidates: number | null;
  candidateCount: number;
  availableCandidateCount: number;
  /** Exact signals used by the current candidate comparator, in priority order. */
  factors: {
    eligible: boolean;
    typeMatched: boolean;
    distinctSourceSinkPairMatched: boolean;
    matchedEndpointTypeCount: number;
    totalLocationMatches: number;
    groundTruthCandidateIndex: number;
  };
}

export interface AttackerReachableCandidateDiagnostic {
  findingId: string;
  vulnerabilityId: string;
  groundTruthCandidateIndex: number;
  reportedType: string;
  groundTruthType: string;
  typeMatched: boolean;
  typeComparisons: AttackerReachableTypeComparison[];
  groundTruthLocationCount: number;
  reportedLocationCount: number;
  locationRequirement: AttackerReachableLocationRequirement;
  locationRequirementMet: boolean;
  totalLocationMatches: number;
  matchedEndpointTypes: Array<"source" | "sink">;
  missingEndpointTypes: Array<"source" | "sink">;
  distinctSourceSinkPairMatched: boolean;
  endpointEvidence: AttackerReachableEndpointEvidence[];
  locationComparisons: AttackerReachableLocationComparison[];
  ranking: AttackerReachableCandidateRanking;
  eligible: boolean;
  groundTruthAlreadyMatchedBeforeFinding: boolean;
  selected: boolean;
  status: AttackerReachableCandidateStatus;
  failureReasons: AttackerReachableFailureReason[];
}

export interface AttackerReachableFindingDiagnostic {
  findingId: string;
  status: "matched" | "false-positive";
  matchedVulnerabilityId?: string;
  bestCandidateVulnerabilityId?: string;
  eligibleCandidateVulnerabilityIds: string[];
  failureReason?: "no-type-match" | "endpoint-requirement-not-met" | "duplicate-finding";
}

export interface AttackerReachableVulnerabilityDiagnostic {
  vulnerabilityId: string;
  status: "matched" | "missed";
  matchedFindingId?: string;
  bestCandidateFindingId?: string;
  comparedFindingIds: string[];
  failureReason?: "no-reported-findings" | "no-type-match" | "endpoint-requirement-not-met" | "eligible-candidate-not-selected";
}

export interface AttackerReachableScoringDiagnostics {
  schemaVersion: "v2-endpoint-diagnostics-2";
  lineTolerance: number;
  candidateComparisons: AttackerReachableCandidateDiagnostic[];
  findingOutcomes: AttackerReachableFindingDiagnostic[];
  vulnerabilityOutcomes: AttackerReachableVulnerabilityDiagnostic[];
}

export interface FindVulnsDetails {
  agentFindings: Vulnerability[];
  truePositives: VulnMatch[];
  falsePositives: Vulnerability[];
  falseNegatives: VulnMatch[];
  precision: number;
  recall: number;
  byType: Record<string, BreakdownEntry>;
  bySeverity: Record<string, BreakdownEntry>;
  /** Present for VulnBench 2.0 runs; omitted for V1 compatibility. */
  matchDiagnostics?: AttackerReachableScoringDiagnostics;
}

export interface FixVulnsDetails {
  vulnsAttempted: number;
  vulnsFixed: number;
  judgeNotes: string;
}

export interface EvalResult {
  taskId: string;
  taskName: string;
  runConfigId: string;
  runConfigName: string;
  /** Ground-truth schema used to score this run. */
  groundTruth: GroundTruthKind;
  /** Distinguishes model (Agent SDK) runs from command (SAST tool) runs in JSONL output */
  runConfigType: "model" | "command";
  /** Effort level used for this run (model runs only). Null for command runs. */
  effort: EffortLevel | null;
  /** Thinking config used for this run (model runs only). Null for command runs. */
  thinking: ThinkingConfig | null;
  score: number; // 0–1
  metrics: BenchmarkMetrics;
  details: FindVulnsDetails | FixVulnsDetails;
  timestamp: string;
  /** 1-indexed repetition number (e.g. 2 means this is the 2nd run of the same task+config). */
  repetition: number;
  /** Total repetitions requested for this task+config pair. */
  totalRepetitions: number;
  error?: string;
}

/** Aggregated metrics for one (task, config) pair across repeated runs. */
export interface AggregatedTaskResult {
  taskId: string;
  taskName: string;
  runConfigId: string;
  runConfigName: string;
  runConfigType: "model" | "command";
  groundTruth: GroundTruthKind;
  effort: EffortLevel | null;
  thinking: ThinkingConfig | null;
  repetitions: number;
  score: number;
  /** Sample standard deviation of score across repetitions. Zero when repetitions < 2. */
  scoreStdDev: number;
  recall: number | null;
  precision: number | null;
  sessionDurationMs: number;
  /** Sample standard deviation of wall-clock runtime across repetitions. Zero when repetitions < 2. */
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

/** Config-level metrics restricted to one ground-truth generation. */
export interface AggregatedGroundTruthResult {
  fixtureCount: number;
  repetitions: number;
  score: number;
  scoreStdDev: number;
  recall: number | null;
  precision: number | null;
  sessionDurationMs: number;
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

/** Headline numbers for one config, macro-averaged across all fixtures. */
export interface AggregatedConfigResult {
  runConfigId: string;
  runConfigName: string;
  runConfigType: "model" | "command";
  /** Ground-truth generations included in the overall headline. */
  groundTruths: GroundTruthKind[];
  /** Generation-specific headline metrics for direct V1/V2 analysis. */
  byGroundTruth: Partial<Record<GroundTruthKind, AggregatedGroundTruthResult>>;
  fixtureCount: number;
  repetitions: number;
  score: number;
  /** Sample standard deviation of repetition-level headline scores. Zero when repetitions < 2. */
  scoreStdDev: number;
  recall: number | null;
  precision: number | null;
  sessionDurationMs: number;
  /** Sample standard deviation of repetition-level headline runtimes. Zero when repetitions < 2. */
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}
