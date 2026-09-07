import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEvalTasks,
  loadRunConfigGroups,
  loadRunConfigs,
} from "./evals/loader.js";
import { configSupportsTask } from "./evals/selection.js";
import {
  forkExecutionBundle,
  type ForkExecutionReport,
} from "./results/execution-fork.js";
import {
  readExecutionManifest,
  resolveExecutionDirectory,
} from "./results/execution-store.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = resolve(PROJECT_ROOT, "results");

interface ForkArgs {
  from: string;
  configGroup: string;
  resetPhase: string;
  expectedImported: number;
  expectedPending: number;
  create: boolean;
  json: boolean;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const parentDir = resolveExecutionDirectory(RESULTS_DIR, args.from);
  const parentManifest = readExecutionManifest(parentDir);
  const allConfigs = loadRunConfigs();
  const groups = loadRunConfigGroups(allConfigs);
  const group = groups.find((candidate) => candidate.id === args.configGroup);
  if (!group) {
    throw new Error(
      `Unknown config group "${args.configGroup}". Available: ${groups.map((candidate) => candidate.id).join(", ")}`,
    );
  }
  const allTasks = loadEvalTasks();
  const tasks = parentManifest.selection.taskIds.map((id) => {
    const task = allTasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`Parent references unknown task "${id}"`);
    return task;
  });
  const configs = group.configIds.map((id) => {
    const config = allConfigs.find((candidate) => candidate.id === id);
    if (!config) throw new Error(`Child group references unknown config "${id}"`);
    return config;
  });
  const compatibleTasks = new Map(
    configs.map((config) => [
      config.id,
      tasks.filter((task) => configSupportsTask(config, task)),
    ]),
  );
  const report = forkExecutionBundle({
    parentDir,
    executionsRoot: resolve(RESULTS_DIR, "executions"),
    childInput: {
      projectRoot: PROJECT_ROOT,
      resultsDir: RESULTS_DIR,
      argv: process.argv.slice(2),
      tasks,
      configs,
      compatibleTasks,
      repetitions: parentManifest.selection.repetitions,
      selectedGroup: group,
      selectedCategory: group.category,
      budgets: parentManifest.budgets,
    },
    resetPhaseId: args.resetPhase,
    expectedImported: args.expectedImported,
    expectedPending: args.expectedPending,
    create: args.create,
  });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report, args.create);
}

function parseArgs(argv: string[]): ForkArgs {
  const values = argv.filter((argument) => argument !== "--");
  const known = new Set([
    "--from",
    "--config-group",
    "--reset-phase",
    "--expect-imported",
    "--expect-pending",
    "--create",
    "--json",
  ]);
  for (const argument of values) {
    if (argument.startsWith("--") && !known.has(argument)) {
      throw new Error(`Unknown or unsafe fork option "${argument}"`);
    }
  }
  const from = readFlag(values, "--from");
  const configGroup = readFlag(values, "--config-group");
  const resetPhase = readFlag(values, "--reset-phase");
  const expectedImported = positiveInteger(
    readFlag(values, "--expect-imported"),
    "--expect-imported",
  );
  const expectedPending = positiveInteger(
    readFlag(values, "--expect-pending"),
    "--expect-pending",
  );
  if (!from || !configGroup || !resetPhase) {
    throw new Error(
      "Usage: pnpm results:fork -- --from <execution> --config-group <group> --reset-phase <phase> --expect-imported <n> --expect-pending <n> [--create] [--json]",
    );
  }
  return {
    from,
    configGroup,
    resetPhase,
    expectedImported,
    expectedPending,
    create: values.includes("--create"),
    json: values.includes("--json"),
  };
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, flag: string): number {
  const number = Number(value);
  if (!value || !Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return number;
}

function printReport(report: ForkExecutionReport, created: boolean): void {
  const statuses = Object.entries(
    report.childManifest.lineage?.importSummary.discardedByStatus ?? {},
  ).map(([status, count]) => `${count} ${status}`).join(", ");
  console.log(`\nFork ${created ? "created" : "dry run"}:`);
  console.log(`  Parent: ${report.parentExecutionId}`);
  console.log(`  Parent integrity: ${report.parentIntegrityHash}`);
  console.log(`  Child plan: ${report.childManifest.executionId}`);
  console.log(`  Planned: ${report.childManifest.plannedRuns.length}`);
  console.log(`  Imported: ${report.imported.length}`);
  console.log(`  Pending: ${report.pendingRuns}`);
  console.log(`  Discarded parent records: ${report.discarded.length}${statuses ? ` (${statuses})` : ""}`);
  if (report.childDir) {
    console.log(`  Child bundle: ${report.childDir}`);
    console.log(
      `  Next: pnpm tsx src/index.ts --resume ${report.childManifest.executionId} --phase deepsec`,
    );
  } else {
    console.log("  No files written. Add --create only after reviewing this report.");
  }
  console.log();
}

try {
  main();
} catch (error) {
  console.error(`Fork failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

