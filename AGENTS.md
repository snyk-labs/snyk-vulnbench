# Coding Agent Security Benchmark

## Project Purpose

Benchmarking framework that runs AI coding agents (primarily Claude Code via the TypeScript Agent SDK) against standardized security tasks, collecting metrics to compare:

- Different models (claude-opus-4-6 vs claude-sonnet-4-6 vs claude-haiku-4-5)
- Different MCP configurations (with/without security tools like Snyk, semgrep, etc.)
- Different system prompts and agent configs

## Primary Eval Categories

1. **find-vulns**: Given a codebase with known vulnerabilities, how many can the agent correctly identify?
2. **fix-vulns**: Given a codebase with known vulnerabilities, how many can the agent correctly fix?

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

results/            # Benchmark output (JSONL files)
```

## Adding a New Eval Task (Open/Closed)

No source code changes required. Just:

1. Add a fixture directory `fixtures/<name>/` with a `project/` subdirectory containing the source code and a `findings.json` ground-truth file
2. Drop a JSON file in `evals/tasks/<id>.json` with `id`, `name`, `category`, `fixture` fields
3. Run — the loader picks it up automatically

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

### find-vulns
- Agent is asked to output findings as a JSON array with `type`, `file`, `line`, `severity`, `description`
- Parse the JSON from the agent's final output (look for `FINDINGS_JSON:` marker)
- Score = recall (found / total known) with precision penalty for false positives

### fix-vulns
- Agent runs on a temp copy of the fixture directory (to avoid permanent changes)
- After the agent run, use Claude API directly to judge the fixes
- Score = fraction of known vulns that were remediated

### Aggregation
When multiple fixtures run, per-fixture scores are **macro-averaged** (unweighted mean) into a single headline number per config. When `--repetitions N` is used, repeated runs of the same (task, config) pair are averaged before the macro-average. See `docs/benchmark.md` → [Aggregation and Headline Scores](docs/benchmark.md#aggregation-and-headline-scores).

## Authentication

The Agent SDK works by spawning the `claude` CLI binary as a subprocess — it does not call the Anthropic API directly. Authentication therefore follows whatever the Claude Code CLI has configured, which can be either:

- **`ANTHROPIC_API_KEY`** environment variable (inherited by the subprocess), or
- **OAuth login** stored by the CLI (`claude auth login`)

Run `claude auth status` to see which is active. Either works; no special setup is needed beyond having the CLI authenticated.

## Running Benchmarks

```bash
pnpm run benchmark                      # all tasks, default configs
pnpm run benchmark:find                 # only find-vulns tasks
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
- Each fixture contains a `findings.json` ground-truth file and a `project/` subdirectory with source code — the agent's `cwd` is set to `project/` so it cannot read the answer key
- Run configs define model + MCP servers — comparison across configs is the core benchmark value
- The `fix-vulns` eval works on temp copies; original fixtures are never modified
- **The agent runner (`src/runner.ts`) must always sandbox the agent to its fixture `cwd`.** `sandbox.filesystem.allowWrite: [cwd]` is a hard whitelist — the agent cannot write outside `project/`. `sandbox.filesystem.denyRead: [dirname(cwd)]` blocks reading the fixture root (which contains `findings.json`). Do not remove or loosen these restrictions: without them the agent can read the answer key and invalidate every score.

## Benchmark Documentation and Guidelines

- **[`docs/benchmark-management.md`](docs/benchmark-management.md)** — How to add eval tasks and fixtures without code changes: directory-scanning loader behavior, step-by-step fixture + ground-truth + task JSON workflow, task and ground-truth schema references, extending vulnerability types, run-config updates (models, MCP servers and permissions, SAST commands, Snyk ruleId mappings), worked example, troubleshooting.
- **[`docs/benchmark.md`](docs/benchmark.md)** — Conceptual and reference guide: end-to-end pipeline, components (fixtures, tasks, run configs, runner, scorer, reporter, results), scoring deep-dive (command tools, Snyk Code and `mapRuleId`), metrics and token accounting, sample CLI/JSONL output, pointer to extending tasks via the management guide.

## TODO

- [ ] **Explore replacing the Agent SDK with a direct Anthropic API agentic loop** — The current `src/runner.ts` uses `@anthropic-ai/claude-agent-sdk` which works by spawning the `claude` CLI binary as a subprocess. This creates a hard dependency on Claude Code CLI being installed and authenticated. An alternative is to build the agentic loop directly against `@anthropic-ai/sdk` (already a dependency): call `messages.create()` in a loop, manually execute tool calls (Read, Glob, Grep, Bash, Write, Edit) on the local filesystem, and feed results back as `tool_result` blocks — no CLI required. Key things to figure out: (1) whether the built-in Claude Code tools (Read, Glob, Grep, etc.) are available as server-side tools in the raw API or need to be reimplemented as local functions, (2) how to replicate the per-tool timing hooks currently done via `PreToolUse`/`PostToolUse`, (3) whether MCP server support is available without the CLI. See `src/runner.ts` for current implementation and `src/types.ts` for the `BenchmarkMetrics` shape that any new runner must produce.
