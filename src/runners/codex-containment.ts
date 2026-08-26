import {
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { IsolatedWorkspace } from "../isolated-workspace.js";
import { executeProcess } from "../process-executor.js";
import {
  CODEX_PERMISSION_PROFILE,
  codexExecutable,
  codexPermissionConfig,
  createCodexEnvironment,
} from "./codex-config.js";

export interface CodexContainmentResult {
  ok: boolean;
  detail: string;
}

/**
 * Exercises the same Codex permission profile used by model runs. This proves
 * the current host can read the project while denying a sibling path before
 * any paid request is made.
 */
export async function probeCodexContainment(
  workspace: IsolatedWorkspace,
  workspaceAccess: "read" | "write",
): Promise<CodexContainmentResult> {
  const insidePath = join(workspace.projectDir, ".vulnbench-inside-sentinel");
  const outsidePath = join(workspace.rootDir, ".vulnbench-outside-sentinel");
  const insideValue = `inside-${randomUUID()}`;
  const outsideValue = `outside-${randomUUID()}`;
  writeFileSync(insidePath, insideValue, { mode: 0o600 });
  writeFileSync(outsidePath, outsideValue, { mode: 0o600 });

  try {
    const result = await executeProcess({
      program: codexExecutable(),
      args: [
        "sandbox",
        "-C", workspace.projectDir,
        "-P", CODEX_PERMISSION_PROFILE,
        ...codexPermissionConfig(workspaceAccess),
        "sh",
        "-c",
        'inside="$(cat "$1")" || exit 20; if cat "$2" >/dev/null 2>&1; then exit 21; fi; printf "%s" "$inside"',
        "containment-probe",
        insidePath,
        outsidePath,
      ],
      cwd: workspace.projectDir,
      env: createCodexEnvironment(workspace),
      timeoutMs: 15_000,
      maxOutputBytes: 256 * 1024,
    });

    if (result.exitCode === 0 && result.stdout === insideValue) {
      return {
        ok: true,
        detail: "workspace readable; sibling path denied",
      };
    }
    const diagnostic = result.stderr.trim() || result.stdout.trim();
    return {
      ok: false,
      detail: diagnostic
        || `containment probe exited with code ${result.exitCode}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    rmSync(insidePath, { force: true });
    rmSync(outsidePath, { force: true });
  }
}
