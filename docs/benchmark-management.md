# Benchmark Management Guide

How to add new eval tasks, new fixtures, and new run configs — without touching source code.

## Table of Contents

1. [How the Plugin Architecture Works](#how-the-plugin-architecture-works)
2. [Adding a New Eval Task — Step-by-Step](#adding-a-new-eval-task--step-by-step)
   - [Step 1 — Create the fixture directory](#step-1--create-the-fixture-directory)
   - [Step 2 — Write vulns.json](#step-2--write-vulnsjson)
   - [Step 3 — Drop a task JSON file](#step-3--drop-a-task-json-file)
   - [Step 4 — Run and verify](#step-4--run-and-verify)
3. [Task JSON Reference](#task-json-reference)
4. [Ground-Truth JSON Reference](#ground-truth-json-reference)
5. [Updating When You Add a New Vulnerability Type](#updating-when-you-add-a-new-vulnerability-type)
6. [Updating Run Configs](#updating-run-configs)
   - [Adding a new model config](#adding-a-new-model-config)
   - [Adding an MCP server config](#adding-an-mcp-server-config)
   - [How MCP tool permissions work](#how-mcp-tool-permissions-work)
   - [Adding a SAST command config](#adding-a-sast-command-config)
   - [Maintaining Snyk Code ruleId mappings](#maintaining-snyk-code-ruleid-mappings)
7. [Run Config JSON Reference](#run-config-json-reference)
8. [Worked Example: Adding a Ruby Fixture](#worked-example-adding-a-ruby-fixture)
9. [Troubleshooting](#troubleshooting)

---

## How the Plugin Architecture Works

The benchmark uses a **directory-scanning loader** (`src/evals/loader.ts`). At startup, it:

1. Reads every `*.json` file in `evals/tasks/` — each file is one eval task
2. Reads `evals/run-configs.json` — an array of model/tool configurations
3. For each task, loads `knownVulns` from the fixture's `vulns.json` automatically
4. Resolves the `category` field from its id against the `EVAL_CATEGORIES` registry

```
evals/
  tasks/
    js-find-vulns.json     ← scanned automatically
    js-fix-vulns.json      ← scanned automatically
    python-find-vulns.json ← scanned automatically
    your-new-task.json     ← just drop it here, no code changes
  run-configs.json         ← edit this array to add/change configs

fixtures/
  js-project-tigerteam.json  ← ground-truth answer key (outside agent's cwd)
  js-project-tigerteam/
    app.js                   ← agent's working directory
  your-new-fixture.json      ← ground-truth answer key for your fixture
  your-new-fixture/
    ...                    ← agent's working directory
```

**Adding a new task = create three files** (fixture dir + sibling ground-truth JSON + task descriptor). Adding a new run config = edit one JSON array.

---

## Adding a New Eval Task — Step-by-Step

### Step 1 — Create the fixture directory

Create a subdirectory under `fixtures/` containing your intentionally vulnerable code. The directory name is the fixture identifier you'll reference in the task JSON.

```
fixtures/
  ruby-vulns.json      ← ground-truth answer key (sibling, outside agent's cwd — see Step 2)
  ruby-vulns/          ← new directory
    app.rb             ← your vulnerable source file(s)
```

The fixture can contain any number of source files in any structure. The agent will receive the fixture directory as its working directory and will explore it freely.

**Guidelines for writing vulnerable fixtures:**

- Each vulnerability should be unambiguous and clearly exploitable (not a code smell or best-practice issue)
- Assign each vulnerability to a specific file and line number
- Keep the fixture realistic — it should look like code a developer might actually write, not a CTF puzzle
- Cover a mix of severity levels (`critical`, `high`, `medium`) to make scoring more informative
- Intentional vulnerabilities only — don't accidentally introduce real ones that aren't in `vulns.json`

---

### Step 2 — Write the ground-truth JSON

Create `fixtures/<your-fixture>.json` as a **sibling** to the fixture directory (not inside it). This is the **answer key** — the ground truth the scorer uses to determine whether the agent found or fixed each vulnerability. Keeping it outside the fixture directory prevents the agent from reading it and "cheating".

```json
{
  "description": "Intentionally vulnerable Sinatra app for security benchmark testing",
  "vulnerabilities": [
    {
      "id": "rb-sqli-1",
      "type": "sql-injection",
      "severity": "critical",
      "file": "app.rb",
      "line": 22,
      "description": "User input interpolated directly into SQL query string"
    },
    {
      "id": "rb-cmd-injection-1",
      "type": "command-injection",
      "severity": "critical",
      "file": "app.rb",
      "line": 38,
      "description": "User-controlled parameter passed to backtick shell execution"
    },
    {
      "id": "rb-path-traversal-1",
      "type": "path-traversal",
      "severity": "high",
      "file": "app.rb",
      "line": 51,
      "description": "User-supplied filename used with File.read without path validation"
    }
  ]
}
```

**The `id` field is what the scorer tracks.** Make each id **unique across the whole repo**, not only within one `fixtures/<name>.json` file. Benchmark results and spreadsheets often aggregate rows from many tasks; duplicate ids (e.g. the same `llm-xpowered-by-header` in two different fixtures) make history ambiguous and harder to join to ground truth. Prefer a **fixture-scoped prefix**: shorten the fixture directory name if needed (`llm-project-blackmirror` → `lbm-`, `js-project-purplehaze` → `jph-`) so every id is globally distinctive. Keep ids descriptive and stable — if you rename an id after runs, historical JSONL will no longer line up.

See the [Ground-Truth JSON Reference](#ground-truth-json-reference) for the full field list and valid values.

---

### Step 3 — Drop a task JSON file

Create a `.json` file in `evals/tasks/`. The filename determines alphabetical sort order (tasks are loaded in filename order) but otherwise doesn't matter. Convention: `<fixture>-<category>.json`.

**For a find-vulns task:**

```json
{
  "id": "ruby-find-vulns",
  "name": "Ruby App: Find Vulnerabilities",
  "category": "find-vulns",
  "fixture": "ruby-vulns",
  "maxTurns": 20
}
```

**For a fix-vulns task against the same fixture:**

```json
{
  "id": "ruby-fix-vulns",
  "name": "Ruby App: Fix Vulnerabilities",
  "category": "fix-vulns",
  "fixture": "ruby-vulns",
  "maxTurns": 30
}
```

The `fixture` field must exactly match the directory name under `fixtures/`. The `category` field must be one of the registered category ids (`"find-vulns"` or `"fix-vulns"`).

See the [Task JSON Reference](#task-json-reference) for all available fields.

---

### Step 4 — Run and verify

Use `--dry-run` to confirm the loader picks up your new task without running the agent:

```bash
pnpm run benchmark -- --dry-run
```

Expected output (exact counts depend on how many task JSON files exist):
```
Benchmark: N task(s) × M config(s) = N×M run(s)
  js-find-vulns  [find-vulns]
  ├─ opus-4-6: claude-opus-4-6
  └─ sonnet-4-6: claude-sonnet-4-6
  …
  ruby-find-vulns  [find-vulns]      ← your new task
  ├─ opus-4-6: claude-opus-4-6
  └─ sonnet-4-6: claude-sonnet-4-6
  ruby-fix-vulns  [fix-vulns]        ← your new task
  ├─ opus-4-6: claude-opus-4-6
  └─ sonnet-4-6: claude-sonnet-4-6
```

Run `pnpm run benchmark -- --dry-run` locally for current task and config counts.

If your task appears, run it for real:

```bash
# Just your new task, against a single config (fast for initial testing)
pnpm run benchmark -- --task ruby-find-vulns --config sonnet-4-6

# Against multiple specific configs (comma-separated, no spaces)
pnpm run benchmark -- --task ruby-find-vulns --config sonnet-4-6,snyk-code

# Both find and fix tasks in one run (comma-separated, no spaces)
pnpm run benchmark -- --task ruby-find-vulns,ruby-fix-vulns

# Both tasks across all configs
pnpm run benchmark -- --task ruby-find-vulns
pnpm run benchmark -- --task ruby-fix-vulns
```

If your task is find-vulns and you run it with a **`snyk-code`** (or other SARIF) command config, inspect the JSONL `details.agentFindings`: any finding whose `type` is `"other"` while Snyk clearly reported a real issue usually means **`mapRuleId` in `src/parsers/snyk-code.ts` needs extending** — see [Maintaining Snyk Code ruleId mappings](#maintaining-snyk-code-ruleid-mappings).

---

## Task JSON Reference

| Field | Required | Type | Description |
|---|---|---|---|
| `id` | Yes | `string` | Unique identifier. Used in `--task` CLI filter (supports comma-separated lists) and in result files. |
| `name` | Yes | `string` | Human-readable label shown in console output. |
| `category` | Yes | `"find-vulns"` \| `"llm-find-vulns"` \| `"app-find-vulns"` \| `"fix-vulns"` | Which eval category this task belongs to. |
| `fixture` | Yes | `string` | Subdirectory name under `fixtures/`. A sibling `fixtures/<name>.json` ground-truth file must exist. |
| `maxTurns` | No | `number` | Max agent conversation turns. Defaults to the run config's `maxTurns`. Recommended: 20 for find-vulns, 30 for fix-vulns. |
| `systemPrompt` | No | `string` | Overrides the category's default system prompt. Omit to use the default. |
| `prompt` | No | `string` | Overrides the category's default user prompt. Omit to use the default. |

**When to override prompts:** The category defaults work well for most fixtures. Override only if your fixture has special characteristics — e.g., a multi-file project where you want to give the agent explicit instructions about which directory to scan, or a task that requires domain-specific context.

Example with a custom prompt:

```json
{
  "id": "java-find-vulns",
  "name": "Java App: Find Vulnerabilities",
  "category": "find-vulns",
  "fixture": "java-vulns",
  "maxTurns": 25,
  "prompt": "Audit all Java source files in src/main/java for security vulnerabilities. Pay special attention to deserialization and JNDI injection patterns. Read all .java files carefully, then output your complete findings in the required JSON format."
}
```

---

## Ground-Truth JSON Reference

**File location:** `fixtures/<fixture-name>.json` — a sibling to the fixture directory, never inside it.

The top-level structure:

```json
{
  "description": "<human-readable description of the fixture>",
  "vulnerabilities": [ ... ]
}
```

Each entry in `vulnerabilities`:

| Field | Required | Type | Valid Values |
|---|---|---|---|
| `id` | Yes | `string` | **Globally unique** id, stable across runs (unique across every `fixtures/*.json`, not just within one file). Convention: `<fixture-scoped-prefix>-<type-or-role>-<number>` e.g. `rb-sqli-1` for a single Ruby fixture, or `llm2-sql-injection` / `js5-command-injection-5` when several fixtures share a language or theme so plain `llm-*` / `js-*` would collide. |
| `type` | Yes | `VulnType` | See table below |
| `severity` | Yes | `Severity` | `"critical"`, `"high"`, `"medium"`, `"low"` |
| `file` | Yes | `string` | Relative path from fixture root, e.g. `"app.rb"` or `"src/handlers/user.rb"` |
| `line` | No | `number` | Line number where the vulnerability occurs. Used for display, not for scoring. |
| `description` | Yes | `string` | One-sentence explanation of what makes this code vulnerable. |

**Valid `type` values:**

| Value | When to use |
|---|---|
| `"sql-injection"` | User input embedded in a SQL query (string concatenation, template, format string) |
| `"xss"` | Cross-site scripting — reflected HTML, unsafe DOM sinks (e.g. `innerHTML`), or unsafe rendering of LLM/tool output |
| `"path-traversal"` | User-controlled filename/path used to access files without sanitization |
| `"command-injection"` | User input passed to a shell command, exec, eval, or similar |
| `"hardcoded-credentials"` | API keys, passwords, DB credentials, session/signing secrets, or other embedded secrets |
| `"insecure-deserialization"` | Deserializing untrusted data with unsafe formats (pickle, Java ObjectInputStream, etc.) |
| `"idor"` | Insecure Direct Object Reference — accessing resources without authorization checks |
| `"xxe"` | XML External Entity injection via an XML parser |
| `"ssrf"` | Server-Side Request Forgery — user-controlled URL used in a server-side HTTP request |
| `"open-redirect"` | User-controlled redirect target without validation |
| `"information-exposure"` | Framework fingerprinting, verbose errors/stack traces, or HTTP/session surface issues that weaken confidentiality (e.g. `X-Powered-By`, session cookies missing `Secure`) |
| `"allocation-of-resources-without-limits-or-throttling"` | Endpoint performs expensive work without rate limiting, enabling DoS. Aliases: "resource exhaustion", "missing rate limiting", "denial of service" |
| `"csrf"` | Cross-Site Request Forgery — state-changing requests accepted without anti-CSRF tokens or equivalent |
| `"improper-type-validation"` | Untrusted input used as objects/properties without type checks (e.g. type confusion); distinct from prototype pollution |
| `"prototype-pollution"` | Unsafe merge or dynamic property paths that can pollute `Object.prototype` (Snyk: `javascript/PrototypePollution`, CWE-1321) |
| `"origin-validation-error"` | Overly permissive cross-origin policy (e.g. `Access-Control-Allow-Origin: *` with credentialed requests); Snyk labels this **Origin Validation Error** (`javascript/TooPermissiveCorsHeader`, CWE-942 / CWE-346) |
| `"other"` | Any vulnerability that doesn't fit the above categories |

**Scoring note:** The scorer matches findings by `type`. If your fixture has two SQL injections, give each its own entry with unique `id`s — they will be tracked and scored independently.

---

## Updating When You Add a New Vulnerability Type

If you use a `type` value in a ground-truth JSON that isn't already in the `VulnType` union, **three source files need updating**. The fixture JSON files include a `"_note"` field pointing here as a reminder.

### Step 1 — Add to `VulnType` in `src/types.ts`

`VulnType` is the authoritative enum for all valid type strings. Without this, the ground-truth JSON references an unrecognised value and the scorer can never produce a match.

```typescript
export type VulnType =
  | "sql-injection"
  | "xss"
  // ... existing values ...
  | "your-new-type"   // ← add here
  | "other";
```

### Step 2 — Add aliases in `src/scorer.ts`

The `normalizeVulnType` function maps free-text from the agent's output to `VulnType`. AI models use many phrasings for the same concept — without aliases, the scorer can't match a model saying "resource exhaustion" to a ground-truth entry typed `"allocation-of-resources-without-limits-or-throttling"`.

Add every likely alias you'd expect a model or security tool to use:

```typescript
const map: Record<string, VulnType> = {
  // ... existing entries ...
  "your-new-type": "your-new-type",       // exact match passthrough
  "common alias one": "your-new-type",    // what a model might say
  "common alias two": "your-new-type",
};
```

When in doubt, add more aliases rather than fewer — a false-positive match from a broad alias is scored the same as any other false positive.

### Step 3 — Add a pattern in `src/parsers/snyk-code.ts`

The Snyk parser maps SARIF **`ruleId`** strings (see `runs[].tool.driver.rules[]` and each `results[].ruleId` in `snyk code test --json`) to `VulnType`. Use the rule **`id`** (e.g. `javascript/PrototypePollution`) and, when helpful, the driver rule **`name`** or **`shortDescription.text`** to pick the benchmark type name. Without a matching pattern, Snyk findings for that rule fall to `"other"` and usually will not match ground truth, making Snyk recall look artificially low.

Add a regex pattern in `mapRuleId()`:

```typescript
if (/yourpattern|alternatepattern/.test(id)) return "your-new-type";
```

The `id` is already lowercased before this function runs. Check Snyk Code's actual rule IDs for your vulnerability class to write an accurate pattern. If you're unsure, add a broad pattern and refine it after a test run.

> If you add other SAST parsers in `src/parsers/`, update those too — each parser has its own rule ID mapping.

If the `VulnType` already exists and you only need Snyk to recognise a **new or renamed Snyk `ruleId`** (abbreviated ids, new CLI rules, or a new fixture that surfaces a class you already model in ground truth), you still edit `mapRuleId()` — you do **not** need Steps 1–2 or the checklist rows for `types.ts` / `normalizeVulnType` unless the *wording* agents use changed. See [Maintaining Snyk Code ruleId mappings](#maintaining-snyk-code-ruleid-mappings).

### Step 4 — Add to the valid types table in this doc

Add a row to the **Valid `type` values** table in [Ground-Truth JSON Reference](#ground-truth-json-reference) so other contributors know when to use the new type.

### Checklist

```
□ src/types.ts          — added to VulnType union
□ src/scorer.ts         — added exact match + common aliases to normalizeVulnType
□ src/parsers/snyk-code.ts  — added or updated `mapRuleId()` pattern for each relevant Snyk `ruleId`
□ docs/benchmark-management.md  — added row to valid type values table
```

---

## Updating Run Configs

Run configs live in `evals/run-configs.json` — a plain JSON array. Edit this file to add, remove, or modify configurations.

### Adding a new model config

Append an entry to the array:

```json
[
  {
    "id": "opus-4-6",
    "name": "Claude Opus 4.6 (no MCP)",
    "model": "claude-opus-4-6",
    "effort": "high",
    "maxTurns": 30
  },
  {
    "id": "sonnet-4-6",
    "name": "Claude Sonnet 4.6 (no MCP)",
    "model": "claude-sonnet-4-6",
    "effort": "high",
    "maxTurns": 30
  },
  {
    "id": "haiku-4-5",
    "name": "Claude Haiku 4.5 (cheapest)",
    "model": "claude-haiku-4-5",
    "effort": "high",
    "maxTurns": 20
  }
]
```

Both `effort` and `thinking` are optional — when omitted they default to `"high"` and `{ "type": "adaptive" }` respectively. Both values are captured in the JSONL result file for every run, enabling post-hoc comparisons across effort levels.

Verify with dry-run:
```bash
pnpm run benchmark -- --dry-run
# Should now show three config lines
```

Run only that config against all tasks:
```bash
pnpm run benchmark -- --config haiku-4-5
```

### Adding an MCP server config

MCP (Model Context Protocol) servers give the agent access to external tools — security scanners, static analysis engines, etc. This is the primary mechanism for comparing "bare" Claude vs Claude augmented with a security tool.

```json
{
  "id": "sonnet-with-semgrep",
  "name": "Claude Sonnet 4.6 + semgrep",
  "model": "claude-sonnet-4-6",
  "maxTurns": 30,
  "mcpServers": {
    "semgrep": {
      "command": "npx",
      "args": ["@semgrep/mcp"]
    }
  }
}
```

Another example — Snyk MCP with an API token from the environment:

```json
{
  "id": "sonnet-with-snyk",
  "name": "Claude Sonnet 4.6 + Snyk",
  "model": "claude-sonnet-4-6",
  "maxTurns": 30,
  "mcpServers": {
    "snyk": {
      "command": "npx",
      "args": ["snyk-mcp"],
      "env": {
        "SNYK_TOKEN": "${SNYK_TOKEN}"
      }
    }
  }
}
```

> **Note:** Environment variable interpolation in `env` values is handled by the Agent SDK at runtime. Make sure the variable is set in your shell before running.

### How MCP tool permissions work

The Agent SDK requires every tool the agent may call to be explicitly listed in `allowedTools`. MCP tools use the naming format `mcp__<server-name>__<tool-name>` — for example, a server named `"snyk"` exposing a `scan_file` tool becomes `mcp__snyk__scan_file`.

**You do not need to list these manually.** The runner (`src/runner.ts`) automatically derives a wildcard entry for every MCP server in the config:

```
mcpServers: { "snyk": { ... } }
→ allowedTools gets "mcp__snyk__*" added automatically
```

The wildcard `mcp__<server-name>__*` permits all tools that server exposes. This means adding a new MCP server to `run-configs.json` is sufficient — no changes to source code are needed.

**Tool name reference** (if you ever need to allow specific tools rather than all of them):

| Format | Effect |
|---|---|
| `mcp__snyk__*` | All tools from the `snyk` server |
| `mcp__snyk__scan_file` | Only the `scan_file` tool from `snyk` |

Restricting to specific tools (instead of the wildcard) is only worth doing if you want to measure the agent with a deliberately limited subset of an MCP server's capabilities.

To compare a bare model against the same model with an MCP tool, keep both configs and run them together:

```bash
pnpm run benchmark -- --config sonnet-4-6,sonnet-with-semgrep --category find-vulns
# Then compare their scores in results/
```

### Adding a SAST command config

A **command config** runs a CLI security scanner directly against the fixture and scores its output with the same precision/recall/F1 pipeline as model runs. This is how you compare "LLM agent vs classic SAST tool" in a single benchmark run.

```json
{
  "type": "command",
  "id": "snyk-code",
  "name": "Snyk Code SAST",
  "command": "snyk code test {fixturePath} --json",
  "parser": "snyk-code"
}
```

The `{fixturePath}` placeholder is substituted at runtime with the absolute path to the fixture directory. The `parser` value must match a key registered in `src/parsers/index.ts`.

**How it works end-to-end:**

1. The benchmark runner executes the command with `{fixturePath}` replaced
2. stdout is passed to the named parser function, which maps the tool's JSON output to the common `FindingRecord[]` format
3. Those findings are serialised as a `FINDINGS_JSON:` block — the same format model runs produce
4. The existing scorer runs: precision/recall/F1 against the fixture's ground-truth JSON
5. The result lands in the JSONL file with `"runConfigType": "command"` so you can filter SAST vs model rows

**Adding a new SAST tool** requires two steps, both in source:

1. Add `src/parsers/<tool-name>.ts` — a function `(stdout: string) => FindingRecord[]` that maps the tool's output format to the common schema
2. Register it in `src/parsers/index.ts`:
   ```typescript
   import { parseMyToolOutput } from "./my-tool.js";
   const PARSERS = {
     "snyk-code": parseSnykCodeOutput,
     "my-tool": parseMyToolOutput,   // ← add this line
   };
   ```
3. Add the config entry to `evals/run-configs.json` with `"parser": "my-tool"`

**Important:** Command configs only work with find-vulns tasks. SAST tools produce findings but don't modify code — they are automatically skipped (with an error result) if paired with a fix-vulns task. The summary table will still show the row; look for `error` in the JSONL record to identify it.

**Running the comparison:**

```bash
# Compare Snyk Code SAST against Sonnet on the same task
pnpm run benchmark -- --task js-project-tigerteam-find-vulns --config sonnet-4-6,snyk-code

# Run SAST against all find-vulns tasks
pnpm run benchmark -- --category find-vulns --config snyk-code
```

### Maintaining Snyk Code ruleId mappings

Snyk Code’s `snyk code test --json` output is SARIF. Each finding’s tool rule is identified by the **`ruleId`** string on each `runs[0].results[]` entry (see [`parseSnykCodeOutput` docblock](../src/parsers/snyk-code.ts) and [Command configs and Snyk Code (SAST)](./benchmark.md#command-configs-and-snyk-code-sast) in `docs/benchmark.md`). The benchmark maps that string to our shared finding `type` (a `VulnType`) inside **`mapRuleId()`** in **`src/parsers/snyk-code.ts`**. Scoring then matches findings to ground truth **by `type` only** — if `mapRuleId` returns `"other"` for a real Snyk rule, recall against `fixtures/<name>.json` will look artificially low even though the scanner found the issue.

**Update `mapRuleId` whenever:**

| Trigger | Why |
|---|---|
| **New fixture or new vulnerable code** in an existing fixture | Snyk may emit `ruleId`s you have never seen in this repo (including abbreviated ids such as `javascript/OR`, `javascript/PT`, `javascript/Sqli`). |
| **Upgrading the Snyk CLI** or lockfile / ruleset | Rule ids or naming can shift; a previously matched id can change spelling. |
| **`snyk-code` vs model comparison looks wrong** | e.g. many `details.agentFindings` with `"type": "other"`, or Snyk recall much lower than expected for a fixture you know Snyk flags. |
| **New command config** that reuses the **`snyk-code`** parser | Same mapping file applies; no extra registration step beyond `run-configs.json`. |
| **New SAST parser** (`"parser": "something-else"`) | Implement rule→`type` mapping in that parser’s module — not in `snyk-code.ts`. |

**Workflow (recommended):**

1. Run Snyk against the fixture directory (same as the benchmark):  
   `snyk code test fixtures/<your-fixture>/ --json`  
   (or save stdout from a failed-exit run — findings are still on stdout).
2. Collect distinct `ruleId` values, e.g. **JSONPath** `$.runs[0].results[*].ruleId`, or `jq -r '.runs[0].results[]? | .ruleId' snyk-output.json` (dedupe with `sort -u` as needed).
3. For each id, mentally lower-case it (that is what `mapRuleId` receives) and see which **`if (/…/)`** branch in `mapRuleId` should own it.
4. Add or extend a regex (prefer a **comment** naming the canonical Snyk id, e.g. `javascript/DisablePoweredBy`, for the next maintainer). Match **before** overly broad patterns when order matters (e.g. `domxss` before generic `xss`).
5. Re-run the benchmark with `--config snyk-code` (and your task filter) and confirm JSONL findings use the expected `type` strings aligned with **`fixtures/<name>.json`** `vulnerabilities[].type`.

**New `VulnType`:** follow [Updating When You Add a New Vulnerability Type](#updating-when-you-add-a-new-vulnerability-type) (types, `normalizeVulnType`, `mapRuleId`, and this doc’s type table). **Existing type, new Snyk id:** usually **`src/parsers/snyk-code.ts` only** plus verification.

---

## Run Config JSON Reference

Each entry in `evals/run-configs.json` is one of two shapes depending on `"type"`.

### Model config fields (`type` absent or `"model"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | No | `"model"` | Identifies this as a model config. Omitting it defaults to `"model"`. |
| `id` | Yes | `string` | Unique identifier. Used in `--config` CLI filter. |
| `name` | Yes | `string` | Human-readable label shown in console output and result files. |
| `model` | Yes | `string` | Anthropic model ID, e.g. `"claude-opus-4-6"`, `"claude-sonnet-4-6"`, `"claude-haiku-4-5"`. |
| `effort` | No | `"low"` \| `"medium"` \| `"high"` \| `"max"` | Reasoning effort level. Defaults to `"high"`. `"max"` is Opus 4.6 only. |
| `thinking` | No | `ThinkingConfig` | Extended thinking mode. Defaults to `{ "type": "adaptive" }`. Options: `{ "type": "adaptive" }`, `{ "type": "enabled", "budgetTokens": N }`, `{ "type": "disabled" }`. |
| `maxTurns` | No | `number` | Max conversation turns for this config. Overridden per-task by the task's `maxTurns` if set. |
| `mcpServers` | No | `object` | Map of MCP server name → `MCPServerConfig`. Omit for a bare model run. |

### Command config fields (`type: "command"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | Yes | `"command"` | Identifies this as a SAST/CLI tool config. |
| `id` | Yes | `string` | Unique identifier. Used in `--config` CLI filter. |
| `name` | Yes | `string` | Human-readable label shown in console output and result files. |
| `command` | Yes | `string` | Command template. Use `{fixturePath}` as a placeholder for the fixture directory path. |
| `parser` | Yes | `string` | Parser key from the registry in `src/parsers/index.ts` (e.g. `"snyk-code"`). |

Command configs only support find-vulns tasks. They produce `"runConfigType": "command"` in JSONL output and have zeroed token/turn metrics (only `sessionDurationMs` and `filesScanned` are populated).

### MCPServerConfig fields

| Field | Required | Type | Description |
|---|---|---|---|
| `command` | Yes | `string` | The executable to run (e.g. `"npx"`, `"uvx"`, `"/path/to/server"`). |
| `args` | No | `string[]` | Arguments passed to the command. |
| `env` | No | `object` | Environment variables to set for the server process. |

---

## Worked Example: Adding a Ruby Fixture

Here is the full sequence for adding a Ruby/Sinatra fixture with two eval tasks (find + fix).

**Files to create:**

```
fixtures/ruby-vulns.json            ← ground truth (sibling, outside agent's cwd)
fixtures/ruby-vulns/app.rb          ← vulnerable Sinatra app
evals/tasks/ruby-find-vulns.json    ← find task descriptor
evals/tasks/ruby-fix-vulns.json     ← fix task descriptor
```

**`fixtures/ruby-vulns.json`:**
```json
{
  "description": "Intentionally vulnerable Sinatra app",
  "vulnerabilities": [
    {
      "id": "rb-sqli-1",
      "type": "sql-injection",
      "severity": "critical",
      "file": "app.rb",
      "line": 22,
      "description": "User input interpolated directly into SQL query string"
    },
    {
      "id": "rb-cmd-injection-1",
      "type": "command-injection",
      "severity": "critical",
      "file": "app.rb",
      "line": 38,
      "description": "User-controlled parameter passed to backtick shell execution"
    }
  ]
}
```

**`evals/tasks/ruby-find-vulns.json`:**
```json
{
  "id": "ruby-find-vulns",
  "name": "Ruby App: Find Vulnerabilities",
  "category": "find-vulns",
  "fixture": "ruby-vulns",
  "maxTurns": 20
}
```

**`evals/tasks/ruby-fix-vulns.json`:**
```json
{
  "id": "ruby-fix-vulns",
  "name": "Ruby App: Fix Vulnerabilities",
  "category": "fix-vulns",
  "fixture": "ruby-vulns",
  "maxTurns": 30
}
```

**Verify and run:**
```bash
# Confirm both tasks appear
pnpm run benchmark -- --dry-run

# Run find task with one model to sanity-check scoring
pnpm run benchmark -- --task ruby-find-vulns --config sonnet-4-6

# Compare model against SAST on the same fixture (comma-separated, no spaces)
pnpm run benchmark -- --task ruby-find-vulns --config sonnet-4-6,snyk-code

# Run both tasks for your new fixture in one run (comma-separated)
pnpm run benchmark -- --task ruby-find-vulns,ruby-fix-vulns
```

That's it. No source code changes required.

---

## Troubleshooting

**"Cannot read tasks directory"**
- Confirm `evals/tasks/` exists and contains at least one `.json` file.

**"Failed to parse task file ..."**
- Your task JSON has a syntax error. Validate it with `node -e "JSON.parse(require('fs').readFileSync('evals/tasks/your-file.json', 'utf8'))"`.

**"Unknown category id ..."**
- The `category` field in your task JSON must be exactly `"find-vulns"` or `"fix-vulns"` (lowercase, hyphenated).

**"Failed to read vulns.json for fixture ..."**
- The `fixture` field in your task JSON doesn't match a ground-truth file under `fixtures/`.
- Make sure `fixtures/<your-fixture>.json` exists (as a sibling to the fixture directory, not inside it).

**"`vulnerabilities` must be an array"**
- Your `vulns.json` is missing the top-level `"vulnerabilities"` key, or it's not an array.

**Duplicate vulnerability `id`s in different fixture JSON files**
- The loader does not enforce global uniqueness, but you should still use distinct ids across every `fixtures/*.json`. Reusing the same id in two fixtures (e.g. two apps both using `llm-xpowered-by-header`) confuses aggregated results and fix-judge notes. Prefix ids with a short fixture token (`llm2-`, `js5-`, etc.).

**Task appears in dry-run but scores 0 / recall 0**
- The agent ran but found nothing. Check that your fixture's vulnerable code is genuinely readable by the agent (no encoding issues, file permissions, etc.).
- Check that the `type` values in `vulns.json` exactly match the valid `VulnType` strings — a typo here means no match.

**"No matching tasks found. Available: ..."**
- The `--task` id(s) you passed don't match any loaded task. Multiple tasks are comma-separated: `--task js-project-tigerteam-find-vulns,js-project-shadowfox-find-vulns` (no spaces around the comma). Run `--dry-run` to see what ids are loaded.

**"No matching configs found for '...'. Available: ..."**
- The `--config` value(s) you passed don't match any entry in `evals/run-configs.json`. Multiple configs are comma-separated: `--config sonnet-4-6,snyk-code` (no spaces around the comma).

**Command config produces score 0 with an error on a fix-vulns task**
- This is expected — command configs (SAST tools) only support find-vulns. Pair a SAST config only with find-vulns tasks, or run `--category find-vulns --config snyk-code` to automatically skip fix-vulns tasks.

**`Unknown parser "..."` error when running a command config**
- The `"parser"` value in your config entry doesn't match any key in `src/parsers/index.ts`. Add the parser there before using it in `run-configs.json`.
