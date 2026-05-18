import { cpSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { runTask } from "./runner.js";
import { runCommandTask } from "./command-runner.js";
import {
  scoreFindVulns,
  findVulnsScore,
  scoreFixVulns,
  fixVulnsScore,
} from "./scorer.js";
import { printResult, printRunProgress, printConfigHeader, printSummaryTable, saveResults } from "./reporter.js";
import { loadEvalTasks, loadRunConfigs } from "./evals/loader.js";
import { runPreflight } from "./preflight.js";
import { aggregateByTask, aggregateByConfig } from "./aggregator.js";
import { EVAL_CATEGORIES } from "./types.js";
import { styleText } from "node:util";
import type { EvalCategoryId, EvalResult, EvalTask, RunConfig, ModelRunConfig, CommandRunConfig, FindVulnsDetails, EffortLevel, ThinkingConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, "../results");
const TMP_DIR = resolve(__dirname, "../.tmp-fixtures");

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const KNOWN_CATEGORY_IDS = Object.values(EVAL_CATEGORIES).map((c) => c.id);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    category?: EvalCategoryId;
    tasks?: string[];
    configs?: string[];
    repetitions: number;
    dryRun: boolean;
    skipPreflight: boolean;
  } = { repetitions: 1, dryRun: false, skipPreflight: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      const val = args[++i];
      if (!KNOWN_CATEGORY_IDS.includes(val as EvalCategoryId)) {
        console.error(`Unknown category "${val}". Available: ${KNOWN_CATEGORY_IDS.join(", ")}`);
        process.exit(1);
      }
      opts.category = val as EvalCategoryId;
    } else if (args[i] === "--task" && args[i + 1]) opts.tasks = args[++i].split(",").map((s) => s.trim());
    else if (args[i] === "--config" && args[i + 1]) opts.configs = args[++i].split(",").map((s) => s.trim());
    else if (args[i] === "--repetitions" && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (isNaN(n) || n < 1) {
        console.error(`--repetitions must be a positive integer, got "${args[i]}"`);
        process.exit(1);
      }
      opts.repetitions = n;
    }
    else if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--skip-preflight") opts.skipPreflight = true;
  }
  return opts;
}

// ─── Task Runner ──────────────────────────────────────────────────────────────

function emptyFindVulnsDetails(task: EvalTask): FindVulnsDetails {
  const falseNegatives = task.knownVulns.map((v) => ({ id: v.id, type: v.type, severity: v.severity }));
  const byType: Record<string, { total: number; found: number; precision: number; recall: number; f1: number }> = {};
  const bySeverity: Record<string, { total: number; found: number; precision: number; recall: number; f1: number }> = {};
  for (const v of task.knownVulns) {
    byType[v.type] = byType[v.type] ?? { total: 0, found: 0, precision: 0, recall: 0, f1: 0 };
    byType[v.type].total++;
    bySeverity[v.severity] = bySeverity[v.severity] ?? { total: 0, found: 0, precision: 0, recall: 0, f1: 0 };
    bySeverity[v.severity].total++;
  }
  return { agentFindings: [], truePositives: [], falsePositives: [], falseNegatives, precision: 0, recall: 0, byType, bySeverity };
}

async function runEval(task: EvalTask, config: RunConfig): Promise<EvalResult> {
  const timestamp = new Date().toISOString();
  const isCommand = config.type === "command";
  const runConfigType: "model" | "command" = isCommand ? "command" : "model";

  const effort: EffortLevel | null = isCommand ? null : (config as ModelRunConfig).effort ?? "high";
  const thinking: ThinkingConfig | null = isCommand ? null : (config as ModelRunConfig).thinking ?? { type: "adaptive" };

  // Shared fields across all return sites (repetition/totalRepetitions set by caller)
  const base = { taskId: task.id, taskName: task.name, runConfigId: config.id, runConfigName: config.name, runConfigType, effort, thinking, timestamp, repetition: 1, totalRepetitions: 1 };

  // Command configs (SAST tools) only produce findings — they can't fix code
  if (isCommand && task.category.id === EVAL_CATEGORIES.FIX_VULNS.id) {
    return {
      ...base,
      score: 0,
      metrics: { sessionDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, totalLogicalInputTokens: 0, totalCostUsd: null, totalTurns: 0, toolCalls: [], toolStats: {}, filesScanned: [] },
      details: emptyFindVulnsDetails(task),
      error: `Command config "${config.id}" does not support fix-vulns tasks`,
    };
  }

  let cwd = task.fixture;
  let cleanupTmp = false;

  if (!isCommand && task.category.id === EVAL_CATEGORIES.FIX_VULNS.id) {
    // Work on a temp copy so we don't modify the original fixture
    cwd = join(TMP_DIR, `${task.id}-${config.id}-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    cpSync(task.fixture, cwd, { recursive: true });
    cleanupTmp = true;
  }

  try {
    const { finalText, metrics, error } = isCommand
      ? await runCommandTask(task, config as CommandRunConfig, task.fixture)
      : await runTask(task, config as ModelRunConfig, cwd);

    if (error) {
      return {
        ...base,
        score: 0,
        metrics,
        details: emptyFindVulnsDetails(task),
        error,
      };
    }

    if (task.category.id === EVAL_CATEGORIES.FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.LLM_FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.APP_FIND_VULNS.id) {
      const details = scoreFindVulns(finalText, task);
      const score = findVulnsScore(details);
      return { ...base, score, metrics, details };
    } else {
      const details = await scoreFixVulns(cwd, task);
      const score = fixVulnsScore(details);
      return { ...base, score, metrics, details };
    }
  } finally {
    if (cleanupTmp) {
      try {
        rmSync(cwd, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  const EVAL_TASKS = loadEvalTasks();
  const DEFAULT_RUN_CONFIGS = loadRunConfigs();

  // Filter tasks
  let tasks = EVAL_TASKS;
  if (opts.category) tasks = tasks.filter((t) => t.category.id === opts.category);
  if (opts.tasks) {
    const ids = new Set(opts.tasks);
    tasks = tasks.filter((t) => ids.has(t.id));
  }

  // Filter configs — supports comma-separated list: --config sonnet-4-6,snyk-code
  let configs = DEFAULT_RUN_CONFIGS;
  if (opts.configs) {
    const ids = new Set(opts.configs);
    configs = configs.filter((c) => ids.has(c.id));
  }

  if (tasks.length === 0) {
    console.error("No matching tasks found. Available:", EVAL_TASKS.map((t) => t.id).join(", "));
    process.exit(1);
  }
  if (configs.length === 0) {
    console.error(`No matching configs found for "${opts.configs?.join(", ")}". Available:`, DEFAULT_RUN_CONFIGS.map((c) => c.id).join(", "));
    process.exit(1);
  }

  const { repetitions } = opts;
  const totalRuns = tasks.length * configs.length * repetitions;
  const repSuffix = repetitions > 1 ? ` × ${repetitions} rep(s)` : "";

  console.log(`\n${styleText("bold", `Benchmark: ${tasks.length} task(s) × ${configs.length} config(s)${repSuffix} = ${totalRuns} run(s)`)}`);
  for (const task of tasks) {
    console.log(`  ${styleText("bold", task.id)}  ${styleText("dim", `[${task.category.id}]`)}`);
    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      const connector = i === configs.length - 1 ? "└─" : "├─";
      let label: string;
      if (c.type === "command") {
        label = `[sast] ${(c as CommandRunConfig).command}`;
      } else {
        const mc = c as ModelRunConfig;
        const effortTag = mc.effort ?? "high";
        const thinkingTag = mc.thinking ? mc.thinking.type : "adaptive";
        label = `${mc.model} (effort: ${effortTag}, thinking: ${thinkingTag})`;
      }
      console.log(`  ${styleText("dim", connector)} ${c.id}: ${label}`);
    }
  }

  if (opts.dryRun) {
    console.log("\nDry run — exiting.");
    return;
  }

  if (!opts.skipPreflight) {
    runPreflight(configs);
  }

  mkdirSync(TMP_DIR, { recursive: true });

  const results: EvalResult[] = [];
  let runIndex = 0;

  for (let ci = 0; ci < configs.length; ci++) {
    const config = configs[ci];
    printConfigHeader(config.name, ci + 1, configs.length);

    for (const task of tasks) {
      for (let rep = 0; rep < repetitions; rep++) {
        runIndex++;
        const repLabel = repetitions > 1 ? ` (rep ${rep + 1}/${repetitions})` : "";
        printRunProgress(`${task.name}${repLabel}`, runIndex, totalRuns);
        const result = await runEval(task, config);
        result.repetition = rep + 1;
        result.totalRepetitions = repetitions;
        printResult(result);
        results.push(result);
      }
    }
  }

  const taskAggregates = aggregateByTask(results);
  const configAggregates = aggregateByConfig(taskAggregates, results);

  printSummaryTable(results, taskAggregates, configAggregates);

  const outputPath = saveResults(results, RESULTS_DIR, taskAggregates, configAggregates);
  console.log(`Results saved to: ${outputPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
