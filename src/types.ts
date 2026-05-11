export type VulnType =
  | "sql-injection"
  | "xss"
  | "path-traversal"
  | "command-injection"
  | "hardcoded-credentials"
  | "insecure-deserialization"
  | "idor"
  | "xxe"
  | "ssrf"
  | "open-redirect"
  | "csrf"
  | "information-exposure"
  | "allocation-of-resources-without-limits-or-throttling"
  | "improper-type-validation"
  | "prototype-pollution"
  | "origin-validation-error"
  | "other";

export type Severity = "critical" | "high" | "medium" | "low";

export interface Vulnerability {
  id: string;
  type: VulnType;
  severity: Severity;
  file: string;
  line?: number;
  description: string;
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

export const EVAL_CATEGORIES = {
  FIND_VULNS: {
    id: "find-vulns",
    name: "Find Vulnerabilities",
    description: "Agent identifies security vulnerabilities in code and reports findings",
    defaultSystemPrompt: `You are a security expert performing a code audit.
Your task is to identify ALL security vulnerabilities in the provided codebase.

After completing your analysis, you MUST output your findings in this exact format at the END of your response:

FINDINGS_JSON:
\`\`\`json
[
  {
    "type": "<one of the VulnType strings documented for this benchmark, e.g. sql-injection|xss|path-traversal|command-injection|hardcoded-credentials|ssrf|csrf|open-redirect|information-exposure|allocation-of-resources-without-limits-or-throttling|improper-type-validation|prototype-pollution|origin-validation-error|insecure-deserialization|idor|xxe|other>",
    "file": "filename.ext",
    "line": <line number or null>,
    "severity": "critical|high|medium|low",
    "description": "Brief explanation of the vulnerability"
  }
]
\`\`\`

Be thorough — scan all files. Include every distinct vulnerability you find.`,
    defaultPrompt: "Audit all files in this directory for security vulnerabilities. Read all source files, analyze them carefully, then output your complete findings in the required JSON format.",
  },
  LLM_FIND_VULNS: {
    id: "llm-find-vulns",
    name: "Find LLM Integration Vulnerabilities",
    description: "Agent identifies security vulnerabilities specific to LLM integration code and reports findings",
    defaultSystemPrompt: `You are a security expert performing a code audit focused on LLM integration security.
Your task is to identify ALL security vulnerabilities in the provided codebase, paying special attention to LLM-specific risks such as prompt injection, unsafe output handling, and insecure API integrations.

After completing your analysis, you MUST output your findings in this exact format at the END of your response:

FINDINGS_JSON:
\`\`\`json
[
  {
    "type": "<one of the VulnType strings documented for this benchmark, e.g. sql-injection|xss|path-traversal|command-injection|hardcoded-credentials|ssrf|csrf|open-redirect|information-exposure|allocation-of-resources-without-limits-or-throttling|improper-type-validation|prototype-pollution|origin-validation-error|insecure-deserialization|idor|xxe|other>",
    "file": "filename.ext",
    "line": <line number or null>,
    "severity": "critical|high|medium|low",
    "description": "Brief explanation of the vulnerability"
  }
]
\`\`\`

Be thorough — scan all files. Include every distinct vulnerability you find.`,
    defaultPrompt: "Audit all files in this directory for security vulnerabilities, with particular focus on LLM integration security issues. Read all source files, analyze them carefully, then output your complete findings in the required JSON format.",
  },
  APP_FIND_VULNS: {
    id: "app-find-vulns",
    name: "Find App Vulnerabilities",
    description: "Agent identifies security vulnerabilities in a full application codebase and reports findings",
    defaultSystemPrompt: `You are a security expert performing a code audit of a full application.
Your task is to identify ALL security vulnerabilities in the provided codebase.

After completing your analysis, you MUST output your findings in this exact format at the END of your response:

FINDINGS_JSON:
\`\`\`json
[
  {
    "type": "<one of the VulnType strings documented for this benchmark, e.g. sql-injection|xss|path-traversal|command-injection|hardcoded-credentials|ssrf|csrf|open-redirect|information-exposure|allocation-of-resources-without-limits-or-throttling|improper-type-validation|prototype-pollution|origin-validation-error|insecure-deserialization|idor|xxe|other>",
    "file": "filename.ext",
    "line": <line number or null>,
    "severity": "critical|high|medium|low",
    "description": "Brief explanation of the vulnerability"
  }
]
\`\`\`

Be thorough — scan all files. Include every distinct vulnerability you find.`,
    defaultPrompt: "Audit all files in this directory for security vulnerabilities. This is a full application — read all source files across the project, analyze them carefully, then output your complete findings in the required JSON format.",
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

/** Standard agent run using the Claude Agent SDK. */
export interface ModelRunConfig {
  type?: "model";
  id: string;
  name: string;
  model: string;
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

export interface FindVulnsDetails {
  agentFindings: Vulnerability[];
  truePositives: string[]; // vuln IDs correctly found
  falsePositives: number;
  falseNegatives: string[]; // vuln IDs missed
  precision: number;
  recall: number;
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
  /** Distinguishes model (Agent SDK) runs from command (SAST tool) runs in JSONL output */
  runConfigType: "model" | "command";
  score: number; // 0–1
  metrics: BenchmarkMetrics;
  details: FindVulnsDetails | FixVulnsDetails;
  timestamp: string;
  error?: string;
}
