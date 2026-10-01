import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CommandRunConfig, RunConfig } from "./types.js";
import type { BenchmarkRunner } from "./runners/types.js";

// Memoized `<cmd> --version` probes, so each runner version is resolved once per process.
const cache = new Map<string, string | null>();

function versionOf(cmd: string): string | null {
  if (!cache.has(cmd)) {
    let v: string | null = null;
    try {
      v = execFileSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 15_000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim().split("\n")[0] || null;
    } catch {
      v = null;
    }
    cache.set(cmd, v);
  }
  return cache.get(cmd)!;
}

// The Claude Code binary bundled with the Agent SDK (what runTask actually executes).
function bundledClaudeBinary(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const sdkReq = createRequire(req.resolve("@anthropic-ai/claude-agent-sdk"));
    const pkg = sdkReq.resolve(
      `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`,
    );
    return join(dirname(pkg), "claude");
  } catch {
    return null;
  }
}

export function resolveRunnerVersion(runner: BenchmarkRunner, config: RunConfig): string | null {
  if (runner.version) return runner.version;
  if (runner.id === "claude-code") {
    const bin = bundledClaudeBinary();
    return (bin ? versionOf(bin) : null) ?? versionOf("claude");
  }
  if (runner.kind === "command") {
    const exe = (config as CommandRunConfig).executable;
    return exe ? versionOf(exe) : null;
  }
  return null;
}
