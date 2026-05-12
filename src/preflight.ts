import { execFileSync } from "child_process";
import { styleText } from "node:util";
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
    const icon = c.ok ? styleText("green", "✔") : styleText("red", "✘");
    const detail = c.ok ? c.detail : styleText("red", c.detail);
    console.log(`  ${icon} ${c.label}: ${detail}`);
  }
}
