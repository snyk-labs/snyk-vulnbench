import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
