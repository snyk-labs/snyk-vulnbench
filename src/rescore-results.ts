import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, parse as parsePath } from "path";
import { aggregateByConfig, aggregateByTask } from "./aggregator.js";
import { loadEvalTasks } from "./evals/loader.js";
import { printSummaryTable } from "./reporter.js";
import {
  findVulnsScore,
  scoreAttackerReachableFindVulns,
  scoreFindVulns,
} from "./scorer.js";
import type { AggregatedConfigResult, AggregatedTaskResult, EvalResult, FindVulnsDetails, Vulnerability, VulnType } from "./types.js";

interface JsonlRecord {
  _type?: string;
  [key: string]: unknown;
}

interface RescoreArgs {
  input: string;
  output: string;
}

function parseArgs(): RescoreArgs {
  const args = process.argv.slice(2);
  const input = readFlag(args, "--input") ?? args.find((arg) => !arg.startsWith("--"));

  if (!input) {
    console.error("Usage: pnpm tsx src/rescore-results.ts --input <results.jsonl> [--output <rescored.jsonl>]");
    process.exit(1);
  }

  return {
    input,
    output: readFlag(args, "--output") ?? defaultOutputPath(input),
  };
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defaultOutputPath(input: string): string {
  const parsed = parsePath(input);
  const ext = parsed.ext || ".jsonl";
  return join(parsed.dir, `${parsed.name}-rescored${ext}`);
}

function readJsonl(path: string): JsonlRecord[] {
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as JsonlRecord;
      } catch (err) {
        throw new Error(`Failed to parse ${path}:${index + 1}: ${err}`);
      }
    });
}

function extractRuns(records: JsonlRecord[]): EvalResult[] {
  return records
    .filter((record) => record._type === "run")
    .map((record) => {
      const { _type, ...result } = record;
      return result as unknown as EvalResult;
    });
}

function isFindVulnsResult(result: EvalResult): result is EvalResult & { details: FindVulnsDetails } {
  return "agentFindings" in result.details;
}

function findingsOutput(agentFindings: Vulnerability[]): string {
  return `FINDINGS_JSON:\n\`\`\`json\n${JSON.stringify(agentFindings, null, 2)}\n\`\`\``;
}

function normalizeStoredFindings(result: EvalResult, agentFindings: Vulnerability[]): Vulnerability[] {
  if (result.runConfigId !== "snyk-code") return agentFindings;

  return agentFindings.map((finding) => {
    if (finding.type !== "other") return finding;
    if (!/\b(?:csrf|csurf|cross[- ]site request forgery)\b/i.test(finding.description)) return finding;

    // Older saved Snyk Code runs used the pre-fix parser and classified UseCsurfForExpress as "other".
    return { ...finding, type: "csrf" as VulnType };
  });
}

function rescoreRuns(results: EvalResult[]): EvalResult[] {
  const tasksById = new Map(loadEvalTasks().map((task) => [task.id, task]));

  return results.map((result) => {
    if (!isFindVulnsResult(result)) return result;

    const task = tasksById.get(result.taskId);
    if (!task) {
      throw new Error(`Cannot rescore run for unknown task "${result.taskId}"`);
    }

    const agentFindings = normalizeStoredFindings(result, result.details.agentFindings);
    const details = task.groundTruth === "attacker-reachable"
      ? scoreAttackerReachableFindVulns(findingsOutput(agentFindings), task)
      : scoreFindVulns(findingsOutput(agentFindings), task);
    return {
      ...result,
      score: findVulnsScore(details),
      details,
    };
  });
}

function writeResults(
  outputPath: string,
  results: EvalResult[],
  taskAggregates: AggregatedTaskResult[],
  configAggregates: AggregatedConfigResult[],
): void {
  mkdirSync(dirname(outputPath), { recursive: true });

  const records = [
    ...results.map((result) => ({ _type: "run", ...result })),
    ...taskAggregates.map((aggregate) => ({ _type: "task-aggregate", ...aggregate })),
    ...configAggregates.map((aggregate) => ({ _type: "config-aggregate", ...aggregate })),
  ];

  writeFileSync(outputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function main(): void {
  const { input, output } = parseArgs();
  const originalRuns = extractRuns(readJsonl(input));

  if (originalRuns.length === 0) {
    throw new Error(`No run records found in ${input}`);
  }

  const rescoredRuns = rescoreRuns(originalRuns);
  const taskAggregates = aggregateByTask(rescoredRuns);
  const configAggregates = aggregateByConfig(taskAggregates, rescoredRuns);

  printSummaryTable(rescoredRuns, taskAggregates, configAggregates);
  writeResults(output, rescoredRuns, taskAggregates, configAggregates);
  console.log(`Rescored results saved to: ${output}\n`);
}

main();
