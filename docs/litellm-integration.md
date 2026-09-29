# LiteLLM Integration

This document is the operational and implementation reference for routing
VulnBench model-backed runners through the shared LiteLLM gateway. It covers
Claude Code, Codex Security, and both DeepSec agent backends.

## Canonical environment contract

Canonical V2 configs set `"gateway": "litellm"` and read these values from the
ignored repository-root `.env`:

```dotenv
ANTHROPIC_BASE_URL=https://proxy.example
ANTHROPIC_AUTH_TOKEN=<gateway-or-virtual-token>
ENABLE_TOOL_SEARCH=true
```

`ANTHROPIC_BASE_URL` must be an HTTPS origin:

- include the scheme and host;
- do not append `/v1`, `/anthropic`, or another provider path;
- do not include credentials, query parameters, or a fragment;
- a trailing slash is accepted and removed during normalization.

`ANTHROPIC_AUTH_TOKEN` is the single model-gateway credential. Canonical
profiles do not require `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or
`CODEX_API_KEY` in `.env`.

`ENABLE_TOOL_SEARCH=true` is forwarded to Claude-shaped clients. Keep it set
for Claude Code security-review runs with MCP tools; without it, Claude Code
may inline all MCP schemas when connected to a non-Anthropic host.

Snyk credentials are independent:

```dotenv
SNYK_TOKEN=<token>
SNYK_CFG_ORG=<organization>
```

They are resolved only into the selected Snyk MCP server or Snyk command and
are not part of LiteLLM authentication.

## Endpoint derivation

`src/runners/litellm.ts` validates and normalizes the environment into:

| Client protocol | Base configured by the harness | Request endpoint |
|---|---|---|
| Anthropic Messages | `<origin>` | `<origin>/v1/messages` |
| OpenAI Responses | `<origin>/v1` | `<origin>/v1/responses` |

The proxy must implement both protocols. A working Claude route does not prove
that `/v1/responses` is enabled, and a working Codex route does not prove that
Anthropic streaming/tool use is compatible.

## Environment flow

1. `src/benchmark-env.ts` starts an isolated worker and overlays root `.env`
   values over inherited variables.
2. Each runner creates a reduced child environment rather than forwarding the
   merged worker environment.
3. `src/runners/litellm.ts` removes direct model credentials and stored Claude
   OAuth fallbacks.
4. The runner adds only its protocol-specific URL/token variables and required
   runtime, proxy, locale, and CA variables.
5. Tokens are never written into generated config files, argv, JSONL results,
   traces, or normal error messages.

The stripped fallback names include:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `CODEX_API_KEY`
- `CLAUDE_CODE_OAUTH_TOKEN`
- `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`

This matters for validation: a smoke test must not silently succeed through a
stored OAuth session or a direct provider key.

## Claude Code

### Configuration

Canonical Claude V2 entries in `evals/run-configs.json` use:

```json
{
  "model": "claude-opus-5",
  "effort": "xhigh",
  "gateway": "litellm",
  "promptTemplateId": "security-review"
}
```

`src/runner.ts` resolves MCP environment references from the merged worker
environment first, then calls `createClaudeLiteLlmEnvironment`. The environment
passed to the Agent SDK contains:

- `ANTHROPIC_BASE_URL=<origin>`
- `ANTHROPIC_AUTH_TOKEN=<token>`
- `ENABLE_TOOL_SEARCH` when configured
- an isolated `CLAUDE_CONFIG_DIR`
- required runtime/proxy/CA variables

It does not contain direct API keys or Claude OAuth fallback variables.

The Agent SDK spawns its bundled Claude Code runtime with this exact
environment. Model, effort, `/security-review`, JSON Schema output,
filesystem sandboxing, slash-command checks, and tool telemetry work as before.

### Snyk MCP composition

`opus-5-medium-security-review-with-snyk-mcp` combines:

- `promptTemplateId: "security-review"`
- `requiredToolPolicyId: "snyk-code-once"`
- the Snyk MCP server

The tool policy adds the Snyk instruction as arguments to the built-in command.
After the run, `assertRequiredToolPolicy` requires exactly one
`mcp__Snyk__snyk_code_scan` call. Zero or multiple calls make the run an
explicit error rather than silently changing the experiment.

### Relevant code and tests

- `src/runner.ts`
- `src/runners/litellm.ts`
- `src/prompt-templates.ts`
- `tests/litellm.test.ts`
- `tests/prompt-templates.test.ts`
- `tests/runner-metrics.test.ts`

## Codex Security

### Why it uses the Responses protocol

Codex Security launches Codex workers. Codex requires an OpenAI
Responses-compatible provider; Chat Completions alone are insufficient.

For LiteLLM configs, `buildCodexSecurityScanArgs` passes token-free Codex
overrides:

```toml
model_provider = "litellm"

[model_providers.litellm]
name = "LiteLLM"
base_url = "<origin>/v1"
env_key = "ANTHROPIC_AUTH_TOKEN"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
```

`supports_websockets=false` is required for this proxy. Without it, Codex may
attempt `wss://api.openai.com/v1/responses` or another websocket route instead
of the configured HTTP Responses endpoint.

### Authentication-gate compatibility

Codex Security 0.1.24 has an outer API-key gate that expects a native OpenAI
key variable even when nested Codex uses a custom provider. The isolated child
therefore receives:

- `ANTHROPIC_AUTH_TOKEN=<proxy token>` for the actual LiteLLM provider; and
- `OPENAI_API_KEY=<same proxy token>` only as a process-local compatibility
  alias for the outer gate.

The alias is derived after `.env` loading. Users must not add it to `.env`, and
the nested model provider still uses `ANTHROPIC_AUTH_TOKEN`. It cannot fall back
to public OpenAI because `model_provider` is explicitly `litellm`.

### Scanner execution

The existing guarantees remain:

- pinned `@openai/codex-security` and Codex versions;
- model-free dry run before paid work;
- outer Landlock containment;
- isolated `CODEX_HOME` and `CODEX_SECURITY_STATE_DIR`;
- ignored dependency/build pruning from the disposable fixture copy;
- standard, report-only, full-repository mode;
- current-scan sealed findings and coverage only.

### Relevant code and tests

- `src/runners/codex-security-cli.ts`
- `src/runners/litellm.ts`
- `tests/codex-security-runner.test.ts`
- `tests/codex-security-parser.test.ts`

## DeepSec

DeepSec has two agent backends but one shared proxy token. The generated
`deepsec.config.mjs` chooses the protocol by `config.agent`.

### Claude backend

```json
{
  "mode": "direct",
  "provider": "anthropic",
  "apiKeyEnv": "ANTHROPIC_AUTH_TOKEN",
  "baseUrl": "<origin>"
}
```

The child also receives `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and
`ENABLE_TOOL_SEARCH` when set. Direct Anthropic keys and OAuth fallback are
removed.

### Codex backend

```json
{
  "mode": "direct",
  "provider": "openai",
  "apiKeyEnv": "ANTHROPIC_AUTH_TOKEN",
  "baseUrl": "<origin>/v1"
}
```

DeepSec uses the value named by `apiKeyEnv` for its direct OpenAI-compatible
route, so no OpenAI-named variable is needed. The child receives the shared
token but no direct provider keys.

DeepSec output and scoring are unchanged: exported locations do not include
source/sink roles, so V2 uses localized vulnerability recall.

### Relevant code and tests

- `src/runners/deepsec-cli.ts`
- `src/runners/litellm.ts`
- `tests/deepsec-runner.test.ts`

## Preflight behavior

`src/preflight.ts` detects any selected config with `gateway: "litellm"` and
performs one shared gateway check:

- both required variables exist;
- URL validation succeeds;
- only the normalized origin is printed.

Runner-specific checks still verify required binaries, package/plugin versions,
and Python. Direct API-key or stored-login checks are skipped for LiteLLM
profiles.

Do not use `--skip-preflight` to work around an invalid gateway pair.

## Secret-safe smoke tests

Run individual probes:

```bash
pnpm run smoke:litellm -- --target claude
pnpm run smoke:litellm -- --target codex-security
pnpm run smoke:litellm -- --target deepsec-claude
pnpm run smoke:litellm -- --target deepsec-codex
```

Or run all targets sequentially:

```bash
pnpm run smoke:litellm
```

Pass `--model` and `--effort` to verify an exact run-config pair without
starting a benchmark, for example:

```bash
pnpm run smoke:litellm -- \
  --target codex-security \
  --model gpt-5.6-terra \
  --effort xhigh
```

The probes are not benchmark runs:

- Claude performs a one-turn, tool-free marker response.
- Codex performs a one-turn marker response through the custom provider, then
  Codex Security runs only its model-free scanner dry run.
- DeepSec Claude and Codex each process one harmless disposable file with
  minimal/low effort and bounded turns/concurrency.

All temporary projects, homes, state, and output are deleted. The script prints
only target status and normalized proxy origin. It does not print model output,
environment contents, request headers, or tokens.

Do not enable `--trace-agent` for credential smoke tests.

## Validated behavior

On 2026-09-01, all four probes completed successfully against the configured
internal gateway:

- Claude Agent SDK / Anthropic Messages;
- Codex / OpenAI Responses plus Codex Security dry run;
- DeepSec Claude / Anthropic Messages;
- DeepSec Codex / OpenAI Responses.

The complete security-harness V2 matrix was also checked with exact model and
effort values: Codex Security accepted GPT-5.6 Luna, Terra, and Sol at `xhigh`;
DeepSec accepted Claude Opus 5 and GPT-5.6 Sol at `xhigh`.

Two compatibility findings are intentionally encoded in the implementation:

- GPT-5.6 Luna rejects `minimal` reasoning effort; Codex smoke uses `low`.
- Codex Responses websocket support is disabled for this proxy.

## Troubleshooting

### LiteLLM variables are incomplete

Preflight fails if only the URL or token is present. Configure both. An empty
string is treated as missing.

### Base URL validation fails

Use the gateway origin only. Remove `/v1`, `/anthropic`, query parameters,
fragments, and embedded credentials.

### Claude reports stored-login or direct-key behavior

Canonical proxy environments delete direct API keys and OAuth variables. Verify
the selected run config has `"gateway": "litellm"` and use the Claude smoke
target. Do not infer benchmark behavior from a separately launched shell whose
environment differs.

### Codex calls `api.openai.com` or attempts websocket transport

The custom provider was not applied. Verify `model_provider="litellm"`, the
provider block, and `supports_websockets=false`. Codex CLI options such as
`--ignore-user-config` require provider settings to be passed explicitly with
`-c`; a temporary `config.toml` alone will be ignored.

### Codex reports unsupported `minimal` effort

Use `low` for GPT-5.6 Luna. The canonical benchmark profiles remain `xhigh`.

### Codex Security `validate` rejects JSON/custom-provider operation

The `validate` surface does not support noninteractive JSON and exposes only
restricted Codex overrides. Use the smoke script's actual generic Codex marker
call plus Codex Security dry run. Full benchmark execution uses `scan`, whose
`--codex` overrides support the custom provider.

### DeepSec direct-mode probe exits 1

DeepSec direct mode exits 1 when it produces a finding. The smoke script treats
0 and 1 as completed agent execution and rejects other exit codes.

### Anthropic works but Codex fails

Confirm the proxy implements `/v1/responses`, not only `/v1/messages` or
`/v1/chat/completions`. A Claude success does not validate the Responses API.

## Change checklist

When changing proxy, token naming, model aliases, or runner versions:

1. Update and test `src/runners/litellm.ts`.
2. Confirm all canonical configs still declare `"gateway": "litellm"`.
3. Verify Claude environment stripping and isolated config state.
4. Verify Codex provider argv contains no token and disables websockets.
5. Verify both DeepSec generated provider configs contain URLs but no token.
6. Run the four individual smoke targets.
7. Run `pnpm test` and `pnpm exec tsc --noEmit`.
8. Dry-run the revised V2 matrix with
   `--config-group vulnbench-v2-deepsec-150`, then each gateway-backed phase:
   `--phase claude-code`, `--phase codex-security`, and `--phase deepsec`.
9. For a prepared execution, run only the smoke target(s) matching the next
   phase before `--resume <id> --phase <phase-id>`. The `snyk-code` phase does
   not require LiteLLM.
10. Never commit `.env`, raw traces, temporary scan state, or proxy tokens.
