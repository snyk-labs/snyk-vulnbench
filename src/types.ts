import type { PromptTemplateId } from "./prompt-templates.js";

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
  | "mass-assignment"
  | "template-injection"
  | "other";

export type Severity = "critical" | "high" | "medium" | "low";

export type GroundTruthKind = "v1" | "attacker-reachable";
export type PrimaryMetricKind =
  | "f1"
  | "attacker-reachable-vulnerability-recall"
  | "localized-vulnerability-recall"
  | "fix-rate";

export type FixtureOrigin = "real-repository" | "benchmark-created" | "synthetic" | "unknown";

export interface FixtureRuntime {
  name: string;
  version?: string;
}

export interface FixtureMetadata {
  schemaVersion: number;
  id: string;
  name: string;
  kind: string;
  languages: string[];
  frameworks: string[];
  runtimes: FixtureRuntime[];
  datastores: string[];
  source?: {
    repository?: string;
    baseCommit?: string;
  };
  provenance: {
    origin: FixtureOrigin;
    seeded?: boolean;
    seedCommit?: string;
  };
  /** Unresolved metadata questions; omit once the manifest is complete. */
  todos?: string[];
}

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
  codeFlowMultiLine: "yes" | "no";
  codeFlowCrossFile: "yes" | "no";
  /** Captured when present, but intentionally excluded from V2 scoring. */
  codeFlowCrossService?: "yes" | "no";
}

/**
 * Canonical pre-scorer finding produced by model, scanner, and security-harness
 * adapters. Scorers normalize these records and assign synthetic IDs.
 */
export interface FindingRecord {
  type: string;
  typeAliases?: string[];
  file?: string;
  line?: number | null;
  filesRelated?: FileLocation[];
  severity: string;
  description: string;
  vulnerabilityImpact?: string;
  codeFlowMultiLine?: "yes" | "no";
  codeFlowCrossFile?: "yes" | "no";
  codeFlowCrossService?: "yes" | "no";
}

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

export interface CodexSecurityTelemetry {
  packageVersion: string;
  pluginVersion: string;
  scanId: string;
  threadId?: string;
  target: {
    kind: string;
    targetId?: string;
    revision?: string;
    snapshotDigest?: string;
  };
  coverage: {
    completeness: "complete" | "partial" | "unknown";
    mode: string;
    surfaceCount: number;
    deferredCount: number;
    explicitExclusionCount: number;
    needsFollowUpCount: number;
  };
  parser: CodexSecurityParserDiagnostics;
  workerCount?: number;
  subagentCount?: number;
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
    "type": "<one of the VulnType strings documented for this benchmark, e.g. sql-injection|xss|path-traversal|command-injection|code-injection|hardcoded-credentials|ssrf|csrf|open-redirect|information-exposure|allocation-of-resources-without-limits-or-throttling|redos|improper-code-sanitization|improper-type-validation|insecure-transport|insecure-cryptography|prototype-pollution|origin-validation-error|mass-assignment|template-injection|insecure-deserialization|idor|xxe|other>",
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
    "type": "<the vulnerability type, e.g. sql-injection|xss|path-traversal|prototype-pollution|improper-type-validation|mass-assignment|template-injection>",
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
    "codeFlowMultiLine": "yes|no",
    "codeFlowCrossFile": "yes|no"
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
  /** Absolute path to the fixture's agent working directory. */
  fixture: string;
  /** Stable fixture directory identifier. */
  fixtureId: string;
  /** Project-level metadata loaded from fixtures/<fixtureId>/fixture.json. */
  fixtureMetadata: FixtureMetadata;
  /** SHA-256 hash of the fixture manifest used for this task. */
  fixtureMetadataHash: string;
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

/**
 * `"default"` is a harness sentinel: it omits the SDK effort option so Claude
 * Code chooses the model's native default. It is useful for models that do not
 * expose configurable effort levels.
 */
export type EffortLevel =
  | "default"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type ThinkingConfig =
  | { type: "adaptive" }
  | { type: "enabled"; budgetTokens?: number }
  | { type: "disabled" };

export type AgentRunnerId = "claude-code" | "codex-cli";
export type RequiredToolPolicyId = "snyk-code-once";
export type ModelGatewayId = "litellm";

/** Standard coding-agent run using a native agent harness. */
export interface ModelRunConfig {
  type?: "model";
  /** Defaults to claude-code for backward compatibility. */
  runner?: AgentRunnerId;
  id: string;
  name: string;
  model: string;
  /** Controls how much reasoning effort Claude applies. `"default"` delegates to Claude Code. */
  effort?: EffortLevel;
  /** Controls extended thinking mode. Defaults to { type: "adaptive" }. */
  thinking?: ThinkingConfig;
  /** User-prompt augmentation selected from the prompt template registry. */
  promptTemplateId?: PromptTemplateId;
  /** Tool-use requirement enforced after the run. */
  requiredToolPolicyId?: RequiredToolPolicyId;
  /** Routes model requests through a configured gateway. */
  gateway?: ModelGatewayId;
  mcpServers?: Record<string, MCPServerConfig>;
  maxTurns?: number;
  /** Parent-process wall-clock deadline for CLI-backed agents. */
  timeoutMs?: number;
  supportedCategories?: EvalCategoryId[];
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
  /** Executable invoked directly without a shell, e.g. "snyk". */
  executable?: string;
  /** Argument vector; `{fixturePath}` is substituted within each argument. */
  args?: string[];
  /** @deprecated Legacy space-delimited command. Prefer executable + args. */
  command?: string;
  /** Parser key — must match an entry in the parser registry */
  parser: string;
  /** Hard wall-clock deadline for the command. Defaults to ten minutes. */
  timeoutMs?: number;
  supportedCategories?: EvalCategoryId[];
}

export interface DeepSecRunConfig {
  type: "deepsec";
  id: string;
  name: string;
  agent: "codex" | "claude";
  model: string;
  thinkingLevel: "minimal" | "low" | "medium" | "high" | "xhigh";
  maxTurns?: number;
  batchSize?: number;
  concurrency?: number;
  limit?: number;
  timeoutMs?: number;
  supportedCategories?: EvalCategoryId[];
  gateway?: ModelGatewayId;
}

export interface CodexSecurityRunConfig {
  type: "codex-security";
  id: string;
  name: string;
  model: string;
  effort: Exclude<EffortLevel, "default">;
  mode?: "standard";
  auth?: "api-key";
  maxCostUsd?: number;
  timeoutMs?: number;
  supportedCategories?: EvalCategoryId[];
  gateway?: ModelGatewayId;
}

export type RunConfig =
  | ModelRunConfig
  | CommandRunConfig
  | DeepSecRunConfig
  | CodexSecurityRunConfig;

export interface RunConfigGroup {
  id: string;
  name: string;
  configIds: string[];
  category?: EvalCategoryId;
  defaultRepetitions?: number;
}

export interface RunnerCapabilities {
  findVulns: boolean;
  fixVulns: boolean;
  mcp: boolean;
}

export interface ToolCallRecord {
  tool: string;
  durationMs: number;
  /** Estimated tokens in the tool's input parameters (approx. chars/4) */
  inputTokensEst: number;
  /** Estimated tokens in the tool's output/result (approx. chars/4) */
  outputTokensEst: number;
}

export interface McpTelemetry {
  /** MCP server names requested by the run config. */
  configuredServers: string[];
  /** Connection state reported by the Agent SDK initialization message. */
  serverStatuses: Array<{ name: string; status: string }>;
  /** Number of configured MCP tools advertised to the agent at session startup. */
  advertisedToolCount: number;
  /** Invocation count and aggregate duration for each MCP tool used in the run. */
  toolStats: Record<string, { count: number; totalDurationMs: number }>;
}

export interface BenchmarkMetrics {
  sessionDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Reasoning output tokens when the runner exposes them. */
  totalReasoningOutputTokens?: number;
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
  /** MCP connection, availability, and invocation telemetry. */
  mcp: McpTelemetry;
  /** Codex Security scan contract and coverage diagnostics. */
  codexSecurity?: CodexSecurityTelemetry;
  /** Runner identity and provenance when exposed by the adapter. */
  runner?: {
    id: string;
    version?: string;
    sessionId?: string;
    tokenSource: "reported" | "estimated" | "unavailable";
    toolSource: "reported" | "estimated" | "unavailable";
  };
}

export interface RunOutput {
  finalText: string;
  /** Canonical findings for find tasks. Text-only runners may omit this. */
  findings?: FindingRecord[];
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

export interface F1Metric {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EndpointRecallMetric {
  matched: number;
  total: number;
  recall: number | null;
}

export interface FullFlowOverlapMetric {
  matchedLocationGroups: number;
  totalLocationGroups: number;
  overlap: number | null;
}

/** Complementary V2 scores; omitted for V1 compatibility. */
export interface AttackerReachableScoreSuite {
  /** Secondary V2 F1 metric using the same endpoint-localized matches as the recall headline. */
  lenientEndpointLocalizedF1: F1Metric;
  /** Type plus exact-line source-to-sink evidence. */
  strictFlowF1: F1Metric;
  /** Type-only, one-to-one vulnerability detection. */
  detectionOnlyF1: F1Metric;
  /** Endpoint-group recall; repeated sources/sinks are alternative anchors. */
  endpointRecall: {
    source: EndpointRecallMetric;
    sink: EndpointRecallMetric;
  };
  /** Tolerant flow-location coverage; endpoint alternatives count once per role. */
  fullFlowOverlap: FullFlowOverlapMetric;
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
  /** Present for VulnBench 2.0 runs; the headline precision/recall remain unchanged. */
  scoreSuite?: AttackerReachableScoreSuite;
  /** Present for scanners that report locations without endpoint roles. */
  localizedScore?: F1Metric & { lineTolerance: number };
}

export interface FixVulnsDetails {
  vulnsAttempted: number;
  vulnsFixed: number;
  judgeNotes: string;
}

export interface EvalResult {
  taskId: string;
  taskName: string;
  fixtureId: string;
  fixtureMetadata: FixtureMetadata;
  fixtureMetadataHash: string;
  runConfigId: string;
  runConfigName: string;
  /** Execution adapter independent of model/tool configuration identity. */
  runnerId: string;
  runnerVersion: string | null;
  runnerCapabilities: RunnerCapabilities;
  requestedModel: string | null;
  /** Ground-truth schema used to score this run. */
  groundTruth: GroundTruthKind;
  /** Defines the semantics of the top-level `score` field. */
  primaryMetric: PrimaryMetricKind;
  /** Distinguishes model (Agent SDK) runs from command (SAST tool) runs in JSONL output */
  runConfigType: "model" | "command";
  /** Effort level used for this run (model runs only). Null for command runs. */
  effort: EffortLevel | null;
  /** Thinking config used for this run (model runs only). Null for command runs. */
  thinking: ThinkingConfig | null;
  /** Resolved user-prompt template used for this run. Null for command runs. */
  promptTemplateId: PromptTemplateId | null;
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
  fixtureId: string;
  fixtureMetadata: FixtureMetadata;
  fixtureMetadataHash: string;
  runConfigId: string;
  runConfigName: string;
  runnerId: string;
  runnerVersion: string | null;
  requestedModel: string | null;
  runConfigType: "model" | "command";
  groundTruth: GroundTruthKind;
  primaryMetric: PrimaryMetricKind;
  effort: EffortLevel | null;
  thinking: ThinkingConfig | null;
  promptTemplateId: PromptTemplateId | null;
  repetitions: number;
  score: number;
  /** Sample standard deviation of score across repetitions. Zero when repetitions < 2. */
  scoreStdDev: number;
  recall: number | null;
  precision: number | null;
  scoreSuite?: AttackerReachableScoreSuite;
  sessionDurationMs: number;
  /** Sample standard deviation of wall-clock runtime across repetitions. Zero when repetitions < 2. */
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

/** Config-level metrics restricted to one ground-truth generation. */
export interface AggregatedGroundTruthResult {
  /** Null only when a ground-truth bucket contains unlike task metrics (for example V1 find + fix). */
  primaryMetric: PrimaryMetricKind | null;
  fixtureCount: number;
  repetitions: number;
  score: number | null;
  scoreStdDev: number | null;
  recall: number | null;
  precision: number | null;
  scoreSuite?: AttackerReachableScoreSuite;
  sessionDurationMs: number;
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

/** Headline numbers for one config, macro-averaged across all fixtures. */
export interface AggregatedConfigResult {
  runConfigId: string;
  runConfigName: string;
  runnerId: string;
  runnerVersion: string | null;
  requestedModel: string | null;
  runConfigType: "model" | "command";
  /** Resolved user-prompt template used by this config. Null for command runs. */
  promptTemplateId: PromptTemplateId | null;
  /** Ground-truth generations included in the overall headline. */
  groundTruths: GroundTruthKind[];
  /** Generation-specific headline metrics for direct V1/V2 analysis. */
  byGroundTruth: Partial<Record<GroundTruthKind, AggregatedGroundTruthResult>>;
  /** Null when the selected tasks use unlike primary metrics. */
  primaryMetric: PrimaryMetricKind | null;
  fixtureCount: number;
  repetitions: number;
  score: number | null;
  /** Sample standard deviation of repetition-level headline scores. Zero when repetitions < 2. */
  scoreStdDev: number | null;
  recall: number | null;
  precision: number | null;
  scoreSuite?: AttackerReachableScoreSuite;
  sessionDurationMs: number;
  /** Sample standard deviation of repetition-level headline runtimes. Zero when repetitions < 2. */
  sessionDurationStdDevMs: number;
  totalTokens: number;
  totalCostUsd: number | null;
}
