import { statSync } from "node:fs";
import { basename, dirname, join, parse as parsePath } from "node:path";
import { aggregateByConfig, aggregateByTask } from "./aggregator.js";
import { loadEvalTasks } from "./evals/loader.js";
import { serializeFindingsToFinalText } from "./findings-output.js";
import { printSummaryTable } from "./reporter.js";
import {
  primaryFindVulnsScore,
  scoreAttackerReachableFindVulns,
  scoreFindVulns,
  scoreLocalizedFindVulns,
} from "./scorer.js";
import {
  readBenchmarkResults,
  writeBenchmarkJsonl,
} from "./results/results-io.js";
import type { EvalResult, FindVulnsDetails, Vulnerability, VulnType } from "./types.js";

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
  if (statSync(input).isDirectory()) {
    return join(
      dirname(input),
      `${basename(input)}-rescored.jsonl`,
    );
  }
  const parsed = parsePath(input);
  const ext = parsed.ext || ".jsonl";
  return join(parsed.dir, `${parsed.name}-rescored${ext}`);
}

function isFindVulnsResult(result: EvalResult): result is EvalResult & { details: FindVulnsDetails } {
  return "agentFindings" in result.details;
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
    const usesLocalizedScoring =
      task.groundTruth === "attacker-reachable"
      && (
        result.runnerId === "deepsec-cli"
        || result.runConfigId.startsWith("deepsec-")
      );
    const details = task.groundTruth === "attacker-reachable"
      ? usesLocalizedScoring
        ? scoreLocalizedFindVulns(serializeFindingsToFinalText(agentFindings), task)
        : scoreAttackerReachableFindVulns(serializeFindingsToFinalText(agentFindings), task)
      : scoreFindVulns(serializeFindingsToFinalText(agentFindings), task);
    return {
      ...result,
      fixtureId: result.fixtureId ?? task.fixtureId,
      fixtureMetadata: result.fixtureMetadata ?? task.fixtureMetadata,
      fixtureMetadataHash: result.fixtureMetadataHash ?? task.fixtureMetadataHash,
      primaryMetric: task.groundTruth === "attacker-reachable"
        ? usesLocalizedScoring
          ? "localized-vulnerability-recall"
          : "attacker-reachable-vulnerability-recall"
        : "f1",
      score: primaryFindVulnsScore(details, task.groundTruth),
      details,
    };
  });
}

function main(): void {
  const { input, output } = parseArgs();
  const originalRuns = readBenchmarkResults(input).runs;

  if (originalRuns.length === 0) {
    throw new Error(`No run records found in ${input}`);
  }

  const rescoredRuns = rescoreRuns(originalRuns);
  const taskAggregates = aggregateByTask(rescoredRuns);
  const configAggregates = aggregateByConfig(taskAggregates, rescoredRuns);

  printSummaryTable(rescoredRuns, taskAggregates, configAggregates);
  writeBenchmarkJsonl(output, {
    runs: rescoredRuns,
    taskAggregates,
    configAggregates,
  });
  console.log(`Rescored results saved to: ${output}\n`);
}

main();
