# Coding Agent Security Benchmark

## Project Purpose

Benchmarking framework that runs AI coding agents (primarily Claude Code via the TypeScript Agent SDK) against standardized security tasks, collecting metrics to compare:

- Different models (claude-opus-4-6 vs claude-sonnet-4-6 vs claude-haiku-4-5)
- Different MCP configurations (with/without security tools like Snyk, semgrep, etc.)
- Different system prompts and agent configs

## Primary Eval Categories

1. **VulnBench 1.0 find categories** (`find-vulns`, `llm-find-vulns`, `app-find-vulns`): Given a codebase with known vulnerabilities in `findings.json`, how many can the agent correctly identify using the original type-only scorer?
2. **VulnBench 2.0 attacker-reachable findings** (`attacker-reachable-find-vulns`): Compare reported source-to-sink flows against human-curated `findings-attacker-reachable.json` ground truth.
3. **fix-vulns**: Given a codebase with known vulnerabilities, how many can the agent correctly fix?

## Tech Stack

- **Runtime**: TypeScript + Node 24, pnpm
- **Agent SDK**: `@anthropic-ai/claude-agent-sdk` (TypeScript) — wraps Claude Code CLI
- **Anthropic SDK**: `@anthropic-ai/sdk` — for token counting and direct API calls (scoring, judging)
- **Claude Code CLI**: available at `/home/node/.local/bin/claude`

## Architecture

```
src/
  types.ts          # Core interfaces + EVAL_CATEGORIES constant
  runner.ts         # Agent SDK wrapper — runs a task and collects metrics
  scorer.ts         # Scoring logic per eval category
  reporter.ts       # Output to console table + JSONL
  evals/
    loader.ts       # Scans evals/tasks/*.json + evals/run-configs.json at startup
  index.ts          # CLI entry point

evals/
  tasks/            # One JSON file per eval task — add a file to add a new task
    js-find-vulns.json
    js-fix-vulns.json
    python-find-vulns.json
  run-configs.json  # Array of RunConfig objects — edit to add/change model configs

fixtures/
  js-project-tigerteam/       # Each fixture is a self-contained directory
    project/                  # Agent's working directory (source code)
      app.js
    findings.json             # Ground-truth metadata (outside agent cwd)
  python-project-cobalt/
    project/
      app.py
    findings.json
  app-project-keystonebank/
    project/                  # Shared application source
    findings.json             # VulnBench 1.0 ground truth
    findings-attacker-reachable.json  # VulnBench 2.0 ground truth

results/            # Benchmark output (JSONL files)
```

## Adding a New Eval Task (Open/Closed)

No source code changes required. Choose the ground-truth generation, then:

1. Add a fixture directory `fixtures/<name>/` with a `project/` subdirectory containing the source code.
2. For VulnBench 1.0, add `findings.json`. For VulnBench 2.0, add `findings-attacker-reachable.json` with `filesRelated` source/sink endpoint annotations.
3. Drop a JSON file in `evals/tasks/<id>.json` with `id`, `name`, `category`, and `fixture`. V2 tasks also use `"category": "attacker-reachable-find-vulns"` and `"groundTruth": "attacker-reachable"`.
4. Run — the loader picks it up automatically.

See [`docs/benchmark-management.md`](docs/benchmark-management.md) for step-by-step task and fixture setup. For how the benchmark pipeline, scoring (including Snyk/SAST and vuln-type matching), and metrics work, see [`docs/benchmark.md`](docs/benchmark.md).

## How the Agent SDK Is Used

The TypeScript Agent SDK runs Claude Code as a subprocess with a specified `cwd`, tools, and model. We wrap `query()` to collect metrics:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Hooks capture per-tool timing via PreToolUse/PostToolUse
// AssistantMessage.usage gives per-turn token counts (accumulated for totals)
// Wall time measured from query start to ResultMessage
```

## Key Metric Collection Strategy

From the chat-summary.txt context:
- **Session-level tokens**: accumulated from `AssistantMessage.usage` fields (input + output per turn)
- **Per-tool timing**: PreToolUse/PostToolUse hooks with a Map tracking start times
- **Wall time**: `Date.now()` before/after the full `query()` loop
- **Token counting per tool call**: optional — use `anthropic.messages.countTokens()` on tool input/output content (adds latency, free but has RPM limits)

## Scoring Approach

### VulnBench 1.0 find-vulns
- Agent is asked to output findings as a JSON array with `type`, `file`, `line`, `severity`, `description`
- Parse the JSON from the agent's final output (look for `FINDINGS_JSON:` marker)
- Match greedily by normalized vulnerability type; file and line are retained but do not affect V1 matching
- Score = recall (found / total known) with precision penalty for false positives

### VulnBench 2.0 attacker-reachable-find-vulns
- Agent/SAST output uses `filesRelated` source-to-sink locations; endpoint objects can be labeled `source` or `sink`
- Ground truth comes from `findings-attacker-reachable.json`
- Type matching uses canonical `type` plus conservative `typeAliases`
- Files match by normalized relative path or exact basename with an inclusive ±5-line tolerance
- One-location flows require that endpoint; two-location flows accept both locations or either endpoint; longer flows require distinct reported matches for both source and sink
- Snyk Code automatically uses the rich SARIF code-flow parser for V2 tasks while retaining the V1 parser for existing tasks
- Every V2 JSONL run stores all candidate type/location comparisons and structured finding/vulnerability outcomes under `details.matchDiagnostics`
- The headline score remains F1 from vulnerability-level precision and recall

### fix-vulns
- Agent runs on a temp copy of the fixture directory (to avoid permanent changes)
- After the agent run, use Claude API directly to judge the fixes
- Score = fraction of known vulns that were remediated

### Aggregation
When multiple fixtures run, per-fixture scores are **macro-averaged** (unweighted mean) into a single headline number per config. When `--repetitions N` is used, repeated runs of the same (task, config) pair are averaged before the macro-average, with score and runtime standard deviation reported for aggregate rows. Task aggregates retain scalar `groundTruth`; config aggregates retain the overall headline plus `groundTruths` and a full `byGroundTruth` V1/V2 breakdown. See `docs/benchmark.md` → [Aggregation and Headline Scores](docs/benchmark.md#aggregation-and-headline-scores).

## Authentication

The Agent SDK works by spawning the `claude` CLI binary as a subprocess — it does not call the Anthropic API directly. Authentication therefore follows whatever the Claude Code CLI has configured, which can be either:

- **`ANTHROPIC_API_KEY`** environment variable (inherited by the subprocess), or
- **OAuth login** stored by the CLI (`claude auth login`)

Run `claude auth status` to see which is active. Either works; no special setup is needed beyond having the CLI authenticated.

## Running Benchmarks

```bash
pnpm run benchmark                      # all tasks, default configs
pnpm run benchmark:find                 # only find-vulns tasks
pnpm run benchmark:v2                   # all attacker-reachable V2 tasks
pnpm run benchmark:v2:snyk              # V2 tasks with Snyk Code only
pnpm run benchmark:fix                  # only fix-vulns tasks
pnpm benchmark -- --config opus-only    # specific run config
pnpm benchmark -- --task js-project-tigerteam-find-vulns  # specific task
pnpm benchmark -- --repetitions 3       # run each (task, config) pair 3 times
```

Results are saved to `results/benchmark-<timestamp>.jsonl`.

Generated HTML benchmark reports are saved under `public/<report-id>/`. To preview one locally, serve that directory with:

```bash
pnpm report:serve public/2026-05-14-wpq2k
```

This uses the `serve` npm package and defaults to `0.0.0.0:3000`; pass standard `serve` flags after the directory if you need a different port or host.

## Important Notes

- Fixtures are **intentionally vulnerable** code — they exist for security research/testing
- Each fixture contains a `project/` source directory and one or both supported answer keys: V1 `findings.json` and V2 `findings-attacker-reachable.json`. Task metadata selects which one to load.
- Run configs define model + MCP servers — comparison across configs is the core benchmark value
- The `fix-vulns` eval works on temp copies; original fixtures are never modified
- **The agent runner (`src/runner.ts`) must always sandbox the agent to its fixture `cwd`.** `sandbox.filesystem.allowWrite: [cwd]` is a hard whitelist — the agent cannot write outside `project/`. `sandbox.filesystem.denyRead: [dirname(cwd)]` blocks reading the fixture root (which contains both forms of ground truth). Do not remove or loosen these restrictions: without them the agent can read the answer key and invalidate every score.

## Benchmark Documentation and Guidelines

- **[`docs/benchmark-management.md`](docs/benchmark-management.md)** — How to add V1 and V2 eval tasks and fixtures without code changes: both ground-truth schemas, source/sink annotations, directory-scanning loader behavior, task JSON, vulnerability types, run configs, SAST commands, Snyk mappings, and troubleshooting.
- **[`docs/benchmark.md`](docs/benchmark.md)** — Conceptual and reference guide: end-to-end pipeline, V1 type-only and V2 endpoint-aware scoring, Snyk's V1/rich SARIF parsers, aggregation, metrics, and result formats.

## TODO

- [ ] **Explore replacing the Agent SDK with a direct Anthropic API agentic loop** — The current `src/runner.ts` uses `@anthropic-ai/claude-agent-sdk` which works by spawning the `claude` CLI binary as a subprocess. This creates a hard dependency on Claude Code CLI being installed and authenticated. An alternative is to build the agentic loop directly against `@anthropic-ai/sdk` (already a dependency): call `messages.create()` in a loop, manually execute tool calls (Read, Glob, Grep, Bash, Write, Edit) on the local filesystem, and feed results back as `tool_result` blocks — no CLI required. Key things to figure out: (1) whether the built-in Claude Code tools (Read, Glob, Grep, etc.) are available as server-side tools in the raw API or need to be reimplemented as local functions, (2) how to replicate the per-tool timing hooks currently done via `PreToolUse`/`PostToolUse`, (3) whether MCP server support is available without the CLI. See `src/runner.ts` for current implementation and `src/types.ts` for the `BenchmarkMetrics` shape that any new runner must produce.
