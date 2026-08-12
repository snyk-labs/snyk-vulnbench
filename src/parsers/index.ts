import { parseSnykCodeOutput } from "./snyk-code.js";
import { parseSnykCodeAttackerReachableOutput } from "./snyk-code-attacker-reachable.js";
import type { FileLocation } from "../types.js";

/**
 * A parsed finding from a SAST tool — matches the fields expected by the
 * scorer's FINDINGS_JSON parser. No `id` needed; the scorer generates synthetic IDs.
 */
export interface FindingRecord {
  type: string;
  typeAliases?: string[];
  file?: string;
  line?: number;
  filesRelated?: FileLocation[];
  severity: string;
  description: string;
  vulnerabilityImpact?: string;
  codeFlowMultiLine?: "yes" | "no";
  codeFlowCrossFile?: "yes" | "no";
  codeFlowCrossService?: "yes" | "no";
}

export type ParserFn = (stdout: string) => FindingRecord[];

const PARSERS: Record<string, ParserFn> = {
  "snyk-code": parseSnykCodeOutput,
  "snyk-code-attacker-reachable": parseSnykCodeAttackerReachableOutput,
};

export function getParser(key: string): ParserFn {
  const parser = PARSERS[key];
  if (!parser) {
    throw new Error(`Unknown parser "${key}". Available: ${Object.keys(PARSERS).join(", ")}`);
  }
  return parser;
}
