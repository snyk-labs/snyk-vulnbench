import {
  existsSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsolatedWorkspace } from "../isolated-workspace.js";
import { executeProcess } from "../process-executor.js";

const SANDBOX_DIR = dirname(fileURLToPath(import.meta.url));
const LANDLOCK_SOURCE = join(SANDBOX_DIR, "landlock-run.c");
const NODE_MODULES = resolve(SANDBOX_DIR, "../../node_modules");

export interface LandlockInvocation {
  program: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
}

export async function buildLandlockInvocation(
  workspace: IsolatedWorkspace,
  projectAccess: "read" | "write",
  command: string,
  commandArgs: string[],
  environment: NodeJS.ProcessEnv,
): Promise<LandlockInvocation> {
  if (process.platform !== "linux") {
    throw new Error("Codex hard containment currently requires Linux Landlock");
  }
  const helper = await compileLandlockHelper(workspace, environment);
  const tempDir = join(workspace.stateDir, "tmp");
  const npmCache = join(workspace.stateDir, "npm-cache");
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(npmCache, { recursive: true });

  const args: string[] = [];
  for (const path of readableSystemRoots()) {
    args.push("--ro", path);
  }
  if (existsSync("/dev")) args.push("--rw", realpathSync("/dev"));
  args.push("--ro", realpathSync(NODE_MODULES));
  args.push(
    projectAccess === "write" ? "--rw" : "--ro",
    realpathSync(workspace.projectDir),
  );
  args.push("--rw", realpathSync(workspace.stateDir));
  args.push("--rw", realpathSync(workspace.outputDir));
  args.push("--", command, ...commandArgs);

  return {
    program: helper,
    args,
    environment: {
      ...environment,
      TMPDIR: tempDir,
      npm_config_cache: npmCache,
    },
  };
}

async function compileLandlockHelper(
  workspace: IsolatedWorkspace,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const output = join(workspace.stateDir, "landlock-run");
  if (existsSync(output)) return output;
  const result = await executeProcess({
    program: "cc",
    args: [
      "-O2",
      "-Wall",
      "-Wextra",
      "-o", output,
      LANDLOCK_SOURCE,
    ],
    cwd: workspace.stateDir,
    env: environment,
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to compile Landlock helper: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return output;
}

function readableSystemRoots(): string[] {
  return [
    "/usr",
    "/bin",
    "/lib",
    "/lib64",
    "/etc",
    "/proc",
    "/sys",
    "/run",
  ].filter(existsSync).map((path) => realpathSync(path));
}
