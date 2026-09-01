import { readdirSync, readFileSync } from "fs";
import { createHash } from "node:crypto";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { EVAL_CATEGORIES } from "../types.js";
import {
  isPromptTemplateId,
  isPromptTemplateSupported,
} from "../prompt-templates.js";
import type {
  AttackerReachableVulnerability,
  CodexSecurityRunConfig,
  CommandRunConfig,
  DeepSecRunConfig,
  EvalCategoryId,
  EvalTask,
  FileLocation,
  FixtureMetadata,
  GroundTruthKind,
  ModelRunConfig,
  RunConfig,
  RunConfigGroup,
  Severity,
  Vulnerability,
  VulnType,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(PROJECT_ROOT, "fixtures");
const EVALS_DIR = resolve(PROJECT_ROOT, "evals");
const TASKS_DIR = resolve(EVALS_DIR, "tasks");
const RUN_CONFIGS_FILE = resolve(EVALS_DIR, "run-configs.json");
const RUN_CONFIG_GROUPS_FILE = resolve(EVALS_DIR, "run-config-groups.json");

/** Shape of a task JSON file in evals/tasks/ */
interface TaskJson {
  id: string;
  name: string;
  /** Must match an EvalCategoryId ("find-vulns" | "fix-vulns") */
  category: EvalCategoryId;
  /** Name of the fixture subdirectory inside fixtures/ */
  fixture: string;
  /** Omitted for VulnBench 1.0 tasks. */
  groundTruth?: GroundTruthKind;
  /** Override the category's default system prompt */
  systemPrompt?: string;
  /** Override the category's default user prompt */
  prompt?: string;
  maxTurns?: number;
}

export function loadFixtureMetadata(
  fixtureName: string,
): { metadata: FixtureMetadata; metadataHash: string } {
  const metadataPath = join(FIXTURES_DIR, fixtureName, "fixture.json");
  let manifestText: string;
  let raw: unknown;
  try {
    manifestText = readFileSync(metadataPath, "utf-8");
    raw = JSON.parse(manifestText);
  } catch (err) {
    throw new Error(`Failed to read fixture.json for fixture "${fixtureName}" at ${metadataPath}: ${err}`);
  }

  const metadata = validateFixtureMetadata(fixtureName, raw);
  const metadataHash = createHash("sha256").update(manifestText).digest("hex");
  return { metadata, metadataHash };
}

export function validateFixtureMetadata(fixtureName: string, raw: unknown): FixtureMetadata {
  if (!isRecord(raw)) {
    throw invalidFixtureMetadata(fixtureName, "must be a JSON object");
  }

  const schemaVersion = requireFixtureNumber(raw.schemaVersion, fixtureName, "schemaVersion");
  const id = requireFixtureString(raw.id, fixtureName, "id");
  if (id !== fixtureName) {
    throw invalidFixtureMetadata(
      fixtureName,
      `id must match the fixture directory name "${fixtureName}", got "${id}"`,
    );
  }
  requireFixtureString(raw.name, fixtureName, "name");
  requireFixtureString(raw.kind, fixtureName, "kind");
  requireFixtureStringArray(raw.languages, fixtureName, "languages");
  requireFixtureStringArray(raw.frameworks, fixtureName, "frameworks");
  requireFixtureRuntimes(raw.runtimes, fixtureName);
  requireFixtureStringArray(raw.datastores, fixtureName, "datastores");

  if (raw.source !== undefined) {
    requireFixtureRecord(raw.source, fixtureName, "source");
    requireOptionalFixtureString(raw.source.repository, fixtureName, "source.repository");
    requireOptionalFixtureString(raw.source.baseCommit, fixtureName, "source.baseCommit");
  }

  requireFixtureRecord(raw.provenance, fixtureName, "provenance");
  const origin = requireFixtureString(raw.provenance.origin, fixtureName, "provenance.origin");
  if (!new Set(["real-repository", "benchmark-created", "synthetic", "unknown"]).has(origin)) {
    throw invalidFixtureMetadata(fixtureName, `provenance.origin has unsupported value "${origin}"`);
  }
  if (raw.provenance.seeded !== undefined && typeof raw.provenance.seeded !== "boolean") {
    throw invalidFixtureMetadata(fixtureName, "provenance.seeded must be a boolean when present");
  }
  requireOptionalFixtureString(raw.provenance.seedCommit, fixtureName, "provenance.seedCommit");
  if (raw.todos !== undefined) {
    requireFixtureStringArray(raw.todos, fixtureName, "todos");
  }

  return {
    ...raw,
    schemaVersion,
    id,
  } as FixtureMetadata;
}

function requireFixtureString(value: unknown, fixtureName: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidFixtureMetadata(fixtureName, `${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalFixtureString(value: unknown, fixtureName: string, field: string): void {
  if (value !== undefined) {
    requireFixtureString(value, fixtureName, field);
  }
}

function requireFixtureNumber(value: unknown, fixtureName: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalidFixtureMetadata(fixtureName, `${field} must be a positive integer`);
  }
  return value;
}

function requireFixtureStringArray(value: unknown, fixtureName: string, field: string): void {
  if (
    !Array.isArray(value)
    || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw invalidFixtureMetadata(fixtureName, `${field} must be an array of non-empty strings`);
  }
}

function requireFixtureRuntimes(value: unknown, fixtureName: string): void {
  if (
    !Array.isArray(value)
    || value.some((runtime) =>
      !isRecord(runtime)
      || typeof runtime.name !== "string"
      || runtime.name.trim().length === 0
      || (runtime.version !== undefined && typeof runtime.version !== "string")
    )
  ) {
    throw invalidFixtureMetadata(
      fixtureName,
      "runtimes must be an array of objects with non-empty name and optional string version",
    );
  }
}

function requireFixtureRecord(value: unknown, fixtureName: string, field: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidFixtureMetadata(fixtureName, `${field} must be an object`);
  }
}

function invalidFixtureMetadata(fixtureName: string, detail: string): Error {
  return new Error(`fixture.json for fixture "${fixtureName}" ${detail}`);
}

export function loadVulns(
  fixtureName: string,
  groundTruth: GroundTruthKind = "v1",
): Vulnerability[] {
  const findingsFile = groundTruth === "attacker-reachable"
    ? "findings-attacker-reachable.json"
    : "findings.json";
  const vulnsPath = join(FIXTURES_DIR, fixtureName, findingsFile);
  let raw: { vulnerabilities?: unknown };
  try {
    const errors: ParseError[] = [];
    raw = parse(readFileSync(vulnsPath, "utf-8"), errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (errors.length > 0) {
      const details = errors
        .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
        .join(", ");
      throw new SyntaxError(details);
    }
  } catch (err) {
    throw new Error(`Failed to read ${findingsFile} for fixture "${fixtureName}" at ${vulnsPath}: ${err}`);
  }
  if (!Array.isArray(raw.vulnerabilities)) {
    throw new Error(`${findingsFile} for fixture "${fixtureName}" must have a top-level "vulnerabilities" array`);
  }

  const vulnerabilities = groundTruth === "attacker-reachable"
    ? normalizeAttackerReachableVulns(fixtureName, raw.vulnerabilities)
    : raw.vulnerabilities as Vulnerability[];
  validateUniqueVulnIds(fixtureName, findingsFile, vulnerabilities);
  return vulnerabilities;
}

function normalizeAttackerReachableVulns(
  fixtureName: string,
  vulnerabilities: unknown[],
): AttackerReachableVulnerability[] {
  return vulnerabilities.map((value, index) => {
    if (!isRecord(value)) {
      throw invalidAttackerReachableVuln(fixtureName, index, "must be an object");
    }

    const id = requireString(value.id, fixtureName, index, "id");
    const type = requireVulnType(value.type, fixtureName, index);
    const severity = requireSeverity(value.severity, fixtureName, index);
    const description = requireString(value.description, fixtureName, index, "description");
    const vulnerabilityImpact = requireString(
      value.vulnerabilityImpact,
      fixtureName,
      index,
      "vulnerabilityImpact",
    );
    const filesRelated = requireFileLocations(value.filesRelated, fixtureName, index);
    validateEndpointRoles(filesRelated, fixtureName, index);
    const typeAliases = value.typeAliases === undefined
      ? undefined
      : requireStringArray(value.typeAliases, fixtureName, index, "typeAliases");

    rejectLegacyCodeFlowFields(value, fixtureName, index);
    const codeFlowMultiLine = requireYesNo(
      value.codeFlowMultiLine,
      fixtureName,
      index,
      "codeFlowMultiLine",
    );
    const codeFlowCrossFile = requireYesNo(
      value.codeFlowCrossFile,
      fixtureName,
      index,
      "codeFlowCrossFile",
    );
    validateDerivedCodeFlowFields(
      filesRelated,
      codeFlowMultiLine,
      codeFlowCrossFile,
      fixtureName,
      index,
    );
    const codeFlowCrossService = value.codeFlowCrossService === undefined
      ? undefined
      : requireYesNo(value.codeFlowCrossService, fixtureName, index, "codeFlowCrossService");

    return {
      id,
      type,
      ...(typeAliases && { typeAliases }),
      severity,
      filesRelated,
      file: filesRelated[0].file,
      line: filesRelated[0].line,
      description,
      vulnerabilityImpact,
      codeFlowMultiLine,
      codeFlowCrossFile,
      ...(codeFlowCrossService && { codeFlowCrossService }),
    };
  });
}

function requireFileLocations(
  value: unknown,
  fixtureName: string,
  index: number,
): FileLocation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidAttackerReachableVuln(fixtureName, index, "filesRelated must be a non-empty array");
  }
  return value.map((location, locationIndex) => {
    if (!isRecord(location)) {
      throw invalidAttackerReachableVuln(
        fixtureName,
        index,
        `filesRelated[${locationIndex}] must be an object`,
      );
    }
    const file = requireString(
      location.file,
      fixtureName,
      index,
      `filesRelated[${locationIndex}].file`,
    );
    if (
      typeof location.line !== "number"
      || !Number.isInteger(location.line)
      || location.line < 1
    ) {
      throw invalidAttackerReachableVuln(
        fixtureName,
        index,
        `filesRelated[${locationIndex}].line must be a positive integer`,
      );
    }
    const type = location.type === undefined
      ? undefined
      : requireEndpointType(
        location.type,
        fixtureName,
        index,
        `filesRelated[${locationIndex}].type`,
      );
    return { file, line: location.line, ...(type && { type }) };
  });
}

function validateEndpointRoles(
  filesRelated: FileLocation[],
  fixtureName: string,
  index: number,
): void {
  const endpointTypes = new Set(filesRelated.map((location) => location.type).filter(Boolean));
  if (filesRelated.length === 1) {
    if (endpointTypes.size === 0) {
      throw invalidAttackerReachableVuln(
        fixtureName,
        index,
        "a single filesRelated location must be marked as source or sink",
      );
    }
    return;
  }
  if (!endpointTypes.has("source") || !endpointTypes.has("sink")) {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      "filesRelated must mark at least one source and one sink",
    );
  }
}

function requireEndpointType(
  value: unknown,
  fixtureName: string,
  index: number,
  field: string,
): "source" | "sink" {
  if (value !== "source" && value !== "sink") {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      `${field} must be "source" or "sink"`,
    );
  }
  return value;
}

function requireString(
  value: unknown,
  fixtureName: string,
  index: number,
  field: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidAttackerReachableVuln(fixtureName, index, `${field} must be a non-empty string`);
  }
  return value;
}

function requireVulnType(value: unknown, fixtureName: string, index: number): VulnType {
  const type = requireString(value, fixtureName, index, "type");
  if (!VULN_TYPES.has(type as VulnType)) {
    throw invalidAttackerReachableVuln(fixtureName, index, `type must be a supported VulnType, got "${type}"`);
  }
  return type as VulnType;
}

const VULN_TYPES = new Set<VulnType>([
  "sql-injection",
  "xss",
  "path-traversal",
  "command-injection",
  "code-injection",
  "hardcoded-credentials",
  "insecure-deserialization",
  "idor",
  "xxe",
  "ssrf",
  "open-redirect",
  "csrf",
  "information-exposure",
  "allocation-of-resources-without-limits-or-throttling",
  "redos",
  "improper-code-sanitization",
  "improper-type-validation",
  "insecure-transport",
  "insecure-cryptography",
  "prototype-pollution",
  "origin-validation-error",
  "mass-assignment",
  "template-injection",
  "other",
]);

function rejectLegacyCodeFlowFields(
  value: Record<string, unknown>,
  fixtureName: string,
  index: number,
): void {
  const legacyFields = [
    "codeflowMultiLine",
    "codeflowMultiLines",
    "codeflowCrossFile",
    "codeflowCrossService",
  ].filter((field) => field in value);
  if (legacyFields.length > 0) {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      `${legacyFields.join(", ")} uses legacy casing; use codeFlow… fields instead`,
    );
  }
}

function validateDerivedCodeFlowFields(
  filesRelated: FileLocation[],
  codeFlowMultiLine: "yes" | "no",
  codeFlowCrossFile: "yes" | "no",
  fixtureName: string,
  index: number,
): void {
  const expectedMultiLine = filesRelated.length > 1 ? "yes" : "no";
  const expectedCrossFile = new Set(filesRelated.map((location) => location.file)).size > 1
    ? "yes"
    : "no";
  if (codeFlowMultiLine !== expectedMultiLine) {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      `codeFlowMultiLine must be "${expectedMultiLine}" for ${filesRelated.length} filesRelated location(s)`,
    );
  }
  if (codeFlowCrossFile !== expectedCrossFile) {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      `codeFlowCrossFile must be "${expectedCrossFile}" for the declared filesRelated locations`,
    );
  }
}

function requireStringArray(
  value: unknown,
  fixtureName: string,
  index: number,
  field: string,
): string[] {
  if (
    !Array.isArray(value)
    || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      `${field} must be an array of non-empty strings`,
    );
  }
  return value;
}

function requireSeverity(value: unknown, fixtureName: string, index: number): Severity {
  if (value !== "critical" && value !== "high" && value !== "medium" && value !== "low") {
    throw invalidAttackerReachableVuln(
      fixtureName,
      index,
      "severity must be critical, high, medium, or low",
    );
  }
  return value;
}

function requireYesNo(
  value: unknown,
  fixtureName: string,
  index: number,
  field: string,
): "yes" | "no" {
  if (value !== "yes" && value !== "no") {
    throw invalidAttackerReachableVuln(fixtureName, index, `${field} must be "yes" or "no"`);
  }
  return value;
}

function invalidAttackerReachableVuln(
  fixtureName: string,
  index: number,
  detail: string,
): Error {
  return new Error(
    `findings-attacker-reachable.json for fixture "${fixtureName}" vulnerability ${index}: ${detail}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateUniqueVulnIds(
  fixtureName: string,
  findingsFile: string,
  vulnerabilities: Vulnerability[],
): void {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const vuln of vulnerabilities) {
    if (seenIds.has(vuln.id)) {
      duplicateIds.add(vuln.id);
    }
    seenIds.add(vuln.id);
  }

  if (duplicateIds.size > 0) {
    throw new Error(
      `${findingsFile} for fixture "${fixtureName}" contains duplicate vulnerability id(s): ${[...duplicateIds].join(", ")}`,
    );
  }
}

function resolveCategory(categoryId: string) {
  const category = Object.values(EVAL_CATEGORIES).find((c) => c.id === categoryId);
  if (!category) {
    const valid = Object.values(EVAL_CATEGORIES).map((c) => c.id).join(", ");
    throw new Error(`Unknown category id "${categoryId}". Valid values: ${valid}`);
  }
  return category;
}

export function loadEvalTasks(): EvalTask[] {
  let files: string[];
  try {
    files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    throw new Error(`Cannot read tasks directory at ${TASKS_DIR}: ${err}`);
  }

  if (files.length === 0) {
    throw new Error(`No task JSON files found in ${TASKS_DIR}`);
  }

  return files.map((file) => {
    const filePath = join(TASKS_DIR, file);
    let taskJson: TaskJson;
    try {
      taskJson = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (err) {
      throw new Error(`Failed to parse task file ${filePath}: ${err}`);
    }

    const {
      id,
      name,
      category: categoryId,
      fixture,
      groundTruth = "v1",
      systemPrompt,
      prompt,
      maxTurns,
    } = taskJson;

    if (!id || !name || !categoryId || !fixture) {
      throw new Error(`Task file ${file} is missing required fields: id, name, category, fixture`);
    }
    if (groundTruth !== "v1" && groundTruth !== "attacker-reachable") {
      throw new Error(
        `Task file ${file} has unknown groundTruth "${groundTruth}". Valid values: v1, attacker-reachable`,
      );
    }

    const category = resolveCategory(categoryId);
    const knownVulns = loadVulns(fixture, groundTruth);
    const { metadata: fixtureMetadata, metadataHash: fixtureMetadataHash } = loadFixtureMetadata(fixture);
    const fixturePath = resolve(FIXTURES_DIR, fixture, "project");

    return {
      id,
      name,
      category,
      fixture: fixturePath,
      fixtureId: fixture,
      fixtureMetadata,
      fixtureMetadataHash,
      systemPrompt: systemPrompt ?? category.defaultSystemPrompt,
      prompt: prompt ?? category.defaultPrompt,
      groundTruth,
      knownVulns,
      ...(maxTurns !== undefined && { maxTurns }),
    } satisfies EvalTask;
  });
}

export function loadRunConfigs(): RunConfig[] {
  let raw: Array<Record<string, unknown>>;
  try {
    raw = JSON.parse(readFileSync(RUN_CONFIGS_FILE, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read run configs at ${RUN_CONFIGS_FILE}: ${err}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${RUN_CONFIGS_FILE} must be a JSON array of RunConfig objects`);
  }
  validateUniqueRunConfigIds(raw);

  return raw.map((entry) => {
    if (!entry.id || !entry.name) {
      throw new Error(`Run config missing required fields "id" and "name": ${JSON.stringify(entry)}`);
    }
    if (entry.type === "deepsec") {
      return validateDeepSecRunConfig(entry);
    } else if (entry.type === "codex-security") {
      return validateCodexSecurityRunConfig(entry);
    } else if (entry.type === "command") {
      return validateCommandRunConfig(entry);
    } else {
      return validateModelRunConfig(entry);
    }
  });
}

export function loadRunConfigGroups(
  configs: RunConfig[] = loadRunConfigs(),
  file: string = RUN_CONFIG_GROUPS_FILE,
): RunConfigGroup[] {
  let raw: Array<Record<string, unknown>>;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read run config groups at ${file}: ${err}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${file} must be a JSON array of RunConfigGroup objects`);
  }

  const knownConfigs = new Set(configs.map((config) => config.id));
  const knownCategories = new Set(
    Object.values(EVAL_CATEGORIES).map((category) => category.id),
  );
  const seen = new Set<string>();
  return raw.map((entry) => {
    if (typeof entry.id !== "string" || typeof entry.name !== "string") {
      throw new Error(`Run config group missing required id/name: ${JSON.stringify(entry)}`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate run config group id "${entry.id}"`);
    }
    seen.add(entry.id);
    if (
      !Array.isArray(entry.configIds)
      || entry.configIds.length === 0
      || !entry.configIds.every((id) => typeof id === "string")
    ) {
      throw new Error(`Run config group "${entry.id}" requires non-empty configIds`);
    }
    const duplicateIds = entry.configIds.filter(
      (id, index, ids) => ids.indexOf(id) !== index,
    );
    if (duplicateIds.length > 0) {
      throw new Error(
        `Run config group "${entry.id}" contains duplicate config id "${duplicateIds[0]}"`,
      );
    }
    const unknown = entry.configIds.find((id) => !knownConfigs.has(id));
    if (unknown) {
      throw new Error(`Run config group "${entry.id}" references unknown config "${unknown}"`);
    }
    if (
      entry.category !== undefined
      && (
        typeof entry.category !== "string"
        || !knownCategories.has(entry.category as EvalCategoryId)
      )
    ) {
      throw new Error(`Run config group "${entry.id}" has unknown category "${entry.category}"`);
    }
    if (
      entry.defaultRepetitions !== undefined
      && (
        typeof entry.defaultRepetitions !== "number"
        || !Number.isInteger(entry.defaultRepetitions)
        || entry.defaultRepetitions < 1
      )
    ) {
      throw new Error(`Run config group "${entry.id}" defaultRepetitions must be positive`);
    }
    return entry as unknown as RunConfigGroup;
  });
}

export function validateCodexSecurityRunConfig(
  entry: Record<string, unknown>,
): CodexSecurityRunConfig {
  validateSupportedCategories(entry);
  if (typeof entry.model !== "string" || entry.model.length === 0) {
    throw new Error(`Codex Security config "${entry.id}" missing required field: model`);
  }
  if (
    entry.effort !== "minimal"
    && entry.effort !== "low"
    && entry.effort !== "medium"
    && entry.effort !== "high"
    && entry.effort !== "xhigh"
    && entry.effort !== "max"
  ) {
    throw new Error(
      `Codex Security config "${entry.id}" has invalid effort "${entry.effort}"`,
    );
  }
  if (entry.mode !== undefined && entry.mode !== "standard") {
    throw new Error(`Codex Security config "${entry.id}" only supports mode "standard"`);
  }
  if (entry.auth !== undefined && entry.auth !== "api-key") {
    throw new Error(`Codex Security config "${entry.id}" only supports auth "api-key"`);
  }
  if (
    entry.maxCostUsd !== undefined
    && (
      typeof entry.maxCostUsd !== "number"
      || !Number.isFinite(entry.maxCostUsd)
      || entry.maxCostUsd <= 0
    )
  ) {
    throw new Error(`Codex Security config "${entry.id}" maxCostUsd must be positive`);
  }
  for (const field of ["mcpServers", "promptTemplateId", "runner"] as const) {
    if (entry[field] !== undefined) {
      throw new Error(`Codex Security config "${entry.id}" does not support ${field}`);
    }
  }
  return entry as unknown as CodexSecurityRunConfig;
}

export function validateCommandRunConfig(
  entry: Record<string, unknown>,
): CommandRunConfig {
  validateSupportedCategories(entry);
  if (entry.promptTemplateId !== undefined) {
    throw new Error(`Command config "${entry.id}" does not support prompt templates`);
  }
  if ((!entry.executable && !entry.command) || !entry.parser) {
    throw new Error(
      `Command config "${entry.id}" requires parser and either executable or command`,
    );
  }
  if (entry.args !== undefined && !Array.isArray(entry.args)) {
    throw new Error(`Command config "${entry.id}" field "args" must be an array`);
  }
  return entry as unknown as CommandRunConfig;
}

export function validateDeepSecRunConfig(
  entry: Record<string, unknown>,
): DeepSecRunConfig {
  validateSupportedCategories(entry);
  if (entry.agent !== "codex" && entry.agent !== "claude") {
    throw new Error(
      `DeepSec config "${entry.id}" requires agent "codex" or "claude"`,
    );
  }
  if (typeof entry.model !== "string" || entry.model.length === 0) {
    throw new Error(`DeepSec config "${entry.id}" missing required field: model`);
  }
  if (entry.agent === "claude" && !entry.model.startsWith("claude-")) {
    throw new Error(`DeepSec config "${entry.id}" Claude agent requires a Claude model`);
  }
  if (entry.agent === "codex" && entry.model.startsWith("claude-")) {
    throw new Error(`DeepSec config "${entry.id}" Codex agent cannot use a Claude model`);
  }
  if (
    entry.thinkingLevel !== "minimal"
    && entry.thinkingLevel !== "low"
    && entry.thinkingLevel !== "medium"
    && entry.thinkingLevel !== "high"
    && entry.thinkingLevel !== "xhigh"
  ) {
    throw new Error(
      `DeepSec config "${entry.id}" has invalid thinkingLevel "${entry.thinkingLevel}"`,
    );
  }
  if (entry.mcpServers !== undefined) {
    throw new Error(`DeepSec config "${entry.id}" does not support MCP servers`);
  }
  if (entry.promptTemplateId !== undefined) {
    throw new Error(`DeepSec config "${entry.id}" does not support prompt templates`);
  }
  return entry as unknown as DeepSecRunConfig;
}

export function validateModelRunConfig(entry: Record<string, unknown>): ModelRunConfig {
  validateSupportedCategories(entry);
  if (!entry.model) {
    throw new Error(`Model config "${entry.id}" missing required field: model`);
  }
  if (
    entry.runner !== undefined
    && entry.runner !== "claude-code"
    && entry.runner !== "codex-cli"
  ) {
    throw new Error(`Model config "${entry.id}" has unknown runner "${entry.runner}"`);
  }
  const validEfforts = new Set([
    "default",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  if (entry.effort !== undefined && !validEfforts.has(String(entry.effort))) {
    throw new Error(`Model config "${entry.id}" has invalid effort "${entry.effort}"`);
  }
  if (
    (entry.runner === undefined || entry.runner === "claude-code")
    && entry.effort === "minimal"
  ) {
    throw new Error(`Model config "${entry.id}" cannot use minimal effort with Claude Code`);
  }
  if (entry.promptTemplateId !== undefined && !isPromptTemplateId(entry.promptTemplateId)) {
    throw new Error(`Model config "${entry.id}" has unknown promptTemplateId "${entry.promptTemplateId}"`);
  }
  if (
    isPromptTemplateId(entry.promptTemplateId)
    && !isPromptTemplateSupported(
      entry.promptTemplateId,
      entry.runner === "codex-cli" ? "codex-cli" : "claude-code",
    )
  ) {
    throw new Error(
      `Model config "${entry.id}" cannot use promptTemplateId "${entry.promptTemplateId}" with runner "${entry.runner ?? "claude-code"}"`,
    );
  }
  if (
    entry.requiredToolPolicyId !== undefined
    && entry.requiredToolPolicyId !== "snyk-code-once"
  ) {
    throw new Error(
      `Model config "${entry.id}" has unknown requiredToolPolicyId "${entry.requiredToolPolicyId}"`,
    );
  }
  if (entry.requiredToolPolicyId === "snyk-code-once") {
    const mcpServers = entry.mcpServers;
    const hasSnyk = typeof mcpServers === "object"
      && mcpServers !== null
      && Object.keys(mcpServers).some((name) => name.toLowerCase() === "snyk");
    if (!hasSnyk) {
      throw new Error(
        `Model config "${entry.id}" requires a Snyk MCP server for snyk-code-once`,
      );
    }
  }
  return entry as unknown as ModelRunConfig;
}

function validateSupportedCategories(entry: Record<string, unknown>): void {
  if (entry.supportedCategories === undefined) return;
  const valid = new Set(Object.values(EVAL_CATEGORIES).map((category) => category.id));
  if (
    !Array.isArray(entry.supportedCategories)
    || entry.supportedCategories.length === 0
    || !entry.supportedCategories.every((category) =>
      typeof category === "string" && valid.has(category as EvalCategoryId)
    )
  ) {
    throw new Error(`Run config "${entry.id}" has invalid supportedCategories`);
  }
}

function validateUniqueRunConfigIds(configs: Array<Record<string, unknown>>): void {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const config of configs) {
    if (typeof config.id !== "string") continue;
    if (seenIds.has(config.id)) {
      duplicateIds.add(config.id);
    }
    seenIds.add(config.id);
  }

  if (duplicateIds.size > 0) {
    throw new Error(`Run configs contain duplicate id(s): ${[...duplicateIds].join(", ")}`);
  }
}
