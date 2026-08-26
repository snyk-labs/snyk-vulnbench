import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsolatedWorkspace } from "../isolated-workspace.js";

export const CODEX_CLI_VERSION = "0.149.1";
export const CODEX_PERMISSION_PROFILE = "vulnbench-workspace";
const RUNNERS_DIR = dirname(fileURLToPath(import.meta.url));

export function codexExecutable(): string {
  return resolve(
    RUNNERS_DIR,
    "../../node_modules/.bin/codex",
  );
}

export function codexPermissionConfig(
  workspaceAccess: "read" | "write",
): string[] {
  const profile = JSON.stringify(CODEX_PERMISSION_PROFILE);
  const permissions =
    `{filesystem={":root"="deny",":minimal"="read",`
    + `":workspace_roots"={"."="${workspaceAccess}"}},`
    + `network={enabled=false}}`;
  const shellEnvironment =
    `{inherit="core",ignore_default_excludes=false,`
    + `exclude=["*KEY*","*TOKEN*","*SECRET*","*PASSWORD*",`
    + `"OPEN_AI_API_KEY","OPENAI_API_KEY","CODEX_API_KEY"]}`;

  return [
    "-c", `default_permissions=${profile}`,
    "-c", `permissions.${CODEX_PERMISSION_PROFILE}=${permissions}`,
    "-c", 'approval_policy="never"',
    "-c", "project_root_markers=[]",
    "-c", `shell_environment_policy=${shellEnvironment}`,
    "-c", 'web_search="disabled"',
    "-c", 'history.persistence="none"',
  ];
}

export function createCodexEnvironment(
  workspace: IsolatedWorkspace,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const codexHome = resolve(workspace.stateDir, "codex-home");
  mkdirSync(codexHome, { recursive: true });

  const environment: NodeJS.ProcessEnv = {
    CODEX_HOME: codexHome,
  };
  const exactNames = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "TERM",
    "TMPDIR",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ];
  for (const name of exactNames) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("LC_") && value !== undefined) environment[name] = value;
  }

  const apiKey = source.CODEX_API_KEY
    ?? source.OPEN_AI_API_KEY
    ?? source.OPENAI_API_KEY;
  if (apiKey) environment.CODEX_API_KEY = apiKey;
  return environment;
}
