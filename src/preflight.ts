import { execFileSync } from "child_process";
import { styleText } from "node:util";
import type { RunConfig, CommandRunConfig, ModelRunConfig } from "./types.js";
import {
  CODEX_CLI_VERSION,
  codexExecutable,
} from "./runners/codex-config.js";

interface CheckResult {
  ok: boolean;
  label: string;
  detail: string;
}

/**
 * Runs preflight health checks for the tools required by the selected configs.
 * Each selected native harness and security integration validates its binary
 * and authentication before paid benchmark work starts.
 * Prints a summary and exits non-zero if any required check fails.
 */
export function runPreflight(configs: RunConfig[]): void {
  const needsClaude = configs.some(
    (c) => c.type !== "command" && c.runner !== "codex-cli",
  );
  const needsCodex = configs.some(
    (c) => c.type !== "command" && c.runner === "codex-cli",
  );
  const needsSnyk = configs.some(
    (c) => {
      if (c.type !== "command") return false;
      const command = c as CommandRunConfig;
      return command.executable === "snyk"
        || command.command?.startsWith("snyk") === true;
    },
  );
  const needsSnykMcp = configs.some(usesSnykMcp);

  const checks: CheckResult[] = [];

  if (needsClaude) {
    checks.push(checkClaudeInstalled());
    checks.push(checkClaudeAuth());
  }

  if (needsCodex) {
    checks.push(checkCodexInstalled());
    checks.push(checkCodexAuth());
  }

  if (needsSnyk) {
    checks.push(checkSnykInstalled());
    checks.push(checkSnykAuth("snyk", []));
  }

  if (needsSnykMcp) {
    checks.push(checkSnykAuth("npx", ["-y", "snyk@latest"]));
  }

  printChecks(checks);

  const failures = checks.filter((c) => !c.ok);
  if (failures.length > 0) {
    console.error(`\nPreflight failed: ${failures.length} check(s) need attention. Fix the issues above and retry.\n`);
    process.exit(1);
  }
}

// ─── Individual Checks ──────────────────────────────────────────────────────

function checkClaudeInstalled(): CheckResult {
  try {
    const version = run("claude", ["--version"]).trim();
    return { ok: true, label: "Claude Code CLI", detail: version };
  } catch {
    return {
      ok: false,
      label: "Claude Code CLI",
      detail: "Not found. Install: npm install -g @anthropic-ai/claude-code",
    };
  }
}

function checkClaudeAuth(): CheckResult {
  const failMsg = "Not logged in. Run: claude auth login  (or set ANTHROPIC_API_KEY)";
  try {
    const output = run("claude", ["auth", "status"]);
    try {
      const status = JSON.parse(output);
      if (status.loggedIn) {
        const parts = [status.authMethod, status.email, status.orgName].filter(Boolean);
        return { ok: true, label: "Claude Code auth", detail: parts.join(", ") || "authenticated" };
      }
    } catch {
      // Not JSON — fall through to text heuristics for older CLI versions
      if (/logged.?in|authenticated|ANTHROPIC_API_KEY/i.test(output)) {
        return { ok: true, label: "Claude Code auth", detail: output.split("\n").filter(Boolean)[0]?.trim() ?? "authenticated" };
      }
    }
    return { ok: false, label: "Claude Code auth", detail: failMsg };
  } catch {
    return { ok: false, label: "Claude Code auth", detail: failMsg };
  }
}

function checkCodexInstalled(): CheckResult {
  try {
    const version = run(codexExecutable(), ["--version"]).trim();
    const ok = version.includes(CODEX_CLI_VERSION);
    return {
      ok,
      label: "Codex CLI",
      detail: ok
        ? version
        : `Expected ${CODEX_CLI_VERSION}, got ${version || "unknown"}`,
    };
  } catch {
    return {
      ok: false,
      label: "Codex CLI",
      detail: `Pinned CLI unavailable. Run: pnpm install`,
    };
  }
}

function checkCodexAuth(): CheckResult {
  if (
    process.env.CODEX_API_KEY
    || process.env.OPEN_AI_API_KEY
    || process.env.OPENAI_API_KEY
  ) {
    return {
      ok: true,
      label: "Codex authentication",
      detail: "API key available",
    };
  }
  try {
    const status = run(codexExecutable(), ["login", "status"]).trim();
    return {
      ok: true,
      label: "Codex authentication",
      detail: status.split("\n").filter(Boolean)[0] ?? "authenticated",
    };
  } catch {
    return {
      ok: false,
      label: "Codex authentication",
      detail: "Set OPEN_AI_API_KEY or run: pnpm exec codex login",
    };
  }
}

function checkSnykInstalled(): CheckResult {
  try {
    const version = run("snyk", ["--version"]).trim();
    return { ok: true, label: "Snyk CLI", detail: `v${version.replace(/^v/, "")}` };
  } catch {
    return {
      ok: false,
      label: "Snyk CLI",
      detail: "Not found. Install: npm install -g snyk",
    };
  }
}

function usesSnykMcp(config: RunConfig): boolean {
  if (config.type === "command") return false;

  return Object.entries((config as ModelRunConfig).mcpServers ?? {}).some(([name, server]) =>
    name.toLowerCase() === "snyk"
    || server.command.toLowerCase().includes("snyk")
    || server.args?.some((arg) => arg.toLowerCase().includes("snyk")) === true
  );
}

function checkSnykAuth(program: string, prefixArgs: string[]): CheckResult {
  try {
    const identity = run(program, [...prefixArgs, "whoami"]).trim();
    return { ok: true, label: "Snyk authentication", detail: identity || "authenticated" };
  } catch {
    return {
      ok: false,
      label: "Snyk authentication",
      detail: "Authentication failed. Set a valid SNYK_TOKEN in the benchmark .env file.",
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

function printChecks(checks: CheckResult[]): void {
  console.log("\nPreflight checks:");
  for (const c of checks) {
    const icon = c.ok ? styleText("green", "✔") : styleText("red", "✘");
    const detail = c.ok ? c.detail : styleText("red", c.detail);
    console.log(`  ${icon} ${c.label}: ${detail}`);
  }
}
