import { execFileSync } from "child_process";
import type { RunConfig, CommandRunConfig } from "./types.js";

interface CheckResult {
  ok: boolean;
  label: string;
  detail: string;
}

/**
 * Runs preflight health checks for the tools required by the selected configs.
 * Model configs need Claude Code CLI; command configs containing "snyk" need the Snyk CLI.
 * Prints a summary and exits non-zero if any required check fails.
 */
export function runPreflight(configs: RunConfig[]): void {
  const needsClaude = configs.some((c) => c.type !== "command");
  const needsSnyk = configs.some(
    (c) => c.type === "command" && (c as CommandRunConfig).command.startsWith("snyk"),
  );

  const checks: CheckResult[] = [];

  if (needsClaude) {
    checks.push(checkClaudeInstalled());
    checks.push(checkClaudeAuth());
  }

  if (needsSnyk) {
    checks.push(checkSnykInstalled());
    checks.push(checkSnykAuth());
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
  try {
    const output = run("claude", ["auth", "status"]);
    const loggedIn = /logged in/i.test(output) || /authenticated/i.test(output) || /ANTHROPIC_API_KEY/i.test(output);
    if (loggedIn) {
      const summary = output.split("\n").filter(Boolean).slice(0, 2).join(" ").trim();
      return { ok: true, label: "Claude Code auth", detail: summary };
    }
    return {
      ok: false,
      label: "Claude Code auth",
      detail: "Not logged in. Run: claude auth login  (or set ANTHROPIC_API_KEY)",
    };
  } catch {
    return {
      ok: false,
      label: "Claude Code auth",
      detail: "Could not verify auth. Run: claude auth login  (or set ANTHROPIC_API_KEY)",
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

function checkSnykAuth(): CheckResult {
  try {
    const token = run("snyk", ["config", "get", "api"]).trim();
    if (token && token.length > 0 && !/no api token/i.test(token)) {
      const masked = token.length > 8 ? token.slice(0, 4) + "…" + token.slice(-4) : "****";
      return { ok: true, label: "Snyk API token", detail: `configured (${masked})` };
    }
    return {
      ok: false,
      label: "Snyk API token",
      detail: "No API token set. Run: snyk auth  (or: snyk config set api=<TOKEN>)",
    };
  } catch {
    return {
      ok: false,
      label: "Snyk API token",
      detail: "No API token set. Run: snyk auth  (or: snyk config set api=<TOKEN>)",
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function printChecks(checks: CheckResult[]): void {
  console.log("\nPreflight checks:");
  for (const c of checks) {
    const icon = c.ok ? "✔" : "✘";
    console.log(`  ${icon} ${c.label}: ${c.detail}`);
  }
}
