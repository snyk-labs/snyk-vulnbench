import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { EVAL_CATEGORIES } from "../types.js";
import type {
  AttackerReachableVulnerability,
  CommandRunConfig,
  EvalCategoryId,
  EvalTask,
  FileLocation,
  GroundTruthKind,
  ModelRunConfig,
  RunConfig,
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
    const fixturePath = resolve(FIXTURES_DIR, fixture, "project");

    return {
      id,
      name,
      category,
      fixture: fixturePath,
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
    if (entry.type === "command") {
      if (!entry.command || !entry.parser) {
        throw new Error(`Command config "${entry.id}" missing required fields: command, parser`);
      }
      return entry as unknown as CommandRunConfig;
    } else {
      if (!entry.model) {
        throw new Error(`Model config "${entry.id}" missing required field: model`);
      }
      return entry as unknown as ModelRunConfig;
    }
  });
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
