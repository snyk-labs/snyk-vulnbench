import { parseSnykCodeOutput } from "./snyk-code.js";
import { parseSnykCodeAttackerReachableOutput } from "./snyk-code-attacker-reachable.js";
import type { FindingRecord } from "../types.js";

export type { FindingRecord } from "../types.js";

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
