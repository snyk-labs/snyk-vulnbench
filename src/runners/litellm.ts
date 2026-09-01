import { mkdirSync } from "node:fs";

export interface LiteLlmConnection {
  origin: string;
  anthropicBaseUrl: string;
  openAiBaseUrl: string;
  authToken: string;
}

const DIRECT_CREDENTIAL_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
] as const;

export function resolveLiteLlmConnection(
  source: NodeJS.ProcessEnv = process.env,
): LiteLlmConnection {
  const rawUrl = source.ANTHROPIC_BASE_URL?.trim();
  const authToken = source.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!rawUrl || !authToken) {
    throw new Error(
      "LiteLLM requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN together",
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("ANTHROPIC_BASE_URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("ANTHROPIC_BASE_URL must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "ANTHROPIC_BASE_URL cannot contain credentials, query parameters, or fragments",
    );
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      "ANTHROPIC_BASE_URL must be the LiteLLM origin without a protocol-specific path",
    );
  }

  const origin = url.origin;
  return {
    origin,
    anthropicBaseUrl: origin,
    openAiBaseUrl: `${origin}/v1`,
    authToken,
  };
}

export function copyRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
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
  ]) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("LC_") && value !== undefined) environment[name] = value;
  }
  return environment;
}

export function stripDirectModelCredentials(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const sanitized = { ...environment };
  for (const name of DIRECT_CREDENTIAL_NAMES) delete sanitized[name];
  return sanitized;
}

export function createClaudeLiteLlmEnvironment(
  source: NodeJS.ProcessEnv,
  configDir: string,
): NodeJS.ProcessEnv {
  const connection = resolveLiteLlmConnection(source);
  mkdirSync(configDir, { recursive: true });
  const environment = stripDirectModelCredentials(copyRuntimeEnvironment(source));
  environment.ANTHROPIC_BASE_URL = connection.anthropicBaseUrl;
  environment.ANTHROPIC_AUTH_TOKEN = connection.authToken;
  environment.CLAUDE_CONFIG_DIR = configDir;
  environment.CI = "1";
  if (source.ENABLE_TOOL_SEARCH !== undefined) {
    environment.ENABLE_TOOL_SEARCH = source.ENABLE_TOOL_SEARCH;
  }
  return environment;
}

export function redactLiteLlmError(
  error: unknown,
  connection?: LiteLlmConnection,
): string {
  let message = error instanceof Error ? error.message : String(error);
  if (connection?.authToken) {
    message = message.replaceAll(connection.authToken, "[REDACTED]");
  }
  return message.replace(
    /((?:Bearer|x-api-key:?))\s+[A-Za-z0-9._~+/=-]+/gi,
    "$1 [REDACTED]",
  );
}
