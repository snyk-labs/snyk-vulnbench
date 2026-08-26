import type { MCPServerConfig } from "../types.js";

const ENV_REFERENCE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const SAFE_SERVER_NAME = /^[A-Za-z0-9_-]+$/;

export interface CodexMcpConfiguration {
  configArgs: string[];
  environmentNames: Set<string>;
  serverNames: string[];
}

export function buildCodexMcpConfiguration(
  servers: Record<string, MCPServerConfig> | undefined,
  projectDir: string,
): CodexMcpConfiguration {
  const entries = Object.entries(servers ?? {});
  const configArgs = ["-c", "mcp_servers={}"];
  const environmentNames = new Set<string>();

  for (const [name, server] of entries) {
    if (!SAFE_SERVER_NAME.test(name)) {
      throw new Error(
        `Codex MCP server name "${name}" may contain only letters, numbers, underscores, and hyphens`,
      );
    }

    const envVars: string[] = [];
    const literalEnv: Record<string, string> = {};
    for (const [targetName, value] of Object.entries(server.env ?? {})) {
      const reference = ENV_REFERENCE.exec(value);
      if (reference) {
        const sourceName = reference[1];
        if (sourceName !== targetName) {
          throw new Error(
            `Codex MCP env "${targetName}" must reference the same variable name; got ${value}`,
          );
        }
        envVars.push(sourceName);
        environmentNames.add(sourceName);
      } else {
        literalEnv[targetName] = value;
      }
    }

    const fields = [
      `command=${JSON.stringify(server.command)}`,
      `args=${JSON.stringify(server.args ?? [])}`,
      `cwd=${JSON.stringify(projectDir)}`,
      `env_vars=${JSON.stringify(envVars)}`,
      `env=${tomlStringMap(literalEnv)}`,
      "required=true",
      "enabled=true",
      "startup_timeout_sec=30",
      "tool_timeout_sec=300",
    ];
    configArgs.push(
      "-c",
      `mcp_servers.${name}={${fields.join(",")}}`,
    );
  }

  return {
    configArgs,
    environmentNames,
    serverNames: entries.map(([name]) => name),
  };
}

function tomlStringMap(values: Record<string, string>): string {
  return `{${Object.entries(values)
    .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join(",")}}`;
}
