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
import { printResult, printSummaryTable, saveResults } from "./reporter.js";
import { loadEvalTasks, loadRunConfigs } from "./evals/loader.js";
import { EVAL_CATEGORIES } from "./types.js";
import type { EvalCategoryId, EvalResult, EvalTask, RunConfig, ModelRunConfig, CommandRunConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, "../results");
const TMP_DIR = resolve(__dirname, "../.tmp-fixtures");

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const KNOWN_CATEGORY_IDS = Object.values(EVAL_CATEGORIES).map((c) => c.id);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    category?: EvalCategoryId;
    tasks?: string[]; // comma-separated list of task IDs
    configs?: string[]; // comma-separated list of config IDs
    dryRun: boolean;
  } = { dryRun: false };

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
    else if (args[i] === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

// ─── Task Runner ──────────────────────────────────────────────────────────────

async function runEval(task: EvalTask, config: RunConfig): Promise<EvalResult> {
  const timestamp = new Date().toISOString();
  const isCommand = config.type === "command";
  const runConfigType: "model" | "command" = isCommand ? "command" : "model";

  // Shared fields across all return sites
  const base = { taskId: task.id, taskName: task.name, runConfigId: config.id, runConfigName: config.name, runConfigType, timestamp };

  console.log(`\nRunning: ${task.name} | ${config.name}`);

  // Command configs (SAST tools) only produce findings — they can't fix code
  if (isCommand && task.category.id === EVAL_CATEGORIES.FIX_VULNS.id) {
    return {
      ...base,
      score: 0,
      metrics: { sessionDurationMs: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, totalTurns: 0, toolCalls: [], toolStats: {}, filesScanned: [] },
      details: { agentFindings: [], truePositives: [], falsePositives: 0, falseNegatives: task.knownVulns.map((v) => v.id), precision: 0, recall: 0 },
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
        details: { agentFindings: [], truePositives: [], falsePositives: 0, falseNegatives: task.knownVulns.map((v) => v.id), precision: 0, recall: 0 },
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

  console.log(`\nBenchmark: ${tasks.length} task(s) × ${configs.length} config(s) = ${tasks.length * configs.length} run(s)`);
  for (const task of tasks) {
    console.log(`  ${task.id}  [${task.category.id}]`);
    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      const prefix = i === configs.length - 1 ? "  └─" : "  ├─";
      const label = c.type === "command" ? `[sast] ${(c as CommandRunConfig).command}` : (c as ModelRunConfig).model;
      console.log(`${prefix} ${c.id}: ${label}`);
    }
  }

  if (opts.dryRun) {
    console.log("\nDry run — exiting.");
    return;
  }

  mkdirSync(TMP_DIR, { recursive: true });

  const results: EvalResult[] = [];

  for (const config of configs) {
    for (const task of tasks) {
      const result = await runEval(task, config);
      printResult(result);
      results.push(result);
    }
  }

  printSummaryTable(results);

  const outputPath = saveResults(results, RESULTS_DIR);
  console.log(`\nResults saved to: ${outputPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
