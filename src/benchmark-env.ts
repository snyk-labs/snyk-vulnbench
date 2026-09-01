import { readFileSync } from "fs";
import { spawn } from "child_process";
import { parseEnv } from "node:util";
import { resolve } from "path";

const ISOLATED_WORKER_ENV = "VULNBENCH_ISOLATED_WORKER";
const DOTENV_PATH = resolve(import.meta.dirname, "../.env");

/**
 * Builds the environment for the benchmark worker. Values declared in the
 * repository `.env` deliberately override parent-process values, while all
 * other runtime variables (PATH, HOME, OAuth configuration, proxies, etc.)
 * remain available.
 */
export function createBenchmarkEnvironment(
  parentEnv: NodeJS.ProcessEnv = process.env,
  dotenvPath = DOTENV_PATH,
): NodeJS.ProcessEnv {
  let dotenv: NodeJS.ProcessEnv = {};
  try {
    dotenv = parseEnv(readFileSync(dotenvPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const environment = { ...parentEnv };
  for (const key of Object.keys(dotenv)) delete environment[key];
  return { ...environment, ...dotenv };
}

export function isIsolatedBenchmarkWorker(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment[ISOLATED_WORKER_ENV] === "1";
}

/**
 * Starts this CLI invocation in a clean configuration worker and forwards its
 * exit status. The current process is intentionally only a bootstrapper.
 */
export async function runInIsolatedBenchmarkWorker(): Promise<void> {
  const detached = process.platform !== "win32";
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    process.argv[1],
    ...process.argv.slice(2),
  ], {
    cwd: process.cwd(),
    env: {
      ...createBenchmarkEnvironment(),
      [ISOLATED_WORKER_ENV]: "1",
    },
    detached,
    stdio: "inherit",
  });
  const forwardSignal = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (detached) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // Worker already exited.
    }
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolveExit(code ?? (signal ? 1 : 0));
      });
    });
    process.exitCode = exitCode;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}
