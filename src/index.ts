import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  scoreFindVulns,
  scoreAttackerReachableFindVulns,
  scoreLocalizedFindVulns,
  primaryFindVulnsScore,
  scoreFixVulns,
  fixVulnsScore,
} from "./scorer.js";
import { printExecutionStatus, printResult, printRunProgress, printConfigHeader, printSummaryTable } from "./reporter.js";
import {
  loadEvalTasks,
  loadRunConfigGroups,
  loadRunConfigs,
} from "./evals/loader.js";
import { configSupportsTask } from "./evals/selection.js";
import { runPreflight } from "./preflight.js";
import { aggregateByTask, aggregateByConfig } from "./aggregator.js";
import { isIsolatedBenchmarkWorker, runInIsolatedBenchmarkWorker } from "./benchmark-env.js";
import { DEFAULT_PROMPT_TEMPLATE_ID } from "./prompt-templates.js";
import { getRunner } from "./runners/registry.js";
import {
  createIsolatedWorkspace,
  prepareSecurityReviewGitWorkspace,
} from "./isolated-workspace.js";
import {
  beginExecutionRun,
  checkpointExecution,
  finishExecutionRun,
  initializeExecution,
  reconcileInterruptedRuns,
  validateExecutionInputs,
} from "./results/execution-runtime.js";
import { acquireExecutionLock } from "./results/execution-lock.js";
import {
  listRunRecords,
  readExecutionManifest,
  resolveExecutionDirectory,
} from "./results/execution-store.js";
import { classifyRunFailure, shouldPauseAfterFailure } from "./run-failure.js";
import { EVAL_CATEGORIES } from "./types.js";
import { styleText } from "node:util";
import type { BenchmarkMetrics, EvalCategoryId, EvalResult, EvalTask, RunConfig, RunConfigGroup, ModelRunConfig, DeepSecRunConfig, CodexSecurityRunConfig, FindVulnsDetails, FixVulnsDetails, EffortLevel, ThinkingConfig, PrimaryMetricKind } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const RESULTS_DIR = resolve(__dirname, "../results");
const AGENT_TRACE_DIR_ENV = "VULNBENCH_AGENT_TRACE_DIR";

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const KNOWN_CATEGORY_IDS = Object.values(EVAL_CATEGORIES).map((c) => c.id);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    category?: EvalCategoryId;
    tasks?: string[];
    configs?: string[];
    configGroup?: string;
    allConfigs: boolean;
    repetitions?: number;
    dryRun: boolean;
    skipPreflight: boolean;
    traceAgent: boolean;
    resume?: string;
    status?: string;
    retryFailed: boolean;
    retryInterrupted: boolean;
    continueOnError: boolean;
    maxCostUsd?: number;
    maxTokens?: number;
    maxRunTimeMs?: number;
  } = {
    allConfigs: false,
    dryRun: false,
    skipPreflight: false,
    traceAgent: false,
    retryFailed: false,
    retryInterrupted: false,
    continueOnError: false,
  };

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
    else if (args[i] === "--config-group" && args[i + 1]) opts.configGroup = args[++i];
    else if (args[i] === "--all-configs") opts.allConfigs = true;
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
    else if (args[i] === "--trace-agent") opts.traceAgent = true;
    else if (args[i] === "--resume" && args[i + 1]) opts.resume = args[++i];
    else if (args[i] === "--status" && args[i + 1]) opts.status = args[++i];
    else if (args[i] === "--retry-failed") opts.retryFailed = true;
    else if (args[i] === "--retry-interrupted") opts.retryInterrupted = true;
    else if (args[i] === "--continue-on-error") opts.continueOnError = true;
    else if (args[i] === "--max-execution-cost-usd" && args[i + 1]) {
      opts.maxCostUsd = positiveNumber(args[++i], "--max-execution-cost-usd");
    }
    else if (args[i] === "--max-execution-tokens" && args[i + 1]) {
      opts.maxTokens = positiveNumber(args[++i], "--max-execution-tokens");
    }
    else if (args[i] === "--max-run-time-ms" && args[i + 1]) {
      opts.maxRunTimeMs = positiveNumber(args[++i], "--max-run-time-ms");
    }
  }
  const selectors = Number(Boolean(opts.configs))
    + Number(Boolean(opts.configGroup))
    + Number(opts.allConfigs);
  if (selectors > 1) {
    console.error("--config, --config-group, and --all-configs are mutually exclusive");
    process.exit(1);
  }
  if (opts.resume && selectors > 0) {
    console.error("--resume cannot be combined with config selectors");
    process.exit(1);
  }
  if (
    opts.resume
    && (
      opts.category
      || opts.tasks
      || opts.repetitions
      || opts.maxCostUsd
      || opts.maxTokens
      || opts.maxRunTimeMs
    )
  ) {
    console.error("--resume uses the frozen manifest and cannot change selection or budgets");
    process.exit(1);
  }
  if (opts.status && process.argv.slice(2).some((arg) => arg !== "--status" && arg !== opts.status)) {
    console.error("--status must be used by itself");
    process.exit(1);
  }
  if ((opts.retryFailed || opts.retryInterrupted) && !opts.resume) {
    console.error("--retry-failed and --retry-interrupted require --resume");
    process.exit(1);
  }
  return opts;
}

function positiveNumber(value: string, flag: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    console.error(`${flag} must be a positive number, got "${value}"`);
    process.exit(1);
  }
  return number;
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

function emptyMetrics(): BenchmarkMetrics {
  return {
    sessionDurationMs: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalLogicalInputTokens: 0,
    totalCostUsd: null,
    totalTurns: 0,
    toolCalls: [],
    toolStats: {},
    filesScanned: [],
    mcp: {
      configuredServers: [],
      serverStatuses: [],
      advertisedToolCount: 0,
      toolStats: {},
    },
  };
}

function emptyDetails(task: EvalTask): FindVulnsDetails | FixVulnsDetails {
  return task.category.id === EVAL_CATEGORIES.FIX_VULNS.id
    ? {
      vulnsAttempted: task.knownVulns.length,
      vulnsFixed: 0,
      judgeNotes: "Execution failed before fix judging completed",
    }
    : emptyFindVulnsDetails(task);
}

function primaryMetricForTask(
  task: EvalTask,
  runnerId: string,
): PrimaryMetricKind {
  if (task.category.id === EVAL_CATEGORIES.FIX_VULNS.id) return "fix-rate";
  if (
    runnerId === "deepsec-cli"
    && task.groundTruth === "attacker-reachable"
  ) {
    return "localized-vulnerability-recall";
  }
  return task.groundTruth === "attacker-reachable"
    ? "attacker-reachable-vulnerability-recall"
    : "f1";
}

async function runEval(
  task: EvalTask,
  config: RunConfig,
  abortController: AbortController,
): Promise<EvalResult> {
  const timestamp = new Date().toISOString();
  const runner = getRunner(config);
  const isCommand = runner.kind === "command";
  const runConfigType = runner.kind;

  const effort: EffortLevel | null = runner.id === "deepsec-cli"
    ? (config as DeepSecRunConfig).thinkingLevel
    : runner.id === "codex-security-cli"
      ? (config as CodexSecurityRunConfig).effort
    : isCommand
      ? null
      : (config as ModelRunConfig).effort ?? "high";
  const thinking: ThinkingConfig | null = runner.id === "claude-code"
    ? (config as ModelRunConfig).thinking ?? { type: "adaptive" }
    : null;
  const promptTemplateId = isCommand
    ? null
    : (config as ModelRunConfig).promptTemplateId ?? DEFAULT_PROMPT_TEMPLATE_ID;

  // Shared fields across all return sites (repetition/totalRepetitions set by caller)
  const base = {
    taskId: task.id,
    taskName: task.name,
    fixtureId: task.fixtureId,
    fixtureMetadata: task.fixtureMetadata,
    fixtureMetadataHash: task.fixtureMetadataHash,
    runConfigId: config.id,
    runConfigName: config.name,
    runnerId: runner.id,
    runnerVersion: runner.version ?? null,
    runnerCapabilities: runner.capabilities,
    requestedModel: runner.id === "deepsec-cli"
      ? (config as DeepSecRunConfig).model
      : runner.id === "codex-security-cli"
        ? (config as CodexSecurityRunConfig).model
      : isCommand
        ? null
        : (config as ModelRunConfig).model,
    groundTruth: task.groundTruth,
    primaryMetric: primaryMetricForTask(task, runner.id),
    runConfigType,
    effort,
    thinking,
    promptTemplateId,
    timestamp,
    repetition: 1,
    totalRepetitions: 1,
  };

  if (!runner.capabilities.fixVulns && task.category.id === EVAL_CATEGORIES.FIX_VULNS.id) {
    const failure = classifyRunFailure(
      `Runner "${runner.id}" does not support fix-vulns tasks`,
    );
    return {
      ...base,
      score: 0,
      metrics: emptyMetrics(),
      details: emptyDetails(task),
      failure,
      error: failure.message,
    };
  }

  const workspace = createIsolatedWorkspace(task.fixture);
  const cwd = workspace.projectDir;
  let latestMetrics = emptyMetrics();

  try {
    if (
      "promptTemplateId" in config
      && config.promptTemplateId === "security-review"
    ) {
      prepareSecurityReviewGitWorkspace(cwd);
    }
    const { finalText, findings, metrics, failure, error } = await runner.run({
      task,
      config,
      cwd,
      workspace,
      abortController,
    });
    latestMetrics = metrics;

    if (failure || error) {
      const normalizedFailure = failure ?? classifyRunFailure(error, metrics);
      return {
        ...base,
        score: 0,
        metrics,
        details: emptyDetails(task),
        failure: normalizedFailure,
        error: normalizedFailure.message,
      };
    }

    if (task.category.id === EVAL_CATEGORIES.FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.LLM_FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.APP_FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.ATTACKER_REACHABLE_FIND_VULNS.id) {
      const findingsInput = findings ?? finalText;
      const details = task.groundTruth === "attacker-reachable"
        ? runner.id === "deepsec-cli"
          ? scoreLocalizedFindVulns(findingsInput, task)
          : scoreAttackerReachableFindVulns(findingsInput, task)
        : scoreFindVulns(findingsInput, task);
      const score = primaryFindVulnsScore(details, task.groundTruth);
      return { ...base, score, metrics, details };
    } else {
      const details = await scoreFixVulns(cwd, task);
      const score = fixVulnsScore(details);
      return { ...base, score, metrics, details };
    }
  } catch (error) {
    const failure = classifyRunFailure(error, latestMetrics);
    return {
      ...base,
      score: 0,
      metrics: latestMetrics,
      details: emptyDetails(task),
      failure,
      error: failure.message,
    };
  } finally {
    workspace.cleanup();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  delete process.env[AGENT_TRACE_DIR_ENV];

  if (opts.status) {
    const executionDir = resolveExecutionDirectory(RESULTS_DIR, opts.status);
    const execution = checkpointExecution(executionDir, RESULTS_DIR);
    printExecutionStatus(execution.progress);
    console.log(`  Bundle: ${executionDir}\n`);
    return;
  }

  const EVAL_TASKS = loadEvalTasks();
  const DEFAULT_RUN_CONFIGS = loadRunConfigs();
  const CONFIG_GROUPS = loadRunConfigGroups(DEFAULT_RUN_CONFIGS);
  let selectedGroup: RunConfigGroup | undefined;
  let selectedCategory: EvalCategoryId | undefined;
  let tasks: EvalTask[];
  let configs: RunConfig[];
  let repetitions: number;
  let executionDir: string | undefined;
  let resumeManifest: ReturnType<typeof readExecutionManifest> | undefined;

  if (opts.resume) {
    executionDir = resolveExecutionDirectory(RESULTS_DIR, opts.resume);
    resumeManifest = readExecutionManifest(executionDir);
    selectedCategory = resumeManifest.selection.category as EvalCategoryId | null
      ?? undefined;
    repetitions = resumeManifest.selection.repetitions;
    tasks = resolveIds(
      resumeManifest.selection.taskIds,
      EVAL_TASKS,
      "task",
    );
    configs = resolveIds(
      resumeManifest.selection.configIds,
      DEFAULT_RUN_CONFIGS,
      "config",
    );
  } else {
    selectedGroup = opts.allConfigs
      ? undefined
      : CONFIG_GROUPS.find((group) => group.id === (opts.configGroup ?? "default"));
    if (!opts.allConfigs && !selectedGroup) {
      console.error(
        `Unknown config group "${opts.configGroup ?? "default"}". Available: ${CONFIG_GROUPS.map((group) => group.id).join(", ")}`,
      );
      process.exit(1);
    }
    if (
      selectedGroup?.category
      && opts.category
      && selectedGroup.category !== opts.category
    ) {
      console.error(
        `Config group "${selectedGroup.id}" requires category "${selectedGroup.category}", not "${opts.category}"`,
      );
      process.exit(1);
    }
    tasks = EVAL_TASKS;
    selectedCategory = opts.category ?? selectedGroup?.category;
    if (selectedCategory) {
      tasks = tasks.filter((task) => task.category.id === selectedCategory);
    }
    if (opts.tasks) {
      const ids = new Set(opts.tasks);
      tasks = tasks.filter((task) => ids.has(task.id));
    }
    configs = DEFAULT_RUN_CONFIGS;
    if (opts.configs) {
      const ids = new Set(opts.configs);
      configs = configs.filter((config) => ids.has(config.id));
    } else if (selectedGroup) {
      configs = resolveIds(selectedGroup.configIds, DEFAULT_RUN_CONFIGS, "config");
    }
    repetitions = opts.repetitions
      ?? selectedGroup?.defaultRepetitions
      ?? 1;
  }

  if (tasks.length === 0) {
    console.error("No matching tasks found. Available:", EVAL_TASKS.map((t) => t.id).join(", "));
    process.exit(1);
  }
  if (configs.length === 0) {
    console.error(`No matching configs found for "${opts.configs?.join(", ")}". Available:`, DEFAULT_RUN_CONFIGS.map((c) => c.id).join(", "));
    process.exit(1);
  }

  const compatibleTasks = opts.resume && resumeManifest
    ? compatibleTasksFromManifest(resumeManifest.plannedRuns, tasks, configs)
    : new Map(
      configs.map((config) => [
        config.id,
        tasks.filter((task) => configSupportsTask(config, task)),
      ]),
    );
  configs = configs.filter((config) =>
    (compatibleTasks.get(config.id)?.length ?? 0) > 0
  );
  if (configs.length === 0) {
    console.error("No compatible task/config pairs remain after category restrictions.");
    process.exit(1);
  }
  const totalRuns = configs.reduce(
    (total, config) => total + (compatibleTasks.get(config.id)?.length ?? 0),
    0,
  ) * repetitions;
  const repSuffix = repetitions > 1 ? ` × ${repetitions} rep(s)` : "";

  console.log(`\n${styleText("bold", `Benchmark: ${tasks.length} task(s), ${configs.length} config(s)${repSuffix} = ${totalRuns} compatible run(s)`)}`);
  for (const task of tasks) {
    const taskConfigs = configs.filter((config) => configSupportsTask(config, task));
    if (taskConfigs.length === 0) continue;
    console.log(`  ${styleText("bold", task.id)}  ${styleText("dim", `[${task.category.id}]`)}`);
    for (let i = 0; i < taskConfigs.length; i++) {
      const c = taskConfigs[i];
      const connector = i === taskConfigs.length - 1 ? "└─" : "├─";
      const label = getRunner(c).describe(c);
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

  let execution = opts.resume && executionDir && resumeManifest
    ? checkpointExecution(executionDir, RESULTS_DIR)
    : initializeExecution({
      projectRoot: PROJECT_ROOT,
      resultsDir: RESULTS_DIR,
      argv: process.argv.slice(2),
      tasks,
      configs,
      compatibleTasks,
      repetitions,
      selectedGroup,
      selectedCategory,
      budgets: {
        ...(opts.maxCostUsd !== undefined && { maxCostUsd: opts.maxCostUsd }),
        ...(opts.maxTokens !== undefined && { maxTokens: opts.maxTokens }),
        ...(opts.maxRunTimeMs !== undefined && { maxRunTimeMs: opts.maxRunTimeMs }),
      },
    });
  const lock = acquireExecutionLock(execution.executionDir);
  let pauseRequested = false;
  let pauseReason: string | undefined;
  let interruptCount = 0;
  let activeAbortController: AbortController | undefined;
  const onSigint = () => {
    interruptCount++;
    pauseRequested = true;
    pauseReason = interruptCount === 1
      ? "SIGINT received; pausing after the active run"
      : "Second SIGINT received; aborting the active run";
    console.log(`\n${pauseReason}`);
    if (interruptCount > 1) activeAbortController?.abort();
  };
  const onSigterm = () => {
    pauseRequested = true;
    pauseReason = "SIGTERM received; aborting the active run";
    console.log(`\n${pauseReason}`);
    activeAbortController?.abort();
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  try {
    if (opts.resume) {
      reconcileInterruptedRuns(execution.executionDir);
      validateExecutionInputs(execution.manifest, {
        projectRoot: PROJECT_ROOT,
        resultsDir: RESULTS_DIR,
        argv: execution.manifest.argv,
        tasks,
        configs,
        compatibleTasks,
        repetitions,
        selectedCategory,
        budgets: execution.manifest.budgets,
      });
      execution = checkpointExecution(execution.executionDir, RESULTS_DIR);
    }
    console.log(`\nExecution bundle: ${execution.executionDir}`);
    if (opts.traceAgent || execution.manifest.argv.includes("--trace-agent")) {
      process.env[AGENT_TRACE_DIR_ENV] = resolve(
        execution.executionDir,
        "artifacts",
        "traces",
      );
      console.log(`Agent tracing enabled: ${process.env[AGENT_TRACE_DIR_ENV]}`);
    }

    const records = new Map(
      listRunRecords(execution.executionDir).map((record) => [record.runKey, record]),
    );
    let activeConfigId: string | undefined;
    for (const spec of execution.manifest.plannedRuns) {
      const beforeRunBudget = executionBudgetReason(
        execution.progress,
        execution.manifest.budgets,
      );
      if (pauseRequested || beforeRunBudget) {
        pauseReason ??= beforeRunBudget;
        break;
      }
      const existing = records.get(spec.runKey);
      const runnable = !existing
        || (existing.status === "failed" && opts.retryFailed)
        || (
          existing.status === "interrupted-uncertain"
          && opts.retryInterrupted
        );
      if (!runnable) continue;

      const config = configs.find((candidate) => candidate.id === spec.runConfigId)!;
      const task = tasks.find((candidate) => candidate.id === spec.taskId)!;
      if (activeConfigId !== config.id) {
        activeConfigId = config.id;
        printConfigHeader(
          config.name,
          configs.findIndex((candidate) => candidate.id === config.id) + 1,
          configs.length,
        );
      }
      const repLabel = repetitions > 1
        ? ` (rep ${spec.repetition}/${repetitions})`
        : "";
      printRunProgress(
        `${task.name}${repLabel}`,
        spec.ordinal,
        execution.manifest.plannedRuns.length,
      );
      const record = beginExecutionRun(execution.executionDir, spec);
      activeAbortController = new AbortController();
      const runTimeLimit = minimumDefined(
        execution.manifest.budgets.maxRunTimeMs,
        "timeoutMs" in config ? config.timeoutMs : undefined,
      );
      const timeout = runTimeLimit === undefined
        ? undefined
        : setTimeout(() => {
          pauseRequested = true;
          pauseReason = `Run exceeded ${runTimeLimit}ms time budget`;
          activeAbortController?.abort();
        }, runTimeLimit);
      timeout?.unref();
      const result = await runEval(task, config, activeAbortController);
      if (timeout) clearTimeout(timeout);
      activeAbortController = undefined;
      result.repetition = spec.repetition;
      result.totalRepetitions = spec.totalRepetitions;
      printResult(result);
      const finished = finishExecutionRun(execution.executionDir, record, result);
      records.set(spec.runKey, finished);
      execution = checkpointExecution(execution.executionDir, RESULTS_DIR);
      const failure = finished.attempts.at(-1)?.failure;
      if (
        failure
        && !opts.continueOnError
        && shouldPauseAfterFailure(failure)
      ) {
        pauseRequested = true;
        pauseReason = `${failure.kind} failure: ${failure.message}`;
      }
      pauseReason ??= executionBudgetReason(
        execution.progress,
        execution.manifest.budgets,
      );
      if (pauseReason) pauseRequested = true;
    }

    const taskAggregates = aggregateByTask(execution.results);
    const configAggregates = aggregateByConfig(taskAggregates, execution.results);

    printSummaryTable(execution.results, taskAggregates, configAggregates);
    printExecutionStatus(execution.progress);
    if (pauseRequested) {
      console.log(`  Paused: ${pauseReason ?? "operator request"}`);
      console.log(`  Resume: pnpm tsx src/index.ts --resume ${execution.manifest.executionId}`);
    }

    console.log(`Results saved to: ${execution.executionDir}`);
    console.log(`Compatibility JSONL: ${execution.compatibilityJsonlPath}\n`);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    activeAbortController?.abort();
    lock.release();
  }
}

function resolveIds<T extends { id: string }>(
  ids: string[],
  values: T[],
  kind: string,
): T[] {
  return ids.map((id) => {
    const value = values.find((candidate) => candidate.id === id);
    if (!value) throw new Error(`Execution manifest references unknown ${kind} "${id}"`);
    return value;
  });
}

function compatibleTasksFromManifest(
  plannedRuns: Array<{ runConfigId: string; taskId: string }>,
  tasks: EvalTask[],
  configs: RunConfig[],
): Map<string, EvalTask[]> {
  return new Map(configs.map((config) => {
    const taskIds = [...new Set(
      plannedRuns
        .filter((run) => run.runConfigId === config.id)
        .map((run) => run.taskId),
    )];
    return [config.id, resolveIds(taskIds, tasks, "task")];
  }));
}

function executionBudgetReason(
  progress: ReturnType<typeof checkpointExecution>["progress"],
  budgets: ReturnType<typeof readExecutionManifest>["budgets"],
): string | undefined {
  const observedTokens = progress.observedUsage.logicalInputTokens
    + progress.observedUsage.outputTokens;
  if (budgets.maxCostUsd !== undefined && progress.observedUsage.costUsd >= budgets.maxCostUsd) {
    return `Execution reached the $${budgets.maxCostUsd.toFixed(2)} observed cost budget`;
  }
  if (budgets.maxTokens !== undefined && observedTokens >= budgets.maxTokens) {
    return `Execution reached the ${budgets.maxTokens.toLocaleString()} observed token budget`;
  }
  return undefined;
}

function minimumDefined(
  ...values: Array<number | undefined>
): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

if (isIsolatedBenchmarkWorker()) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  runInIsolatedBenchmarkWorker().catch((err) => {
    console.error("Failed to start isolated benchmark worker:", err);
    process.exit(1);
  });
}
