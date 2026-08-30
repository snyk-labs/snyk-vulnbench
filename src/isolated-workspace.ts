import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface IsolatedWorkspace {
  rootDir: string;
  projectDir: string;
  stateDir: string;
  outputDir: string;
  cleanup(): void;
}

/**
 * Copies only the fixture's project directory into an OS temp root. Ground
 * truth and fixture metadata intentionally remain outside the copied tree.
 */
export function createIsolatedWorkspace(projectSource: string): IsolatedWorkspace {
  const rootDir = mkdtempSync(join(tmpdir(), "vulnbench-run-"));
  const projectDir = join(rootDir, "project");
  const stateDir = join(rootDir, "state");
  const outputDir = join(rootDir, "output");

  cpSync(projectSource, projectDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  let cleaned = false;
  return {
    rootDir,
    projectDir,
    stateDir,
    outputDir,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

/**
 * Makes every copied project file appear as a branch change so Claude Code's
 * built-in /security-review command can review a fixture as a whole.
 */
export function prepareSecurityReviewGitWorkspace(projectDir: string): void {
  rmSync(join(projectDir, ".git"), { recursive: true, force: true });

  const git = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  git(["init", "--initial-branch=main"]);
  git([
    "-c", "user.name=VulnBench",
    "-c", "user.email=vulnbench@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--allow-empty", "-m", "VulnBench empty baseline",
  ]);
  const baselineCommit = git(["rev-parse", "HEAD"]);

  git(["remote", "add", "origin", "."]);
  git(["update-ref", "refs/remotes/origin/main", baselineCommit]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  git(["add", "--all", "--force"]);
  git([
    "-c", "user.name=VulnBench",
    "-c", "user.email=vulnbench@localhost",
    "-c", "commit.gpgSign=false",
    "commit", "--allow-empty", "-m", "VulnBench fixture snapshot",
  ]);
}
