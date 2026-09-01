import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBenchmarkEnvironment } from "../src/benchmark-env.js";
import { executeProcess } from "../src/process-executor.js";
import {
  buildCodexSecurityScanArgs,
  codexSecurityExecutable,
} from "../src/runners/codex-security-cli.js";
import { codexExecutable } from "../src/runners/codex-config.js";
import { CodexEventCollector } from "../src/runners/codex-cli.js";
import { prepareSecurityReviewGitWorkspace } from "../src/isolated-workspace.js";
import {
  buildDeepSecConfig,
  createDeepSecEnvironment,
  deepSecExecutable,
} from "../src/runners/deepsec-cli.js";
import {
  copyRuntimeEnvironment,
  createClaudeLiteLlmEnvironment,
  redactLiteLlmError,
  resolveLiteLlmConnection,
  stripDirectModelCredentials,
  type LiteLlmConnection,
} from "../src/runners/litellm.js";

const TARGETS = [
  "claude",
  "codex-security",
  "deepsec-claude",
  "deepsec-codex",
] as const;
type SmokeTarget = typeof TARGETS[number];

async function main(): Promise<void> {
  const source = createBenchmarkEnvironment();
  const connection = resolveLiteLlmConnection(source);
  const requested = readTarget(process.argv.slice(2));
  const targets = requested ? [requested] : [...TARGETS];

  for (const target of targets) {
    try {
      await runTarget(target, source, connection);
      console.log(`LiteLLM smoke ${target}: OK (${connection.origin})`);
    } catch (error) {
      console.error(
        `LiteLLM smoke ${target}: FAILED — ${redactLiteLlmError(error, connection)}`,
      );
      process.exitCode = 1;
      return;
    }
  }
}

function readTarget(args: string[]): SmokeTarget | undefined {
  const index = args.indexOf("--target");
  if (index < 0) return undefined;
  const target = args[index + 1];
  if (!TARGETS.includes(target as SmokeTarget)) {
    throw new Error(`Unknown target "${target}". Expected: ${TARGETS.join(", ")}`);
  }
  return target as SmokeTarget;
}

async function runTarget(
  target: SmokeTarget,
  source: NodeJS.ProcessEnv,
  connection: LiteLlmConnection,
): Promise<void> {
  if (target === "claude") return smokeClaude(source);
  if (target === "codex-security") {
    return smokeCodexSecurity(source, connection);
  }
  return smokeDeepSec(
    target === "deepsec-claude" ? "claude" : "codex",
    source,
    connection,
  );
}

async function smokeClaude(source: NodeJS.ProcessEnv): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-litellm-claude-"));
  let finalText = "";
  try {
    const environment = createClaudeLiteLlmEnvironment(
      source,
      join(root, "claude-config"),
    );
    for await (const message of query({
      prompt: "Do not use tools. Reply exactly: LITELLM_CLAUDE_OK",
      options: {
        cwd: root,
        env: environment,
        model: "claude-sonnet-5",
        effort: "low",
        tools: [],
        settingSources: [],
        maxTurns: 1,
        persistSession: false,
        systemPrompt: "Return only the exact marker requested by the user.",
      },
    })) {
      if (message.type === "assistant") {
        for (const block of (message as any).message?.content ?? []) {
          if (block.type === "text") finalText = block.text;
        }
      }
      if ("result" in message && typeof (message as any).result === "string") {
        finalText = (message as any).result;
      }
    }
    if (finalText.trim() !== "LITELLM_CLAUDE_OK") {
      throw new Error("Claude proxy probe returned an unexpected response");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function smokeCodexSecurity(
  source: NodeJS.ProcessEnv,
  connection: LiteLlmConnection,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "vulnbench-litellm-codex-security-"));
  const projectDir = join(root, "project");
  const codexHome = join(root, "codex-home");
  const stateDir = join(root, "security-state");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(projectDir, "hello.js"), 'export const hello = "world";\n');
  prepareSecurityReviewGitWorkspace(projectDir);

  try {
    const environment = stripDirectModelCredentials(copyRuntimeEnvironment(source));
    environment.ANTHROPIC_AUTH_TOKEN = connection.authToken;
    environment.OPENAI_API_KEY = connection.authToken;
    environment.CODEX_HOME = codexHome;
    environment.CODEX_SECURITY_STATE_DIR = stateDir;
    environment.CI = "1";
    environment.NO_COLOR = "1";
    const codexProbe = await executeProcess({
      program: codexExecutable(),
      args: [
        "exec",
        "--cd", projectDir,
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--sandbox", "read-only",
        "--json",
        "--model", "gpt-5.6-luna",
        "-c", 'model_reasoning_effort="low"',
        "-c", 'model_provider="litellm"',
        "-c", 'model_providers.litellm.name="LiteLLM"',
        "-c", `model_providers.litellm.base_url=${JSON.stringify(connection.openAiBaseUrl)}`,
        "-c", 'model_providers.litellm.env_key="ANTHROPIC_AUTH_TOKEN"',
        "-c", 'model_providers.litellm.wire_api="responses"',
        "-c", "model_providers.litellm.requires_openai_auth=false",
        "-c", "model_providers.litellm.supports_websockets=false",
        "-",
      ],
      cwd: projectDir,
      env: environment,
      stdin: "Do not use tools. Reply exactly: LITELLM_CODEX_OK",
      timeoutMs: 2 * 60_000,
      maxOutputBytes: 2 * 1024 * 1024,
    });
    const collector = new CodexEventCollector();
    collector.feed(codexProbe.stdout, Date.now());
    collector.finish(Date.now());
    if (
      codexProbe.exitCode !== 0
      || collector.finalMessage.trim() !== "LITELLM_CODEX_OK"
    ) {
      throw new Error(
        `Codex proxy probe exited ${codexProbe.exitCode}: ${collector.terminalError || codexProbe.stderr.slice(-1_000)}`,
      );
    }
    const dryRunArgs = buildCodexSecurityScanArgs(
      {
        type: "codex-security",
        id: "litellm-smoke",
        name: "LiteLLM smoke",
        model: "gpt-5.6-luna",
        effort: "low",
        gateway: "litellm",
      },
      projectDir,
      join(root, "scan-output"),
      source.PYTHON ?? "python3",
      connection,
    );
    const result = await executeProcess({
      program: codexSecurityExecutable(),
      args: [...dryRunArgs, "--dry-run"],
      cwd: projectDir,
      env: environment,
      stdin: undefined,
      timeoutMs: 5 * 60_000,
      maxOutputBytes: 2 * 1024 * 1024,
    });
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      throw new Error(
        `Codex Security proxy probe exited ${result.exitCode}: ${result.stderr.slice(-1_000)}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function smokeDeepSec(
  agent: "claude" | "codex",
  source: NodeJS.ProcessEnv,
  connection: LiteLlmConnection,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), `vulnbench-litellm-deepsec-${agent}-`));
  const projectDir = join(root, "project");
  const stateDir = join(root, "state");
  const dataDir = join(stateDir, "data");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(projectDir, "hello.js"), 'export const hello = "world";\n');
  const config = {
    type: "deepsec" as const,
    id: `smoke-${agent}`,
    name: `Smoke ${agent}`,
    agent,
    model: agent === "claude" ? "claude-opus-5" : "gpt-5.6-luna",
    thinkingLevel: "minimal" as const,
    gateway: "litellm" as const,
    maxTurns: 5,
    batchSize: 1,
    concurrency: 1,
  };
  writeFileSync(
    join(stateDir, "deepsec.config.mjs"),
    buildDeepSecConfig("smoke", projectDir, dataDir, config, connection),
    { mode: 0o600 },
  );
  writeFileSync(join(stateDir, "package.json"), '{"type":"module","private":true}\n');

  try {
    const environment = createDeepSecEnvironment(config, source);
    environment.DEEPSEC_DATA_ROOT = dataDir;
    const result = await executeProcess({
      program: deepSecExecutable(),
      args: [
        "process",
        "--project-id", "smoke",
        "--root", projectDir,
        "--files", "hello.js",
        "--agent", agent,
        "--model", config.model,
        "--thinking-level", "minimal",
        "--max-turns", "5",
        "--batch-size", "1",
        "--concurrency", "1",
      ],
      cwd: stateDir,
      env: environment,
      timeoutMs: 5 * 60_000,
      maxOutputBytes: 4 * 1024 * 1024,
    });
    // DeepSec direct mode exits 1 when it produces a finding.
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(
        `DeepSec ${agent} proxy probe exited ${result.exitCode}: ${result.stderr.slice(-1_000)}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`LiteLLM smoke failed: ${redactLiteLlmError(error)}`);
  process.exitCode = 1;
});
