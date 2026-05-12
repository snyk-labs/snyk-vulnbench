# Benchmark System — How It Works

## Table of Contents

1. [The Core Idea in One Sentence](#the-core-idea-in-one-sentence)
2. [High-Level Overview](#high-level-overview)
   - [The Three Questions This Benchmark Answers](#the-three-questions-this-benchmark-answers)
   - [The Full Pipeline — Flowchart](#the-full-pipeline--flowchart)
   - [How Tasks and Configs Combine](#how-tasks-and-configs-combine)
   - [Eval Categories](#eval-categories)
3. [Detailed Component Reference](#detailed-component-reference)
   - [Fixtures — The Test Cases](#fixtures--the-test-cases)
   - [EvalTask — What to Do](#evaltask--what-to-do)
   - [RunConfig — Who Does It](#runconfig--who-does-it)
   - [Runner — The Agent Session](#runner--the-agent-session)
   - [Metrics — What Was Measured](#metrics--what-was-measured)
   - [Scorer — How Good Was It](#scorer--how-good-was-it)
   - [Reporter — Presenting Results](#reporter--presenting-results)
   - [EvalResult — The Final Record](#evalresult--the-final-record)
4. [Worked Example: A Single Run](#worked-example-a-single-run)
5. [Scoring Deep-Dive](#scoring-deep-dive)
   - [Command configs and Snyk Code (SAST)](#command-configs-and-snyk-code-sast)
   - [When to update `mapRuleId` (Snyk)](#when-to-update-mapruleid-snyk)
6. [Aggregation and Headline Scores](#aggregation-and-headline-scores)
   - [The Three-Level Pipeline](#the-three-level-pipeline)
   - [Macro-Averaging](#macro-averaging)
   - [Repetitions](#repetitions)
   - [What Metrics Are Aggregated](#what-metrics-are-aggregated)
   - [Design Decisions](#design-decisions)
7. [Metrics Deep-Dive](#metrics-deep-dive)
   - [Metrics Quick Reference](#metrics-quick-reference)
   - [Session-Level Token Accounting](#session-level-token-accounting)
   - [SDK Message Structure and Deduplication](#sdk-message-structure-and-deduplication)
   - [Cache Tokens](#cache-tokens)
   - [Per-Tool Token Estimates](#per-tool-token-estimates)
   - [Wall Time and Turns](#wall-time-and-turns)
   - [Sample Output — find-vulns Run](#sample-output--find-vulns-run)
   - [Sample Output — fix-vulns Run](#sample-output--fix-vulns-run)
   - [Sample Output — Summary Table](#sample-output--summary-table)
   - [Sample Output — JSONL Record](#sample-output--jsonl-record)
8. [FAQ — Understanding Token and Cost Reports](#faq--understanding-token-and-cost-reports)
9. [Adding Your Own Tasks and Configs](#adding-your-own-tasks-and-configs)

---

## The Core Idea in One Sentence

We give an AI coding agent a piece of vulnerable code, ask it to find or fix the vulnerabilities, and then measure both **how well it did** (score) and **how expensive it was** (tokens, time, tool calls).

---

## High-Level Overview

### The Three Questions This Benchmark Answers

| Question | Metric |
|---|---|
| **Quality**: Did the agent find/fix the right vulnerabilities? | Score (0–100%) |
| **Cost**: How many tokens did it spend? | Input + output tokens |
| **Efficiency**: How did it spend its time? | Wall time, tool call breakdown |

By running the same tasks against different model configurations, you can compare them across all three dimensions at once.

---

### The Full Pipeline — Flowchart

This is the end-to-end flow for a single run. A "run" is one combination of one task and one configuration.

```mermaid
flowchart TD
    A(["**START** pnpm run benchmark"]) --> B

    subgraph SETUP["① Setup"]
        B["Parse CLI args\n--category, --task, --config"] --> C
        C["Select matching\nEvalTasks"] --> D
        D["Select matching\nRunConfigs"]
    end

    D --> E

    subgraph LOOP["② For each Task × Config pair..."]
        E[/"For every combination\nof task + config"/] --> F
        F{task.type?}
        F -->|fix-vulns| G["Copy fixture to\ntemp directory\n(protect original)"]
        F -->|find-vulns| H["Use fixture\ndirectory directly\n(read-only)"]
        G --> I
        H --> I
    end

    subgraph AGENT["③ Run Agent Session"]
        I["runTask(task, config, cwd)"] --> J
        J["Launch Claude Code via\nAgent SDK query()"] --> K

        subgraph HOOKS["Hooks fire on every tool call"]
            K --> L["PreToolUse hook\nrecord start time"]
            L --> M["Agent uses tools:\nRead, Grep, Glob,\nBash, Write, Edit"]
            M --> N["PostToolUse hook\nrecord duration"]
            N --> O{More tools\nneeded?}
            O -->|yes| L
            O -->|no| P
        end

        P["ResultMessage received\n(agent finished)"] --> Q
        Q["Collect from stream:\n• session-total usage\n  from ResultMessage\n• tool call records\n• final text output"]
    end

    subgraph SCORE["④ Score the Output"]
        Q --> R{task.type?}
        R -->|find-vulns| S["Parse FINDINGS_JSON\nfrom agent or SAST output"]
        S --> T["Compare found vulns\nagainst vulns.json\nground truth"]
        T --> U["Calculate\nprecision + recall\n→ F1 score"]
        R -->|fix-vulns| V["Read modified\nfiles from temp dir"]
        V --> W["Ask Claude Haiku\nto judge each fix"]
        W --> X["Count fixed/total\n→ ratio score"]
    end

    subgraph RECORD["⑤ Record & Report"]
        U --> Y["Build EvalResult\n(score + metrics + details)"]
        X --> Y
        Y --> Z["Print to console\n(table with score,\ntokens, tool stats)"]
        Z --> AA["Append to JSONL file\nin results/"]
    end

    AA --> AB{More runs?}
    AB -->|yes| E
    AB -->|no| AC["Print summary table\nfor all runs"]
    AC --> AD([END])

    style SETUP fill:#e8f4f8,stroke:#2980b9
    style LOOP fill:#fef9e7,stroke:#f39c12
    style AGENT fill:#e8f8e8,stroke:#27ae60
    style SCORE fill:#fce4ec,stroke:#c0392b
    style RECORD fill:#f3e5f5,stroke:#8e44ad
    style HOOKS fill:#e0f7e0,stroke:#27ae60,stroke-dasharray: 5 5
```

---

### How Tasks and Configs Combine

The benchmark runs every task against every config. This is the **matrix of runs**:

```mermaid
quadrantChart
    title Run Matrix: Task x Config
    x-axis Find Vulns Tasks
    y-axis Fix Vulns Tasks
    quadrant-1 Fix tasks run here
    quadrant-2 Fix tasks run here
    quadrant-3 Find tasks run here
    quadrant-4 Find tasks run here
```

More concretely, with the default setup:

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    RUN CONFIGS                           │
                    │   opus-4-6               │   sonnet-4-6                 │
  ┌─────────────────┼──────────────────────────┼──────────────────────────────┤
  │  js-find-vulns  │  Run 1: Opus finds JS     │  Run 2: Sonnet finds JS      │
E │                 │  vulns in Express app     │  vulns in Express app        │
V ├─────────────────┼──────────────────────────┼──────────────────────────────┤
A │  js-fix-vulns   │  Run 3: Opus fixes JS     │  Run 4: Sonnet fixes JS      │
L │                 │  vulns in Express app     │  vulns in Express app        │
  ├─────────────────┼──────────────────────────┼──────────────────────────────┤
T │ python-find-    │  Run 5: Opus finds Python │  Run 6: Sonnet finds Python  │
A │ vulns           │  vulns in Flask app       │  vulns in Flask app          │
S └─────────────────┴──────────────────────────┴──────────────────────────────┘
K
S       3 tasks   ×   2 configs   =   6 total runs
```

Each cell in this matrix is one independent `EvalResult`. After all runs complete, you can compare rows (same task, different configs) to understand which model/config performs better.

---

### Eval Categories

An **Eval Category** (`EvalCategory`) is a first-class data structure that determines the agent's goal and the scoring strategy. Each **Eval Task** carries a `category` field pointing to one of the entries in the `EVAL_CATEGORIES` registry — so the category both groups tasks and carries its own metadata.

The `--category` CLI flag filters the task list by category id (e.g. `--category find-vulns` runs only tasks in that category). Adding a new category means adding one entry to `EVAL_CATEGORIES` in `src/types.ts` — `EvalCategoryId` expands automatically.

#### Category Quick Reference

| Category ID | Name | Scoring | Description |
|---|---|---|---|
| `find-vulns` | Find Vulnerabilities | F1 (precision + recall) | General vulnerability finding in code snippets/small apps |
| `llm-find-vulns` | Find LLM Integration Vulnerabilities | F1 (precision + recall) | Vulnerability finding in LLM integration code (prompt injection, unsafe output handling, insecure API integrations) |
| `app-find-vulns` | Find App Vulnerabilities | F1 (precision + recall) | Vulnerability finding in full application codebases (multi-file, larger scope) |
| `fix-vulns` | Fix Vulnerabilities | LLM judge (fraction fixed) | Agent remediates vulnerabilities by editing source files |

#### Category → Task Mapping

```
EVAL_CATEGORIES.FIND_VULNS             EVAL_CATEGORIES.LLM_FIND_VULNS
  { id: "find-vulns" }                   { id: "llm-find-vulns" }
         │                                        │
         ├── js-project-tigerteam-find-vulns       ├── llm-project-stardust-find-vulns
         ├── js-project-shadowfox-find-vulns      └── llm-project-blackmirror-find-vulns
         ├── js-project-ironclad-find-vulns
         ├── js-project-nightowl-find-vulns  EVAL_CATEGORIES.APP_FIND_VULNS
         ├── js-project-purplehaze-find-vulns  { id: "app-find-vulns" }
         └── python-project-cobalt-find-vulns    │
                                                  └── app-project-keystonebank-find-vulns
EVAL_CATEGORIES.FIX_VULNS
  { id: "fix-vulns" }
         │
         ├── js-project-shadowfox-fix-vulns
         ├── js-project-ironclad-fix-vulns
         ├── js-project-nightowl-fix-vulns
         ├── js-project-purplehaze-fix-vulns
         ├── app-project-keystonebank-fix-vulns
         ├── llm-project-stardust-fix-vulns
         └── llm-project-blackmirror-fix-vulns
```

#### Scoring Pipelines

All three find-* categories (`find-vulns`, `llm-find-vulns`, `app-find-vulns`) share the same scoring pipeline — they differ only in prompt emphasis and task grouping. The `fix-vulns` category uses a separate judge-based pipeline.

```mermaid
flowchart LR
    subgraph findCategories["find-vulns / llm-find-vulns / app-find-vulns"]
        direction TB
        FV1["Agent reads\nvulnerable code"] --> FV2
        FV2["Agent lists\nvulnerabilities found"] --> FV3
        FV3["Score: F1 via\nprecision + recall"]
    end

    subgraph FX["fix-vulns"]
        direction TB
        FX1["Agent reads and\nedits the files"] --> FX2
        FX2["Files are modified\nin a temp copy"] --> FX3
        FX3["Score: Haiku judges\neach fix"]
    end

    findCategories -. "same fixture, different goal" .-> FX
```

#### What Each Category Does

**find-vulns** — The general-purpose vulnerability finding category. The agent reads code and reports what it finds. Used for JS snippet fixtures and other straightforward code audit tasks.

**llm-find-vulns** — Specialized for LLM integration code. The system prompt emphasizes LLM-specific risks (prompt injection, unsafe output handling, insecure API integrations). Used for fixtures that test LLM-aware security reasoning.

**app-find-vulns** — Targets full application codebases (multi-file, larger scope). The system prompt instructs the agent to scan all files across the project. Used for realistic application-level audit tasks.

**fix-vulns** — The agent not only identifies but also edits the source files to remediate vulnerabilities. We work on a copy of the fixture so the originals are never changed. Scored by an LLM judge (Claude Haiku) that evaluates whether each known vulnerability was successfully fixed.

---

## Detailed Component Reference

### Fixtures — The Test Cases

**Location:** `fixtures/`

A fixture is a self-contained directory containing vulnerable source code. It is the "exam question" — the thing we're testing the agent against.

```
fixtures/
  js-project-tigerteam.json   ← Ground truth: exactly which vulns exist and where
  js-project-tigerteam/
    app.js                    ← The code under test
  python-project-cobalt.json
  python-project-cobalt/
    app.py
```

The `<fixture-name>.json` file is the **answer key**. It describes every vulnerability that exists in the fixture, along with metadata used for scoring:

```json
{
  "vulnerabilities": [
    {
      "id": "js-sqli-1",          // unique ID used in scoring comparisons
      "type": "sql-injection",    // vulnerability category
      "severity": "critical",     // how dangerous it is
      "file": "app.js",           // which file it's in
      "line": 28,                 // which line
      "description": "User input directly concatenated into SQL query"
    }
  ]
}
```

The `id` field is critical — the scorer uses these IDs to track which vulnerabilities were found vs. missed, and which were fixed vs. still present.

**Why the answer key lives outside the fixture directory:** The agent's `cwd` is set to `fixtures/<name>/` — everything inside that directory is visible to the agent. Keeping the ground-truth JSON as a sibling (`fixtures/<name>.json`) means the agent cannot read the answer key and inadvertently "cheat". Without a fixed, known-good ground truth, you cannot objectively score the agent — and that ground truth must be hidden from the agent for the score to be meaningful.

---

### EvalTask — What to Do

**Location:** `evals/tasks/*.json` — one JSON file per task, loaded at startup by `src/evals/loader.ts`

An `EvalTask` is a complete description of one assignment to give an agent. Think of it as a single exam question.

```typescript
interface EvalTask {
  id: string;            // unique identifier, used in CLI filtering
  name: string;          // human-readable name for output
  category: EvalCategory; // points to EVAL_CATEGORIES.FIND_VULNS or .FIX_VULNS
  fixture: string;       // path to the fixture directory
  systemPrompt?: string; // instructions injected before the task starts
  prompt: string;        // the main instruction sent to the agent
  knownVulns: Vulnerability[]; // loaded automatically from the fixture's vulns.json
  maxTurns?: number;     // max agent conversation turns (prevents runaway)
}
```

Key design decisions baked into the task definition:

- **`systemPrompt`** tells the agent *how* to work. For find-vulns, it instructs the agent to output a structured `FINDINGS_JSON` block at the end — without this, we couldn't reliably parse the agent's findings.
- **`knownVulns`** is loaded automatically from `fixtures/<fixture>.json` by the loader — you never need to duplicate this data.
- **`maxTurns`** is a safety valve. An unconstrained agent could loop forever; this caps it.

---

### RunConfig — Who Does It

**Location:** `evals/run-configs.json` — a JSON array loaded at startup by `src/evals/loader.ts`

A `RunConfig` is a discriminated union — either a **model config** (runs Claude via the Agent SDK) or a **command config** (runs a CLI tool like Snyk directly). Both produce the same `RunOutput` shape and go through the same scorer, so results are directly comparable in the summary table.

```typescript
// Model-based: runs the Agent SDK with a specified Claude model
interface ModelRunConfig {
  type?: "model";      // optional — omitting it defaults to model
  id: string;
  name: string;
  model: string;                           // e.g. "claude-opus-4-6"
  effort?: EffortLevel;                    // "low" | "medium" | "high" | "max" — defaults to "high"
  thinking?: ThinkingConfig;               // defaults to { type: "adaptive" }
  mcpServers?: Record<string, MCPServer>;  // optional: MCP tool servers
  maxTurns?: number;
}

// EffortLevel = "low" | "medium" | "high" | "max"
// ThinkingConfig = { type: "adaptive" } | { type: "enabled"; budgetTokens?: number } | { type: "disabled" }

// Command-based: runs a CLI tool (SAST scanner, etc.)
interface CommandRunConfig {
  type: "command";
  id: string;
  name: string;
  command: string;   // template — {fixturePath} is substituted at runtime
  parser: string;    // key into parser registry (src/parsers/index.ts)
}
```

The separation of `EvalTask` and `RunConfig` is the key architectural decision that makes this a *benchmark* rather than a one-off script. It lets you answer: **"Does this task get a better score with a different model, tool setup, or scanning approach?"**

Example comparisons enabled by this design:

| Comparison | What it isolates |
|---|---|
| `opus-4-6` vs `sonnet-4-6` | Raw model quality difference |
| `sonnet-4-6` vs `sonnet-4-6-with-snyk-mcp` | Value of an MCP-connected security tool |
| `sonnet-4-6` vs `snyk-code` | LLM agent vs classic SAST |
| `opus-4-6` vs `snyk-code` | Best model vs best SAST |

**Command configs are find-vulns only.** SAST tools produce findings but don't edit code, so they are automatically skipped (with an error result) if paired with a fix-vulns task.

**Adding a model config with an MCP server:**
```json
{
  "id": "sonnet-with-semgrep",
  "name": "Claude Sonnet 4.6 + semgrep MCP",
  "model": "claude-sonnet-4-6",
  "mcpServers": {
    "semgrep": { "command": "npx", "args": ["@semgrep/mcp"] }
  }
}
```

#### Effort and Thinking

Two parameters control how deeply Claude reasons during a benchmark run:

**`effort`** — Controls the overall reasoning effort level. Higher effort means more thorough analysis but more tokens and time. Available levels:

| Level | Description | Default? |
|---|---|---|
| `"low"` | Minimal thinking, fastest responses | |
| `"medium"` | Moderate thinking | |
| `"high"` | Deep reasoning | **Yes** (default if omitted) |
| `"max"` | Maximum effort (Opus 4.6 only) | |

**`thinking`** — Controls Claude's extended thinking (chain-of-thought) mode:

| Config | Description | Default? |
|---|---|---|
| `{ "type": "adaptive" }` | Claude decides when and how much to think (Opus 4.6+, Sonnet 4.6) | **Yes** (default if omitted) |
| `{ "type": "enabled", "budgetTokens": N }` | Fixed thinking token budget | |
| `{ "type": "disabled" }` | No extended thinking | |

Both values are recorded in every JSONL result (`effort` and `thinking` fields on `EvalResult`), so you can compare runs at different effort levels after the fact. Example configs for benchmarking effort:

```json
[
  {
    "id": "sonnet-low",
    "name": "Claude Sonnet 4.6 (low effort)",
    "model": "claude-sonnet-4-6",
    "effort": "low"
  },
  {
    "id": "sonnet-high",
    "name": "Claude Sonnet 4.6 (high effort)",
    "model": "claude-sonnet-4-6",
    "effort": "high"
  },
  {
    "id": "opus-max",
    "name": "Claude Opus 4.6 (max effort)",
    "model": "claude-opus-4-6",
    "effort": "max"
  }
]
```

**Adding a SAST command config:**
```json
{
  "type": "command",
  "id": "snyk-code",
  "name": "Snyk Code SAST",
  "command": "snyk code test {fixturePath} --json",
  "parser": "snyk-code"
}
```

The `parser` key must match a registered parser in `src/parsers/index.ts`. Adding a new SAST tool means adding one parser file and registering it there — no changes to the runner or scorer.

For how Snyk (and any command config) output is turned into findings and matched to `fixtures/<name>.json` ground truth, see [Command configs and Snyk Code (SAST)](#command-configs-and-snyk-code-sast) under **Scoring Deep-Dive**.

---

### Runner — The Agent Session

**Location:** `src/runner.ts`

The runner is the bridge between your benchmark harness and the actual Claude Code agent. It calls `query()` from `@anthropic-ai/claude-agent-sdk` and instruments it to collect metrics.

```mermaid
sequenceDiagram
    participant I as index.ts
    participant R as runner.ts
    participant SDK as Agent SDK (query)
    participant CC as Claude Code CLI
    participant API as Anthropic API

    I->>R: runTask(task, config, cwd)
    R->>SDK: query({ prompt, options: { model, hooks, ... } })
    SDK->>CC: spawn claude subprocess
    CC->>API: messages.create(...)

    loop Agent conversation turns
        API-->>CC: AssistantMessage (tool_use blocks)
        CC-->>SDK: message stream event
        SDK-->>R: AssistantMessage (usage: {input_tokens, output_tokens})
        Note over R: accumulate token counts per turn
        SDK->>R: PreToolUse hook fires
        Note over R: record tool start time
        CC->>CC: execute tool (Read/Bash/etc)
        SDK->>R: PostToolUse hook fires
        Note over R: record tool + duration
    end

    API-->>CC: stop_reason = "end_turn"
    CC-->>SDK: ResultMessage
    SDK-->>R: ResultMessage (final result text)
    R-->>I: { finalText, metrics, error? }
```

**What makes this work:**

The Agent SDK fires two hook events around every tool call:

```typescript
hooks: {
  PreToolUse:  [{ matcher: ".*", hooks: [preHook]  }],  // fires BEFORE tool runs
  PostToolUse: [{ matcher: ".*", hooks: [postHook] }],  // fires AFTER tool runs
}
```

We use a `Map<tool_use_id, startTime>` to pair up the pre and post events, giving us the duration of each individual tool call. This is more reliable than trying to parse timing from the message stream.

**Token counting (dual-path):**

The runner uses a two-path strategy for token counting:

1. **Primary (preferred):** The `SDKResultMessage` emitted at the end of the session carries an authoritative `usage` field with session-level token totals and a `total_cost_usd` field with the actual session cost. When available, these are used directly — no manual accumulation needed.

2. **Fallback:** The Agent SDK's message stream also includes a `usage` field on every `AssistantMessage`, representing the token count for that one API call. The runner accumulates these per-turn values with deduplication (see [SDK Message Structure and Deduplication](#sdk-message-structure-and-deduplication)) as a fallback for cases where the `SDKResultMessage.usage` is unavailable (older SDK versions, alternative harnesses, error paths).

Both paths produce the same `BenchmarkMetrics` shape. The `totalCostUsd` field is only populated when the SDK provides `total_cost_usd` (the primary path); the fallback path sets it to `null` since computing cost requires a model-specific pricing table that the benchmark does not maintain.

Note: input tokens grow each turn because the API is stateless — the full conversation history is re-sent every turn. This means a long agent session can be significantly more expensive than its output token count suggests.

**`bypassPermissions` mode:**

The runner uses `permissionMode: "bypassPermissions"` so that file reads and writes in the fixture directory don't pause waiting for user approval. This is essential for automated benchmarking. The `allowDangerouslySkipPermissions: true` flag explicitly acknowledges the risk.

---

### Metrics — What Was Measured

**Location:** `src/types.ts` → `BenchmarkMetrics`, collected by `src/runner.ts`

After a run completes, the runner returns a `BenchmarkMetrics` object containing everything measured during the agent session:

```typescript
interface BenchmarkMetrics {
  sessionDurationMs: number;        // wall-clock ms from first query() call to ResultMessage
  totalInputTokens: number;         // non-cached input tokens (the "uncacheable" residual)
  totalOutputTokens: number;        // output tokens generated across all turns
  totalCacheReadTokens: number;     // tokens served from prompt cache across all turns
  totalCacheCreationTokens: number; // tokens written into prompt cache across all turns
  totalLogicalInputTokens: number;  // input + cache_read + cache_creation — the actual context size
  totalCostUsd: number | null;      // session cost in USD (null for command runs / fallback path)
  totalTurns: number;               // number of assistant messages in the session
  toolCalls: ToolCallRecord[];      // one entry per individual tool execution, in order
  toolStats: {                      // per-tool aggregates
    [toolName: string]: {
      count: number;                // how many times this tool was called
      totalDurationMs: number;      // total wall-clock time spent inside this tool
      totalInputTokensEst: number;  // estimated tokens sent TO the tool (parameters)
      totalOutputTokensEst: number; // estimated tokens returned FROM the tool (result)
    }
  };
}
```

Each entry in `toolCalls`:
```typescript
interface ToolCallRecord {
  tool: string;            // e.g. "Read", "Bash", "Grep"
  durationMs: number;      // wall-clock ms the tool took to execute
  inputTokensEst: number;  // estimated tokens in the tool's input parameters
  outputTokensEst: number; // estimated tokens in the tool's output/result
}
```

**Why `toolStats` matters:**

Different models use tools differently. A model that calls `Bash` 20 times and `Read` 5 times has a very different behavior profile than one that calls `Read` 40 times and `Bash` 0 times. `toolStats` lets you see this. For security tasks especially, you might care whether the model:

- Used `Bash` to run static analysis tools (expensive, potentially powerful)
- Used only `Read` + `Grep` (cheaper, simpler)
- Called `Write`/`Edit` (only relevant for fix-vulns)

See the [Metrics Deep-Dive](#metrics-deep-dive) section for a full explanation of how each field is collected and what the numbers mean.

---

### Scorer — How Good Was It

**Location:** `src/scorer.ts`

The scorer translates the agent's raw output into a number between 0 and 1. The logic is different for each eval category.

#### find-vulns Scoring

```mermaid
flowchart TD
    A["Agent output text\n(contains FINDINGS_JSON block)"] --> B
    B["Parse JSON array\nfrom FINDINGS_JSON: block"] --> C
    C["Normalize each finding:\n• type string → VulnType enum\n• severity string → Severity enum"] --> D
    D["Match findings to\nknown vulns by type"] --> E

    E --> F["True Positives\nAgent found a real vuln"]
    E --> G["False Positives\nAgent reported a fake vuln"]
    E --> H["False Negatives\nAgent missed a real vuln"]

    F --> I
    G --> I
    H --> I

    I["precision = TP / (TP + FP)\nrecall = TP / (TP + FN)"] --> J
    J["F1 = 2 × (precision × recall)\n       ─────────────────────\n       (precision + recall)"]
    J --> K["Final score: 0.0 – 1.0"]
```

**Precision vs Recall:**

- **Precision** answers: "Of all the things the agent reported, what fraction were real vulnerabilities?" A low precision means lots of false alarms.
- **Recall** answers: "Of all the real vulnerabilities, what fraction did the agent find?" A low recall means important vulns were missed.
- **F1** is the harmonic mean — it's 1.0 only when both precision and recall are 1.0. It penalizes both missing vulns and crying wolf.

**Why structured output (`FINDINGS_JSON`)?**

The system prompt asks the agent to output its findings in a specific JSON format at the end:

```
FINDINGS_JSON:
```json
[{ "type": "sql-injection", "file": "app.js", "line": 28, ... }]
```
```

Without this, parsing free-text like "I found a SQL injection vulnerability on line 28 of app.js" is fragile and unreliable. The structured format makes scoring deterministic.

#### fix-vulns Scoring

```mermaid
flowchart TD
    A["Agent has edited files\nin temp fixture copy"] --> B
    B["Read all modified\nsource files"] --> C
    C["Build prompt for\nClaude Haiku:\n'Did this fix vuln X?\nDid this fix vuln Y?'"] --> D
    D["Haiku responds with JSON:\n{id: vuln-id, fixed: true/false}\nfor each known vuln"] --> E
    E["Count fixed / total\n= score"] --> F
    F["Score: 0.0 – 1.0"]
```

For fix-vulns, we can't use the same parse-and-compare approach because the agent's output is the modified source files, not text. Instead, we use **Claude Haiku as a judge**: we show it the modified code and ask it to assess each known vulnerability.

We use Haiku (not Opus/Sonnet) for the judge because:
- It's much cheaper — scoring many runs would be costly with a more expensive model
- This is a straightforward yes/no judgment task that doesn't require deep reasoning
- Speed matters less here (scoring happens after the run, not inline)

**Why a temp copy for fix-vulns?**

When the agent fixes vulnerabilities, it actually edits the source files. If it edited the original fixtures, the next run against that fixture would start from already-fixed code, producing misleading results. By copying the fixture to a temp directory first (`index.ts` does this before calling `runTask`), each run always starts from the same baseline.

---

### Reporter — Presenting Results

**Location:** `src/reporter.ts`

The reporter handles all output. It has five functions:

**`printConfigHeader(name, index, total)`** — prints a bold cyan banner line (`━━━ Config: ... [n/m] ━━━`) before each config's group of task results.

**`printRunProgress(taskName, index, total)`** — prints a bold progress line (`▸ [n/N] TaskName`) before each individual run.

**`printResult(result)`** — prints a label-aligned block for one run immediately after it completes. Each metric gets its own line with a fixed-width dim label, making it easy to scan vertically. See [Metrics Deep-Dive](#metrics-deep-dive) for annotated mock output.

**`printSummaryTable(results, taskAggregates, configAggregates)`** — prints a summary after all runs finish. When repetitions > 1, the per-fixture table shows mean scores (labeled "mean of N"). When multiple tasks are involved, a headline section shows per-config macro-averaged scores. Columns: task/config id, score (color-coded), recall, precision, total tokens, cost, wall time. See [Sample Output — Summary Table](#sample-output--summary-table).

**`saveResults(results, dir, taskAggregates, configAggregates)`** — writes results to `results/benchmark-<timestamp>.jsonl`. Each line is a JSON object tagged with a `_type` discriminator:
- `"run"` — raw `EvalResult` (one per execution)
- `"task-aggregate"` — `AggregatedTaskResult` (one per task+config pair, mean across repetitions)
- `"config-aggregate"` — `AggregatedConfigResult` (one per config, macro-averaged across fixtures)

JSONL (JSON Lines) format means one complete JSON object per line, making it easy to:
- Load into analysis tools (Python pandas, etc.)
- Append new results without re-reading old ones
- Query with `jq` from the command line — filter by `_type` to select the aggregation level

See [Sample Output — JSONL Record](#sample-output--jsonl-record) for the full structure of each row type.

---

### EvalResult — The Final Record

**Location:** `src/types.ts` → `EvalResult`

Every run produces exactly one `EvalResult`. It is the complete record of everything that happened:

```typescript
interface EvalResult {
  taskId: string;          // e.g. "js-find-vulns"
  taskName: string;        // e.g. "JS App: Find Vulnerabilities"
  runConfigId: string;     // e.g. "opus-4-6"
  runConfigName: string;   // e.g. "Claude Opus 4.6 (no MCP)"
  runConfigType: "model" | "command"; // distinguishes Agent SDK runs from SAST tool runs
  effort: EffortLevel | null;      // "low" | "medium" | "high" | "max" — null for command runs
  thinking: ThinkingConfig | null; // { type: "adaptive" } etc. — null for command runs
  score: number;           // 0.0–1.0
  metrics: BenchmarkMetrics; // tokens, time, tool calls
  details: FindVulnsDetails | FixVulnsDetails; // what happened in scoring
  timestamp: string;       // ISO 8601 — when this run happened
  repetition: number;      // 1-indexed repetition number (e.g. 2 of 3)
  totalRepetitions: number; // total reps requested for this task+config pair
  error?: string;          // set if the run crashed
}
```

`details` is a union type that holds scoring-specific data:

For **find-vulns**:
```typescript
{
  agentFindings: Vulnerability[];           // what the agent actually reported
  truePositives: VulnMatch[];              // correctly identified vulns ({ id, type, severity })
  falsePositives: Vulnerability[];         // agent findings with no matching ground-truth vuln
  falseNegatives: VulnMatch[];             // missed vulns ({ id, type, severity })
  precision: number;                        // 0–1
  recall: number;                           // 0–1
  byType: Record<VulnType, BreakdownEntry>; // per-vulnerability-type precision/recall/F1
  bySeverity: Record<Severity, BreakdownEntry>; // per-severity precision/recall/F1
}

// Where:
// VulnMatch  = { id: string; type: VulnType; severity: Severity }
// BreakdownEntry = { total: number; found: number; precision: number; recall: number; f1: number }
```

For **fix-vulns**:
```typescript
{
  vulnsAttempted: number;  // total known vulns in the fixture
  vulnsFixed: number;      // how many the judge confirmed as fixed
  judgeNotes: string;      // Haiku's explanation for each vuln
}
```

---

## Worked Example: A Single Run

Let's trace exactly what happens when you run:

```bash
pnpm run benchmark -- --task js-project-tigerteam-find-vulns --config opus-4-6
```

**Step 1 — Setup (`index.ts`)**
- Filters `EVAL_TASKS` to just `js-project-tigerteam-find-vulns`
- Filters `DEFAULT_RUN_CONFIGS` to just `opus-4-6`
- 1 task × 1 config = 1 run

**Step 2 — Prepare the working directory (`index.ts`)**
- `task.type === "find-vulns"` → no copy needed
- Sets `cwd = fixtures/js-project-tigerteam/` (the agent will start here)

**Step 3 — Run the agent (`runner.ts`)**
- Calls `query({ prompt: "Audit all files...", options: { cwd, model: "claude-opus-4-6", hooks: [...] } })`
- The Agent SDK spawns the Claude Code CLI as a subprocess
- The agent starts in `fixtures/js-project-tigerteam/` and begins reading `app.js`
- The `PreToolUse` hook fires before each tool call, recording its start time
- The `PostToolUse` hook fires after, recording tool name + duration
- Each `AssistantMessage` from the stream contributes its `usage.input_tokens` and `usage.output_tokens` to running totals
- When the agent finishes, we receive a `ResultMessage` with the final text

**Step 4 — The agent's output (example)**
```
I've analyzed app.js and found the following security vulnerabilities:

The application contains several critical security issues...
[analysis text]

FINDINGS_JSON:
```json
[
  { "type": "sql-injection", "file": "app.js", "line": 28, "severity": "critical", "description": "..." },
  { "type": "xss", "file": "app.js", "line": 42, "severity": "high", "description": "..." },
  { "type": "path-traversal", "file": "app.js", "line": 56, "severity": "high", "description": "..." },
  { "type": "hardcoded-credentials", "file": "app.js", "line": 8, "severity": "high", "description": "..." }
]
```
```

**Step 5 — Score (`scorer.ts`)**
- Parses the JSON block: 4 findings
- Known vulns: 5 (`js-sqli-1`, `js-xss-1`, `js-path-traversal-1`, `js-cmd-injection-1`, `js-hardcoded-creds-1`)
- Matching:
  - `sql-injection` → matches `js-sqli-1` ✓
  - `xss` → matches `js-xss-1` ✓
  - `path-traversal` → matches `js-path-traversal-1` ✓
  - `hardcoded-credentials` → matches `js-hardcoded-creds-1` ✓
  - `js-cmd-injection-1` → NOT found ✗
- TP=4, FP=0, FN=1
- Precision = 4/4 = 1.0, Recall = 4/5 = 0.8
- F1 = 2×(1.0×0.8)/(1.0+0.8) = **0.889**

**Step 6 — Report (`reporter.ts`)**
- `printResult()` writes the detailed block to console
- `saveResults()` appends the full `EvalResult` JSON to `results/benchmark-<timestamp>.jsonl`

---

## Scoring Deep-Dive

### Why F1 and Not Just Recall?

You might think "recall is what matters — finding all the vulns is the goal." That's partially true, but a system that reports *every possible string combination as a vulnerability* would have 100% recall and be useless. F1 penalizes that by also requiring precision.

```
Scenario A: Agent finds 5/5 known vulns but also reports 20 fake ones
  Precision = 5/25 = 0.20    Recall = 5/5 = 1.00    F1 = 0.33

Scenario B: Agent finds 4/5 known vulns with no false alarms
  Precision = 4/4 = 1.00    Recall = 4/5 = 0.80    F1 = 0.89

Scenario B is the better result — and F1 correctly ranks it higher.
```

### How Vuln Type Matching Works

The scorer (`scoreFindVulns` in `src/scorer.ts`) matches **parsed findings** (from an LLM or from a SAST command config — see below) to known vulnerabilities by their **normalized type**, not by file, line, Snyk rule id, or description. This is intentional:

- An agent might say "line 29" instead of "line 28" — exact line matching would unfairly penalize this
- An agent might phrase it as "SQL injection" or "SQLi" or "SQL Injection" — `normalizeVulnType` maps these to the same `VulnType` string (e.g. `"sql-injection"`) before comparing
- Each known vuln can only be matched once (no double-counting)

**Algorithm (greedy, type-only):** `knownVulns` comes from the task in **array order** (as loaded from `fixtures/<fixture-name>.json`). The scorer walks **findings in the order they appear** in the JSON array. For each finding, it picks the **first** ground-truth row that is not yet matched and whose `type` equals the finding’s type (`vulnTypesMatch` — strict equality on `VulnType` after normalization). `file` and `line` on findings are stored in `details.agentFindings` for inspection and JSONL output but **play no role** in true positive / false positive / false negative counts. (A code comment in `scorer.ts` mentions “within same file”; the implementation does **not** filter by file.)

If you add a fixture with two different SQL injections in the same file, give them different IDs (`sqli-1`, `sqli-2`) so they appear as two ground-truth rows. The scorer will match **at most two** `sql-injection` findings to them, in **pairing order**: the *i*-th reported `sql-injection` finding in the parsed array pairs with the *i*-th still-unmatched `sql-injection` in `knownVulns` order — not by comparing line numbers to the JSON `line` fields.

### Command configs and Snyk Code (SAST)

Command-based run configs (e.g. `snyk-code` in `evals/run-configs.json`) run an external CLI against the fixture directory, parse **stdout** into the same finding shape as the LLM path, then reuse **identical** find-vulns scoring. This section is the reference for “how do Snyk’s results line up with `fixtures/js-project-tigerteam.json` (or any ground-truth file)?”

#### 1. Where the run is dispatched

**`src/index.ts`** — If `config.type === "command"`, the harness calls `runCommandTask` from `src/command-runner.ts` instead of `runTask` from `src/runner.ts`. The fixture path passed in is the task’s `fixture` directory (same as for find-vulns agents). Command configs are skipped with an error when paired with fix-vulns tasks (see [RunConfig](#runconfig--who-does-it)).

#### 2. Command execution and stdout

**`src/command-runner.ts`**

- Substitutes the token `{fixturePath}` in the config’s `command` string with the actual fixture directory path (split on spaces; paths with spaces are handled because substitution replaces a whole token).
- Runs `execFile(program, args, …)` with a large `maxBuffer` so big SARIF payloads fit.
- **`snyk code test` exits non-zero when issues are found** — that is expected. On failure, if `err.stdout` is present, the runner treats it as success and uses that stdout (the JSON/SARIF body). If there is no stdout, it returns an `error` result.

#### 3. Parser: SARIF → `FindingRecord[]`

**`src/parsers/index.ts`** registers parsers by string key (`"snyk-code"` → `parseSnykCodeOutput`). A **`FindingRecord`** has `type`, `file`, `line`, `severity`, and `description` — the same fields the scorer expects inside `FINDINGS_JSON`.

**`src/parsers/snyk-code.ts`** — `parseSnykCodeOutput(stdout)`:

- Parses stdout as JSON and reads SARIF-ish structure: `runs[0].results[]` (as emitted by `snyk code test --json`).
- **`ruleId` is the sourced field:** Each item is a SARIF **`result`** object. Vulnerability-kind mapping uses the standard SARIF string property **`ruleId`** — `runs[0].results[i].ruleId` — passed to `mapRuleId()` (see the `parseSnykCodeOutput` docblock). For spot-checks on captured stdout: JSONPath **`$.runs[0].results[*].ruleId`**, or **`$.runs[*].results[*].ruleId`** when multiple runs exist; JSON Pointer to the first finding’s rule id: **`/runs/0/results/0/ruleId`**.
- For each result that includes **`ruleId`**, builds one finding:
  - **`type`:** from `mapRuleId(ruleId)` — regex heuristics on the lowercase `ruleId` string (e.g. `javascript/SqlInjection` → `"sql-injection"`, `javascript/PrototypePollution` → `"prototype-pollution"`, `javascript/TooPermissiveCorsHeader` → `"origin-validation-error"`). The SARIF log also includes per-rule **`shortDescription.text`** in `runs[0].tool.driver.rules` for human-readable labels (e.g. “Origin Validation Error”). Anything that does not match maps to **`"other"`**.
  - **`file`:** `locations[0].physicalLocation.artifactLocation.uri` (may be a relative path or a `file://` URI depending on Snyk output).
  - **`line`:** `locations[0].physicalLocation.region.startLine` if present.
  - **`severity`:** `mapLevel` maps SARIF `level` (`error` → `"high"`, `warning` → `"medium"`, `note` → `"low"`).
  - **`description`:** `message.text`.

Alignment with a ground-truth row such as those in **`fixtures/js-project-tigerteam.json`** is therefore **primarily a contract on `type`**: the Snyk `ruleId` must map (via `mapRuleId`) to the same `VulnType` string as the `"type"` field in the fixture JSON. If Snyk uses a rule id that falls through to `"other"` while the benchmark expects a specific type, that finding will not match any known vuln (unless the ground truth literally uses `"other"`), and recall will suffer until the mapping is extended.

#### 4. Bridging to the scorer: synthetic `FINDINGS_JSON`

Still in **`src/command-runner.ts`**: after `parser(stdout)` returns `FindingRecord[]`, the runner sets `finalText` to the `FINDINGS_JSON:` marker, a newline, a Markdown `json` fenced block, and `JSON.stringify(findings, null, 2)` inside it — the same outer shape as the LLM contract described under [find-vulns Scoring](#find-vulns-scoring) (**Why structured output (`FINDINGS_JSON`)?**). No separate code path in the scorer is required.

So `scoreFindVulns` in **`src/scorer.ts`** runs unchanged: `parseFindings` extracts the JSON array, `normalizeFindings` assigns synthetic ids `found-0`, `found-1`, … and normalizes types/severities.

**`metrics.filesScanned`** for command runs is derived from the **unique `file` strings** in the parsed findings (not from the Agent SDK), as noted in `command-runner.ts`.

#### 5. Matching to ground truth (same as LLM)

Scoring uses **`scoreFindVulns(finalText, task)`** — the same type-only greedy matching described in [How Vuln Type Matching Works](#how-vuln-type-matching-works). There is **no** secondary matcher that lines up Snyk SARIF rule ids or line numbers to `fixtures/<name>.json` **`id`** fields. A Snyk result “counts” toward `js-xss-1` only if:

1. `mapRuleId` produced `"xss"`, and  
2. That finding is paired by the greedy walk with that ground-truth row (i.e. it is the first unmatched `"xss"` in `knownVulns` order when this finding is processed, given earlier findings already consumed other `"xss"` slots).

So two XSSes in the fixture are distinguished only by **order of unmatched `xss` rows in the JSON** vs **order of `xss` findings in Snyk’s results array** — not by verifying that Snyk’s line matches the `"line"` in the answer key.

#### 6. Implications for benchmark authors

- Keep **`type`** in `fixtures/<name>.json` consistent with `mapRuleId` in `src/parsers/snyk-code.ts` when you care about Snyk parity for that rule family.
- When multiple known vulns share a type, **ordering** in the ground-truth file and **ordering** of Snyk results affect which ID is credited; consider ordering `vulnerabilities[]` to match typical Snyk emission order if you want stable pairing, or plan for a future location-aware matcher if you need strict line-to-id alignment.
- **`found === "other"`** does not match arbitrary known types (`vulnTypesMatch` returns false for `"other"` findings except when the known type is also `"other"`).

#### When to update `mapRuleId` (Snyk)

The SARIF → **`VulnType`** step is **`mapRuleId()`** in **`src/parsers/snyk-code.ts`**. You should extend it when:

- You add or change **fixtures** and Snyk reports findings whose **`ruleId`** is not yet recognised (often showing up as parsed `"type": "other"` in JSONL `details.agentFindings`).
- You **upgrade Snyk** or see **new / renamed `ruleId`s** in real SARIF (including abbreviated ids such as `javascript/OR`, `javascript/PT`, `javascript/Sqli`).
- You add a **command config** that still uses the **`snyk-code`** parser — the same `mapRuleId` applies; wire the config in `evals/run-configs.json` only after the parser can map the rules you care about.

Operational checklist, example `jq` invocations, and the distinction between “**new `VulnType`**” vs “**existing type, new Snyk id**” live in **`docs/benchmark-management.md`** → [Maintaining Snyk Code ruleId mappings](./benchmark-management.md#maintaining-snyk-code-ruleid-mappings).

---

## Aggregation and Headline Scores

When multiple fixtures and/or repeated runs are involved, raw per-run scores need to be collapsed into single headline numbers for comparison charts. This section explains the aggregation pipeline, the statistical approach, and the design decisions behind it.

Frontier eval suites — SWE-bench, HumanEval, MBPP, MMLU, and the benchmark sections of model cards from Anthropic, OpenAI, and others — all face the same problem: they run a model against dozens or hundreds of tasks and need to report *one number* on a chart. The standard approach is **macro-averaging**: compute the metric independently for each task, then take the arithmetic mean across tasks. SWE-bench's headline "resolve rate" is literally `resolved / total_tasks` — a macro-average of binary pass/fail. This ensures each test scenario contributes equally regardless of how many sub-items it contains, which is the right default when fixtures represent qualitatively different codebases rather than interchangeable samples from the same distribution.

Non-determinism adds a second dimension. Model responses vary between runs, so a single execution may not be representative. The standard practice is to run each (task, config) pair multiple times (typically 3–5), take the mean across those repetitions as the per-fixture score, and then macro-average those fixture-level means into the headline number. The raw per-run data is preserved so that anyone who needs standard deviations or confidence intervals can compute them after the fact.

The rest of this section details exactly how the benchmark implements this two-step collapse — repetitions first, then macro-averaging — and the design decisions that shaped it.

---

### The Three-Level Pipeline

Scores are aggregated in three levels, each producing a progressively more condensed view:

```mermaid
flowchart LR
    raw["EvalResult[]<br/>(N tasks x M configs x R reps)"] --> byTask
    byTask["aggregateByTask()<br/>AggregatedTaskResult[]<br/>(N x M, mean over R reps)"] --> byConfig
    byConfig["aggregateByConfig()<br/>AggregatedConfigResult[]<br/>(M configs, macro-avg over N tasks)"]
```

| Level | What it represents | How it's computed |
|---|---|---|
| **Per-run** | One execution of `runEval(task, config)` | Raw scores: F1, recall, precision, time, tokens, cost |
| **Per-fixture** | All runs of the same (task, config) pair across repetitions | Arithmetic mean of each metric across the N repetitions |
| **Per-config** | All fixture-level scores for a given config | Arithmetic mean (macro-average) across fixtures |

The per-config level produces the **headline numbers** — the single values shown on comparison charts (e.g. "Opus F1: 83%, Sonnet F1: 71%, Snyk Code F1: 92%").

**Example with 3 fixtures, 2 configs, 3 repetitions:**
- 18 raw `EvalResult` objects (per-run level)
- 6 per-fixture scores (3 fixtures x 2 configs, each the mean of 3 reps)
- 2 headline numbers (one per config, each the mean of 3 fixture-level scores)

---

### Macro-Averaging

The headline score for each config is a **macro-average** (unweighted mean) across fixtures. Each fixture contributes equally to the final number regardless of how many vulnerabilities it contains.

**Why macro-average and not micro-average?** Micro-averaging pools all TP/FP/FN across fixtures and computes one combined metric. This would let a fixture with 50 vulns dominate over one with 3 vulns. Macro-averaging ensures each fixture (test scenario) has equal weight, which is appropriate when fixtures represent qualitatively different codebases rather than interchangeable samples from the same distribution.

This is the standard approach used by SWE-bench (resolve rate = mean of binary pass/fail per task), HumanEval, MBPP, MMLU, and most frontier eval suites.

---

### Repetitions

To mitigate non-determinism in model responses, the benchmark supports running each (task, config) pair multiple times via the `--repetitions N` CLI flag.

```bash
# Run each (task, config) pair 3 times
pnpm run benchmark -- --repetitions 3

# Combine with other filters
pnpm run benchmark -- --category find-vulns --config sonnet-4-6 --repetitions 3
```

When `--repetitions` is omitted, it defaults to **1** (existing behavior unchanged).

The per-fixture score used in the macro-average is the arithmetic mean across repetitions:

```
score(fixture_i, config_j) = mean over k runs of score(fixture_i, config_j, run_k)
```

Then the headline number is:

```
headline_score(config_j) = mean over i fixtures of score(fixture_i, config_j)
```

Each raw `EvalResult` carries `repetition` (1-indexed) and `totalRepetitions` fields so results can be identified and grouped after the fact.

**Recommended repetition counts:**
- **1** (default): Fine for initial/exploratory runs and SAST command configs (which are deterministic)
- **3**: Practical minimum for meaningful averaging across model runs
- **5**: More reliable; recommended for published comparisons

---

### What Metrics Are Aggregated

All numeric metrics are averaged at both the per-fixture and per-config levels:

| Metric | Per-fixture | Per-config |
|---|---|---|
| **Score (F1)** | Mean across reps | Macro-avg across fixtures |
| **Recall** | Mean across reps (find-vulns only) | Macro-avg across fixtures |
| **Precision** | Mean across reps (find-vulns only) | Macro-avg across fixtures |
| **Wall time** (`sessionDurationMs`) | Mean across reps | Macro-avg across fixtures |
| **Total tokens** (logical input + output) | Mean across reps | Macro-avg across fixtures |
| **Cost** (`totalCostUsd`) | Mean across reps (null if any run lacked it) | Macro-avg across fixtures |

Aggregate rows are written to the JSONL output file alongside raw results, tagged with a `_type` discriminator:

| `_type` | What it contains |
|---|---|
| `"run"` | Raw `EvalResult` — one execution |
| `"task-aggregate"` | `AggregatedTaskResult` — mean across reps for one (task, config) |
| `"config-aggregate"` | `AggregatedConfigResult` — macro-avg across fixtures for one config |

Downstream consumers (chart generators, `jq` queries) can filter by `_type` to select the appropriate aggregation level.

---

### Design Decisions

**Weighted averaging: out of scope.** All fixtures contribute equally to the headline number. This is the simplest, most transparent, and most defensible approach. It could be revisited if fixtures are deliberately grouped by difficulty tier, but for now the benchmark treats all fixtures as equally important test scenarios.

**Error bars / confidence intervals: out of scope.** These add reporting complexity without a clear current need. The raw per-run data (all `"run"` rows) is preserved in the JSONL file, so anyone who needs standard deviations or confidence intervals can compute them from the raw data after the fact.

**Micro-averaging: not used.** As explained above, micro-averaging would let large fixtures dominate the headline number. Macro-averaging is the field standard for heterogeneous eval suites.

---

## Metrics Deep-Dive

This section explains every metric the benchmark collects, how each one is captured, and what the numbers mean when you read a report.

---

### Metrics Quick Reference

Every metric the benchmark produces, at a glance. The "Report line" column shows where it appears in the console output; "JSONL field" shows the key path in the saved result file.

#### Quality metrics (find-vulns)

| Metric | Report line | JSONL field | What it means |
|---|---|---|---|
| **Score (F1)** | `Score (F1) :  X%` | `score` | Harmonic mean of precision and recall — the headline quality number |
| **Recall** | `Recall      :  X%  (N/M known vulns found)` | `details.recall` | Fraction of real vulns the agent found |
| **Precision** | `Precision   :  X%  (N false positives)` | `details.precision` | Fraction of agent's findings that were real |
| **True positives** | Implicit in recall line | `details.truePositives` | Array of `{ id, type, severity }` for correctly identified vulns |
| **False positives** | `(N false positives)` | `details.falsePositives` | Array of full `Vulnerability` objects for unmatched agent findings |
| **False negatives** | `Missed      :  id1, id2` | `details.falseNegatives` | Array of `{ id, type, severity }` for missed vulns |
| **By type** | — | `details.byType` | Per-vuln-type breakdown: `{ total, found, precision, recall, f1 }` |
| **By severity** | — | `details.bySeverity` | Per-severity breakdown: `{ total, found, precision, recall, f1 }` |

#### Quality metrics (fix-vulns)

| Metric | Report line | JSONL field | What it means |
|---|---|---|---|
| **Score** | `Score       :  X%` | `score` | Fraction of known vulns confirmed fixed by the LLM judge |
| **Vulns fixed** | `Fixed       :  N/M vulnerabilities` | `details.vulnsFixed` | Count confirmed remediated |
| **Vulns attempted** | `Fixed       :  N/M vulnerabilities` | `details.vulnsAttempted` | Total known vulns in the fixture |
| **Judge notes** | `Notes       :  ...` | `details.judgeNotes` | Per-vuln verdict from the LLM judge (Claude Haiku) |

#### Agent configuration (model runs only)

| Metric | Report line | JSONL field | What it means |
|---|---|---|---|
| **Effort** | `Effort      :  high  (thinking: adaptive)` | `effort` | Reasoning effort level (`"low"` / `"medium"` / `"high"` / `"max"`). Null for command runs. |
| **Thinking** | Shown inline with effort | `thinking` | Extended thinking config (`{ type: "adaptive" }` / `{ type: "enabled", budgetTokens: N }` / `{ type: "disabled" }`). Null for command runs. |

#### Session metrics (all eval types)

| Metric | Report line | JSONL field | What it means |
|---|---|---|---|
| **Wall time** | `Time        :  Xs` | `metrics.sessionDurationMs` | Clock time from query start to finish, including all API round-trips and tool execution |
| **Turns** | `Turns       :  N` | `metrics.totalTurns` | Unique API calls made (after dedup — see [SDK Message Structure](#sdk-message-structure-and-deduplication)) |
| **Files scanned** | `Files       :  N` | `metrics.filesScanned` | Distinct file paths touched by Read/Write/Edit; proxy for codebase exploration depth |
| **Total logical input** | `in: N` (inside Tokens line) | `metrics.totalLogicalInputTokens` | Total context the model processed: input + cache_read + cache_creation |
| **Output tokens** | `out: N` (inside Tokens line) | `metrics.totalOutputTokens` | All tokens Claude generated across all turns |
| **Uncached input** | `(N uncached)` (inside Cache line) | `metrics.totalInputTokens` | Non-cached input tokens — the residual outside the cached prefix |
| **Cache-read tokens** | `N read` (inside Cache line) | `metrics.totalCacheReadTokens` | Context served from prompt cache (~10% billing rate) |
| **Cache-write tokens** | `N written` (inside Cache line) | `metrics.totalCacheCreationTokens` | Context written into prompt cache (~125% billing rate) |
| **Total tokens** | `Tokens      :  N total` | `totalLogicalInputTokens + totalOutputTokens` | Total context consumed (logical input + output) |
| **Cost** | `Cost        :  $X.XXXX` | `metrics.totalCostUsd` | Session cost in USD from the SDK (accounts for model and cached vs non-cached pricing). Null for command runs. |
| **Per-tool stats** | `Tools       :  Read 4x avg 11ms ...` | `metrics.toolStats` | Per-tool call count, avg duration, and estimated input/output tokens |

---

### Session-Level Token Accounting

The runner uses a dual-path approach for token accounting.

**Primary path — `SDKResultMessage.usage`:** The `SDKResultMessage` emitted at the end of the session carries authoritative session-level token totals directly from Claude Code. When available, these are used as the canonical source. The result message also provides `total_cost_usd` — the actual session cost in USD, accounting for per-model pricing and the different billing rates for cached vs non-cached tokens.

**Fallback path — per-turn accumulation:** The Anthropic API reports token usage on every API call. The runner accumulates these across the full session as a fallback:

```
Turn 1 (system prompt + user message):
  input_tokens: 1,840   output_tokens: 420

Turn 2 (context + tool results from turn 1):
  input_tokens:   210   output_tokens: 180   cache_read_input_tokens: 1,840

Turn 3 (context + tool results from turns 1–2):
  input_tokens:   180   output_tokens: 920   cache_read_input_tokens: 2,260
  ...

Session totals (summed across all turns):
  totalInputTokens:       2,230   ← non-cached tokens (the "uncacheable" residual)
  totalOutputTokens:      1,520   ← all tokens Claude generated
  totalCacheReadTokens:   9,460   ← context tokens served from cache
  totalCacheCreationTokens: 1,840 ← tokens written into cache on turn 1
  totalLogicalInputTokens: 13,530 ← input + cache_read + cache_creation (actual context size)
```

**Understanding the three input token buckets:**

The Anthropic API reports input tokens in three mutually exclusive buckets per API call:

| Field | What it counts | Billing rate |
|---|---|---|
| `totalInputTokens` | Tokens neither cached nor written to cache (the "uncacheable" residual) | Full input rate |
| `totalCacheReadTokens` | Context tokens served from the prompt cache | ~10% of input rate |
| `totalCacheCreationTokens` | Tokens written into the cache for the first time | ~125% of input rate |

All three represent tokens the model actually processed as input context. The sum — `totalLogicalInputTokens` — is the real context size. The `Tokens: N total` line in the report shows `totalLogicalInputTokens + totalOutputTokens`.

| Field | What it counts | Billing rate |
|---|---|---|
| `totalOutputTokens` | All tokens Claude generated | Output rate |
| `totalCostUsd` | Full session cost from the SDK | Accounts for all rate differences |

---

### SDK Message Structure and Deduplication

This is a critical implementation detail. **The Agent SDK emits one `SDKAssistantMessage` event per content block in an API response — not one per API call.** A single Claude API response containing both a thinking block and a tool_use block fires two separate events, each carrying the *same* `usage` object:

```
API call returns:  content=[thinking, tool_use]  usage={in:3, out:54, cr:9845}

SDK emits:
  SDKAssistantMessage #1  content=[thinking]  usage={in:3, out:54, cr:9845}
  SDKAssistantMessage #2  content=[tool_use]  usage={in:3, out:54, cr:9845}
```

If you naively accumulate `usage.output_tokens` on every event, those 54 tokens get counted twice. The Anthropic API billed you once; you'd record it twice.

**The fix — deduplication by session and usage fingerprint:**

The runner tracks the last-seen usage fingerprint keyed by `parent_tool_use_id` (which session level the message belongs to). It only accumulates when the fingerprint changes:

```typescript
const sessionKey = message.parent_tool_use_id ?? null;
const usageKey = `${in}:${out}:${cr}:${cw}`;
if (lastUsagePerSession.get(sessionKey) !== usageKey) {
  lastUsagePerSession.set(sessionKey, usageKey);
  // accumulate tokens and increment turn counter
}
```

This guarantees each unique API call is counted exactly once regardless of how many content blocks it produced.

**Sub-agent sessions:** The Claude Code `Agent` built-in tool spawns a nested sub-agent session. That sub-session's messages stream through the same `query()` iterator with `parent_tool_use_id` set to the parent's tool call ID. Sub-agent usage IS counted in the session totals — these are real API calls with real cost — and deduplication handles them correctly because they are tracked under their own `parent_tool_use_id` key, separate from the root session.

**What `totalTurns` counts:** unique API calls, after deduplication. Not content blocks, not SDK events. A turn where Claude responds with `[thinking, tool_use, tool_use]` counts as one turn.

---

### Cache Tokens

**Short answer: yes, cache tokens count — they represent real context the model processed, just at heavily discounted billing rates.**

Prompt caching is an automatic Anthropic API feature. When the same prefix (system prompt + early conversation context) appears in multiple consecutive API calls, the API stores that prefix on Anthropic's servers after the first call. Subsequent calls that reuse the same prefix pay a fraction of the normal input rate instead of re-processing it from scratch. No benchmark code configuration is needed — the Claude Code subprocess triggers it automatically.

There are two sides to the cache economy:

| Token type | When it appears | Billing rate |
|---|---|---|
| `totalCacheCreationTokens` | First call that establishes the cached prefix | ~125% of input rate |
| `totalCacheReadTokens` | Every subsequent call that reads from the cache | ~10% of input rate |

In a typical multi-turn benchmark session, Claude Code's system prompt and tool definitions (~10K+ tokens) plus your task prompt and fixture code get cached after turn 1. Turns 2 onward read this from cache instead of paying full input rate. This means `totalCacheReadTokens` can easily be 10–50× larger than `totalInputTokens` in a multi-turn session — the bulk of context consumed is cheap cache reads.

The report shows tokens in two lines — a total with logical input/output, and a cache breakdown:
```
    Tokens     :  56,164 total  (in: 54,154  out: 2,010)
    Cache      :  52,859 read + 1,288 written  (7 uncached)
```

- `in: 54,154` is `totalLogicalInputTokens` — the actual context size (input + cache_read + cache_creation)
- `out: 2,010` is `totalOutputTokens` — tokens Claude generated
- `52,859 read` is `totalCacheReadTokens` — context served from cache
- `1,288 written` is `totalCacheCreationTokens` — context written to cache
- `7 uncached` is `totalInputTokens` — the tiny residual outside the cache prefix

If no caching occurred (e.g. a very short single-turn session), the Cache line is omitted:
```
    Tokens     :  6,030 total  (in: 4,210  out: 1,820)
```

When the SDK provides cost data, a Cost line appears:
```
    Cost       :  $0.0509
```

When tokens are 0 (SAST/command runs), the line simply shows `0`:
```
    Tokens     :  0
```

**Cost vs tokens:** The `N total` figure is *context consumed*, not cost. The `totalCostUsd` field (from the SDK's `SDKResultMessage.total_cost_usd`) is the actual cost, already accounting for the different billing rates of cached vs non-cached tokens and the specific model's pricing. Use `totalCostUsd` for cost comparisons; use `totalLogicalInputTokens` for context size comparisons.

Prompt caching activates automatically when the cacheable prefix is at least 1,024 tokens. Below that threshold `totalCacheReadTokens` and `totalCacheCreationTokens` will both be 0 even in multi-turn sessions.

---

### Per-Tool Token Estimates

The Anthropic API reports tokens at the *turn* level, not per individual tool call within a turn. To give per-tool token insight, the runner estimates token counts from content size in the `PostToolUse` hook:

```
inputTokensEst  = ceil(JSON.stringify(tool_input).length  / 4)
outputTokensEst = ceil(JSON.stringify(tool_result).length / 4)
```

The `/ 4` approximation is the standard rule-of-thumb for English text (one token ≈ 4 characters). These are labelled `(est)` in the report to indicate they are estimates, not exact API-measured values.

**What the estimates tell you:** Even as approximations, per-tool token estimates reveal which tools dominate context growth. A single `Read` call on a 500-line file returns ~2,500 estimated output tokens — that content lands in the next turn's input. Multiple such reads compound quickly and explain why `totalCacheReadTokens` grows as the session progresses.

`toolStats` aggregates these across all calls to the same tool:
```typescript
toolStats["Read"] = {
  count: 4,
  totalDurationMs: 44,
  totalInputTokensEst: 320,    // total tokens in Read parameters (filename strings)
  totalOutputTokensEst: 8240,  // total tokens in file contents returned
}
```

---

### Wall Time and Turns

- **`sessionDurationMs`** — measured from just before `query()` is called to when the async iterator returns. It includes all API round-trips, tool execution time, and any local processing. It is wall-clock time, not CPU time.

- **`totalTurns`** — the count of unique API calls made across the session, after deduplication (see [SDK Message Structure and Deduplication](#sdk-message-structure-and-deduplication)). This includes both the root session and any sub-agent sessions spawned via the `Agent` tool. A high turn count with low output tokens per turn suggests the agent is doing many small tool calls; a low turn count with high output tokens suggests longer reasoning blocks. Note: because sub-agent turns are included, `totalTurns` can exceed what you'd count from the console output alone.

- **Per-tool `durationMs`** — measured from the `PreToolUse` hook firing to the `PostToolUse` hook firing. For `Read`/`Grep`/`Glob` this is filesystem I/O time. For `Bash` it includes subprocess spin-up and command execution. For `Write`/`Edit` it is the disk write time.

---

### Sample Output — find-vulns Run

Runs are grouped by config with a banner header. Each run shows a progress counter and a label-aligned metric block. Annotations in `← ...` are for this doc only and do not appear in real output.

```
━━━ Config: Claude Sonnet 4.6 (no MCP) [1/2] ━━━━━━━━━━━━━━━━━━━━━━  ← bold cyan banner

  ▸ [1/2] JS App: Find Vulnerabilities 1                              ← bold task name + progress
    Score (F1) :  67%                                                  ← color-coded (green/yellow/red)
    Effort     :  high  (thinking: adaptive)                           ← effort level + thinking mode
    Recall     :  71%  (5/7 known vulns found)                         ← fraction of ground-truth vulns
    Precision  :  63%  (3 false positives)                             ← fraction of findings that were real
    Missed     :  js-xpowered-by-header-1, js-alloc...                 ← IDs of missed vulns (red)
    Time       :  40.3s
    Turns      :  5
    Files      :  1
    Tokens     :  56,164 total  (in: 54,154  out: 2,010)               ← logical input + output
    Cache      :  52,859 read + 1,288 written  (7 uncached)            ← cache breakdown
    Cost       :  $0.0509                                              ← session cost from SDK
    Tools      :  Bash 2x avg 101ms ~49 in / ~95 out · Read 1x avg 6ms ~18 in / ~428 out
```

**Reading the token lines:**
- `in: 54,154` — `totalLogicalInputTokens`: the actual context size the model processed (input + cache_read + cache_creation)
- `out: 2,010` — tokens Claude generated (reasoning + tool calls + final answer)
- `56,164 total` — logical input + output
- `52,859 read` — context tokens served from the prompt cache across turns 2–5
- `1,288 written` — context written into the prompt cache on turn 1
- `7 uncached` — non-cached input tokens (the tiny residual outside the cache prefix)
- `$0.0509` — actual session cost from the SDK, accounting for cached vs non-cached billing rates

**Reading the tools line:**
- `Bash 2x` — called 2 times
- `avg 101ms` — average wall-clock time per call
- `~49 in / ~95 out` — estimated tokens in parameters and results (this lands in context next turn)

---

### Sample Output — fix-vulns Run

```
  ▸ [3/4] JS App: Fix Vulnerabilities
    Score      :  80%
    Fixed      :  4/5 vulnerabilities
    Notes      :  Fixed SQL injection (parameterized queries), XSS (output escaping), path traversal
                  (realpath validation), and hardcoded credentials (env vars). Command injection fix
                  was incomplete — exec() replaced with spawn() but args still concatenated.
    Time       :  48.2s
    Turns      :  12
    Files      :  4
    Tokens     :  42,100 total  (in: 38,500  out: 3,600)
    Cache      :  28,900 read + 1,200 written  (8,400 uncached)
    Cost       :  $0.1284
    Tools      :  Read 6x avg 9ms · Edit 5x avg 22ms · Bash 2x avg 41ms · Glob 1x avg 6ms
```

Note the difference in tool usage: `Edit` calls dominate for fix tasks (high input tokens from before/after diff content, near-zero output), while `Read` dominates for find tasks.

---

### Sample Output — Summary Table

After all runs complete, `printSummaryTable()` prints a comparison. For find-vulns tasks, Recall and Precision columns are included. A Cost column appears when any run has cost data. Scores are color-coded (green >= 90%, yellow 70-89%, red < 70%).

**Single task, single repetition** — the simplest case:

```
══════════════════════════════════════════════════════════════════════
  BENCHMARK SUMMARY
══════════════════════════════════════════════════════════════════════

  Task                               Config      Score  Recall  Prec.  Tokens     Cost   Time
  ───────────────────────────────    ──────────  ─────  ──────  ─────  ──────  ───────  ─────
  js-project-tigerteam-find-vulns   sonnet-4-6    67%     71%    63%  56,164  $0.0509  40.3s
  js-project-tigerteam-find-vulns   snyk-code    100%    100%   100%       0        -   9.9s

  Avg by config:  sonnet-4-6  67%   |   snyk-code  100%
```

**Multiple tasks** — a headline section appears with macro-averaged scores per config:

```
══════════════════════════════════════════════════════════════════════
  BENCHMARK SUMMARY
══════════════════════════════════════════════════════════════════════

  Task                               Config      Score  Recall  Prec.   Tokens     Cost    Time
  ───────────────────────────────    ──────────  ─────  ──────  ─────  ───────  ───────  ──────
  js-project-tigerteam-find-vulns   sonnet-4-6    67%     71%    63%   56,164  $0.0509   40.3s
  js-project-tigerteam-find-vulns   snyk-code    100%    100%   100%        0        -    9.9s
  js-project-shadowfox-find-vulns   sonnet-4-6    78%     80%    76%   48,200  $0.0421   35.1s
  js-project-shadowfox-find-vulns   snyk-code     91%     91%    91%        0        -   10.2s

  Headline scores (macro-avg across fixtures):

  Config      Score  Recall  Prec.   Tokens     Cost    Time  Fixtures
  ──────────  ─────  ──────  ─────  ───────  ───────  ──────  ────────
  sonnet-4-6    73%     76%    70%   52,182  $0.0465   37.7s         2
  snyk-code     96%     96%    96%        0        -   10.1s         2
```

**With repetitions** (`--repetitions 3`) — per-fixture table shows means:

```
══════════════════════════════════════════════════════════════════════
  BENCHMARK SUMMARY
══════════════════════════════════════════════════════════════════════

  Per-fixture scores (mean of 3):

  Task                               Config      Score  Recall  Prec.   Tokens     Cost    Time
  ───────────────────────────────    ──────────  ─────  ──────  ─────  ───────  ───────  ──────
  js-project-tigerteam-find-vulns   sonnet-4-6    70%     74%    66%   55,800  $0.0498   39.8s
  js-project-tigerteam-find-vulns   snyk-code    100%    100%   100%        0        -    9.9s

  Headline scores (mean across repetitions):

  Config      Score  Recall  Prec.   Tokens     Cost    Time  Fixtures
  ──────────  ─────  ──────  ─────  ───────  ───────  ──────  ────────
  sonnet-4-6    70%     74%    66%   55,800  $0.0498   39.8s         1
  snyk-code    100%    100%   100%        0        -    9.9s         1
```

Reading across a row (same task, different configs) tells you which model/tool combination performs better and at what cost. Reading down a column (same config, different tasks) tells you how a given model handles different languages and vulnerability types. The headline section provides the single number per config that goes on comparison charts.

---

### Sample Output — JSONL Record

Each JSONL file contains three row types distinguished by `_type`. Raw run results come first, followed by task aggregates and config aggregates.

**Run row** (`_type: "run"`) — one per execution:

```json
{
  "_type": "run",
  "taskId": "js-project-tigerteam-find-vulns",
  "taskName": "JS App: Find Vulnerabilities 1",
  "runConfigId": "sonnet-4-6",
  "runConfigName": "Claude Sonnet 4.6 (no MCP)",
  "runConfigType": "model",
  "effort": "high",
  "thinking": { "type": "adaptive" },
  "score": 0.667,
  "timestamp": "2026-05-12T10:46:33.179Z",
  "repetition": 1,
  "totalRepetitions": 1,
  "metrics": {
    "sessionDurationMs": 40254,
    "totalInputTokens": 7,
    "totalOutputTokens": 2010,
    "totalCacheReadTokens": 52859,
    "totalCacheCreationTokens": 1288,
    "totalLogicalInputTokens": 54154,
    "totalCostUsd": 0.0508587,
    "totalTurns": 5,
    "toolCalls": [
      { "tool": "Bash", "durationMs": 171, "inputTokensEst": 25, "outputTokensEst": 24 },
      { "tool": "Bash", "durationMs": 31, "inputTokensEst": 24, "outputTokensEst": 71 },
      { "tool": "Read", "durationMs": 6, "inputTokensEst": 18, "outputTokensEst": 428 }
    ],
    "toolStats": {
      "Bash": { "count": 2, "totalDurationMs": 202, "totalInputTokensEst": 49, "totalOutputTokensEst": 95 },
      "Read": { "count": 1, "totalDurationMs": 6, "totalInputTokensEst": 18, "totalOutputTokensEst": 428 }
    },
    "filesScanned": ["/workspaces/snyk-vulnbench/fixtures/js-project-tigerteam/app.js"]
  },
  "details": {
    "agentFindings": [
      { "type": "sql-injection", "file": "app.js", "line": 24, "severity": "critical", "description": "..." },
      { "type": "xss", "file": "app.js", "line": 31, "severity": "high", "description": "..." }
    ],
    "truePositives": [
      { "id": "js-sqli-1", "type": "sql-injection", "severity": "critical" },
      { "id": "js-xss-1", "type": "xss", "severity": "high" },
      { "id": "js-path-traversal-1", "type": "path-traversal", "severity": "high" },
      { "id": "js-hardcoded-creds-1", "type": "hardcoded-credentials", "severity": "high" },
      { "id": "js-cmd-injection-1", "type": "command-injection", "severity": "critical" }
    ],
    "falsePositives": [
      { "id": "found-5", "type": "xss", "severity": "medium", "file": "app.js", "line": 47, "description": "..." }
    ],
    "falseNegatives": [
      { "id": "js-xpowered-by-header-1", "type": "information-exposure", "severity": "medium" },
      { "id": "js-allocation-of-resources-without-limits-or-throttling-2", "type": "allocation-of-resources-without-limits-or-throttling", "severity": "medium" }
    ],
    "precision": 0.625,
    "recall": 0.714,
    "byType": {
      "sql-injection": { "total": 1, "found": 1, "precision": 1.0, "recall": 1.0, "f1": 1.0 },
      "xss": { "total": 1, "found": 1, "precision": 0.5, "recall": 1.0, "f1": 0.667 },
      "information-exposure": { "total": 1, "found": 0, "precision": 0, "recall": 0, "f1": 0 }
    },
    "bySeverity": {
      "critical": { "total": 2, "found": 2, "precision": 1.0, "recall": 1.0, "f1": 1.0 },
      "high": { "total": 3, "found": 3, "precision": 0.75, "recall": 1.0, "f1": 0.857 },
      "medium": { "total": 2, "found": 0, "precision": 0, "recall": 0, "f1": 0 }
    }
  }
}
```

**Task-aggregate row** (`_type: "task-aggregate"`) — one per (task, config) pair, mean across repetitions:

```json
{
  "_type": "task-aggregate",
  "taskId": "js-project-tigerteam-find-vulns",
  "taskName": "JS App: Find Vulnerabilities 1",
  "runConfigId": "sonnet-4-6",
  "runConfigName": "Claude Sonnet 4.6 (no MCP)",
  "runConfigType": "model",
  "effort": "high",
  "thinking": { "type": "adaptive" },
  "repetitions": 1,
  "score": 0.667,
  "recall": 0.714,
  "precision": 0.625,
  "sessionDurationMs": 40254,
  "totalTokens": 56164,
  "totalCostUsd": 0.0508587
}
```

**Config-aggregate row** (`_type: "config-aggregate"`) — one per config, macro-averaged across all fixtures:

```json
{
  "_type": "config-aggregate",
  "runConfigId": "sonnet-4-6",
  "runConfigName": "Claude Sonnet 4.6 (no MCP)",
  "runConfigType": "model",
  "fixtureCount": 2,
  "score": 0.725,
  "recall": 0.757,
  "precision": 0.695,
  "sessionDurationMs": 37677,
  "totalTokens": 52182,
  "totalCostUsd": 0.0465
}
```

The JSONL file can be queried directly:
```bash
# Show all raw run scores
jq 'select(._type == "run") | .score' results/benchmark-*.jsonl

# Get headline scores per config (for charts)
jq 'select(._type == "config-aggregate") | {config: .runConfigId, score: .score, recall: .recall}' results/benchmark-*.jsonl

# Get per-fixture scores (with repetition averaging already applied)
jq 'select(._type == "task-aggregate") | {task: .taskId, config: .runConfigId, score: .score}' results/benchmark-*.jsonl

# Compare model vs SAST scores for the same task
jq 'select(._type == "run" and .taskId == "js-project-tigerteam-find-vulns") | {config: .runConfigId, type: .runConfigType, score: .score}' results/benchmark-*.jsonl

# Only model runs (exclude SAST tools)
jq 'select(._type == "run" and .runConfigType == "model")' results/benchmark-*.jsonl

# Only SAST tool runs
jq 'select(._type == "run" and .runConfigType == "command")' results/benchmark-*.jsonl

# Compare logical input tokens and cost across model configs
jq 'select(._type == "run" and .runConfigType == "model") | {config: .runConfigId, task: .taskId, tokens: .metrics.totalLogicalInputTokens, cost: .metrics.totalCostUsd}' results/benchmark-*.jsonl

# Find the most-used tool across all model runs
jq 'select(._type == "run" and .runConfigType == "model") | .metrics.toolStats | to_entries | max_by(.value.count) | .key' results/benchmark-*.jsonl

# Compare scores across effort levels for the same model
jq 'select(._type == "run" and .runConfigType == "model") | {config: .runConfigId, effort: .effort, thinking: .thinking.type, score: .score, cost: .metrics.totalCostUsd}' results/benchmark-*.jsonl

# Only high-effort runs
jq 'select(._type == "run" and .effort == "high")' results/benchmark-*.jsonl
```

---

## FAQ — Understanding Token and Cost Reports

### Q: How do I read the token counts? What does "7 uncached" mean? Where does my prompt and file content show up?

Here is the output from a real benchmark run:

```
━━━ Config: Claude Sonnet 4.6 (no MCP) [1/2] ━━━━━━━━━━━━━━━━━━━━━━━━

  ▸ [1/2] JS App: Find Vulnerabilities 1
    Score (F1)  :  67%
    Effort      :  high  (thinking: adaptive)
    Recall      :  71%  (5/7 known vulns found)
    Precision   :  63%  (3 false positives)
    Missed      :  js-xpowered-by-header-1, js-allocation-of-resources-without-limits-or-throttling-2
    Time        :  40.3s
    Turns       :  5
    Files       :  1
    Tokens      :  56,164 total  (in: 54,154  out: 2,010)
    Cache       :  52,859 read + 1,288 written  (7 uncached)
    Cost        :  $0.0509
    Tools       :  Bash 2x avg 101ms ~49 in / ~95 out · Read 1x avg 6ms ~18 in / ~428 out
```

Questions:
1. The cost is total? meaning it includes both input and output?
2. The cost is provided by CC directly? meaning that it is already accounting for the model of use etc?
3. On to the tokens/cache topic — can you break down the token counts and explain the meaning of it to me? What sort of insights can I learn from this that are useful for the benchmark? Why do we see again "7 uncached" — is that 7 tokens? What does it account for? What I'm trying to figure out for example is where does my prompt + the file contents fit into the tokens usage. Is that reflected in how we count tokens? in how we report?

**Answers:**

**1. Is the cost total (input + output)?**

Yes. `total_cost_usd` ($0.0509) comes directly from Claude Code's `SDKResultMessage`. It's the full session cost including all input tokens (at their respective rates — cached reads at 0.1x, cache writes at 1.25x, uncached at 1x) plus all output tokens. It also accounts for the specific model's pricing (Sonnet 4.6 in this case). We don't compute this ourselves — Claude Code does.

**2. Is the cost accounting for the model?**

Yes. Claude Code knows which model ran and applies the correct per-model pricing. If you ran the same task with Opus 4.6, the cost would be higher even for the same token counts because Opus has higher per-token rates.

**3. Token/cache breakdown explained:**

Here are the raw numbers from this run:

| Metric | Value | Meaning |
|---|---|---|
| `totalLogicalInputTokens` | **54,154** | Total context the model processed across all 5 turns |
| `totalOutputTokens` | **2,010** | Total tokens the model generated (tool calls + final analysis) |
| `totalCacheReadTokens` | **52,859** | Input tokens served from the prompt cache |
| `totalCacheCreationTokens` | **1,288** | Input tokens written to cache (first-time caching) |
| `totalInputTokens` | **7** | Input tokens that were neither cached nor cache-written |

The key insight is how these map to the **5 turns** in this session:

**Turn 1** (first API call): Claude Code sends the system prompt (~1,200+ tokens of our security audit instructions, but padded with Claude Code's own large system prompt and tool definitions) plus the user prompt. Nothing is cached yet, so most of this goes into `cache_creation` (1,288 tokens written to cache). A tiny handful (7 tokens) falls outside the cacheable prefix — likely a few framing tokens at the very end of the message that the API doesn't cache.

**Turns 2–5** (subsequent API calls): Each turn resends the entire conversation context (system prompt + tool definitions + conversation history so far). The system prompt and tool definitions are identical to turn 1, so they're served from the **cache** (contributing to the 52,859 cache-read total). Each successive turn also includes the growing conversation (previous tool calls and responses), which adds to the cache reads.

Now, about where **your prompt and app.js** fit:

- The **system prompt** (our `defaultSystemPrompt` — the "You are a security expert..." text) is ~200 tokens. But Claude Code wraps it inside its own massive system prompt (~10K+ tokens of tool definitions, instructions, etc.).
- The **user prompt** ("Audit all files in this directory...") is ~30 tokens.
- The **app.js file content** (~57 lines) is ~428 tokens (we can see this from `Read: outputTokensEst: 428`).

All of these are part of the 54,154 logical input total, but they're a small fraction of it. The bulk is Claude Code's own system prompt and tool definitions that get sent with every turn.

**What insights are useful for benchmarking?**

The token numbers tell you:

- **Context efficiency**: 52,859 / 54,154 = **97.6%** of input tokens were cache hits. This means the model's context is dominated by the static system prompt/tools that don't change between turns — your actual task content (prompt + code) is a small fraction.
- **Cost efficiency**: At $0.05 per run, the caching saves roughly ~90% versus what it would cost without caching (cache reads are 0.1x the base rate).
- **The "7 uncached" tokens**: These are a tiny residual that falls outside the cache boundary on each turn. The API caches contiguous prefixes from the start of the message, and anything after the last `cache_control` breakpoint is uncacheable. These 7 tokens are likely the tail end of one turn's message framing. They're essentially noise for benchmarking purposes.

What's **not** reflected in our token reporting today is a per-turn breakdown — we only see session totals. If you wanted to know "how many tokens did the app.js content add to the context," you'd need per-turn instrumentation, which the SDK doesn't expose.

---

## Adding Your Own Tasks and Configs

No source code changes required — the benchmark uses a directory-scanning loader. See [`docs/benchmark-management.md`](./benchmark-management.md) for the full guide, including field references, worked examples, and troubleshooting.

**Quick summary:**

- **New fixture:** create `fixtures/<name>/` with your vulnerable code, and a sibling `fixtures/<name>.json` as the answer key
- **New eval task:** drop a JSON file in `evals/tasks/<id>.json` with `id`, `name`, `category`, `fixture` fields
- **New model config:** append a `ModelRunConfig` entry to `evals/run-configs.json` (or omit `"type"` — it defaults to model)
- **New SAST config:** append a `CommandRunConfig` entry with `"type": "command"`, `"command"`, and `"parser"` fields
- **New SAST parser:** add a file to `src/parsers/` and register it in `src/parsers/index.ts`
- **Snyk `ruleId` → benchmark `type`:** when fixtures, Snyk versions, or comparisons suggest missing mappings, update **`mapRuleId()`** in **`src/parsers/snyk-code.ts`** (see [When to update `mapRuleId` (Snyk)](#when-to-update-mapruleid-snyk) and [`docs/benchmark-management.md`](./benchmark-management.md#maintaining-snyk-code-ruleid-mappings))

### Running a Specific Combination

```bash
# All tasks, all configs (the full matrix)
pnpm run benchmark

# Filter by category — run every task in that category across all configs
pnpm run benchmark -- --category find-vulns
pnpm run benchmark -- --category llm-find-vulns
pnpm run benchmark -- --category app-find-vulns
pnpm run benchmark -- --category fix-vulns

# Shorthand scripts for common categories
pnpm run benchmark:find    # equivalent to --category find-vulns
pnpm run benchmark:fix     # equivalent to --category fix-vulns

# Filter by a specific task (one row of the matrix), across all configs
pnpm run benchmark -- --task js-project-tigerteam-find-vulns

# Select multiple tasks by comma-separating them (no spaces)
pnpm run benchmark -- --task js-project-tigerteam-find-vulns,js-project-shadowfox-find-vulns

# Filter by a specific config (one column of the matrix), across all tasks
pnpm run benchmark -- --config opus-4-6

# Select multiple configs by comma-separating them (no spaces)
pnpm run benchmark -- --task js-project-tigerteam-find-vulns --config sonnet-4-6,snyk-code

# Combine multiple tasks and multiple configs
pnpm run benchmark -- --task js-project-tigerteam-find-vulns,js-project-shadowfox-find-vulns --config sonnet-4-6,snyk-code

# Combine filters — one task against one config (a single cell)
pnpm run benchmark -- --task js-project-tigerteam-find-vulns --config sonnet-with-snyk

# Combine category + config — all find-vulns tasks against one config
pnpm run benchmark -- --category find-vulns --config opus-4-6

# Run only LLM-specific tasks against a specific model
pnpm run benchmark -- --category llm-find-vulns --config sonnet-4-6

# Run only full-app tasks
pnpm run benchmark -- --category app-find-vulns

# Preview what would run without actually running anything
pnpm run benchmark -- --dry-run
pnpm run benchmark -- --category llm-find-vulns --dry-run

# Run each (task, config) pair 3 times to mitigate non-determinism
pnpm run benchmark -- --repetitions 3

# Combine repetitions with other filters
pnpm run benchmark -- --category find-vulns --config sonnet-4-6 --repetitions 3

# Repetitions default to 1 — omitting the flag gives existing behavior
```
