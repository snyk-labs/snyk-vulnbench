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
7. [Serving HTML Benchmark Reports](#serving-html-benchmark-reports)
8. [Run Config JSON Reference](#run-config-json-reference)
9. [Worked Example: Adding a Ruby Fixture](#worked-example-adding-a-ruby-fixture)
10. [Troubleshooting](#troubleshooting)

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
  js-project-tigerteam/
    project/                 ← agent's working directory
      app.js
    fixture.json             ← project metadata and provenance
    findings.json            ← ground-truth answer key (outside agent's cwd)
  app-project-halloween/
    project/                 ← application source
    fixture.json             ← project metadata and provenance
    findings.json            ← VulnBench 1.0 answer key
    findings-attacker-reachable.json ← VulnBench 2.0 answer key
  your-new-fixture/
    project/                 ← agent's working directory
      ...
    fixture.json             ← project metadata and provenance
    findings.json            ← ground-truth answer key
```

**Adding a new task = create a fixture directory** (with `project/` source code, `fixture.json`, and a ground-truth file) **+ a task descriptor**. VulnBench 1.0 uses `findings.json`; attacker-reachable VulnBench 2.0 tasks use `findings-attacker-reachable.json`. Adding a new run config = edit one JSON array.

---

## Adding a New Eval Task — Step-by-Step

### Step 1 — Create the fixture directory

Create a subdirectory under `fixtures/` with a `project/` subdirectory containing the source code. The directory name is the fixture identifier you'll reference in the task JSON.

```
fixtures/
  ruby-project-garnet/           ← new fixture directory
    project/                     ← agent's working directory
      app.rb                     ← your source file(s)
    findings.json                ← ground-truth answer key (see Step 2)
```

The `project/` subdirectory can contain any number of source files in any structure. The agent will receive `project/` as its working directory and will explore it freely. The `fixture.json` and findings files sit outside `project/` so the agent cannot read benchmark metadata or answer keys.

### Fixture metadata manifest

Create `fixtures/<your-fixture>/fixture.json` beside the ground-truth file. This manifest is the source of truth for project-level metadata and is loaded automatically by `src/evals/loader.ts`.

```json
{
  "schemaVersion": 1,
  "id": "ruby-project-garnet",
  "name": "Garnet Ruby Service",
  "kind": "api-service",
  "languages": ["ruby"],
  "frameworks": ["sinatra"],
  "runtimes": [{ "name": "ruby", "version": "3.3" }],
  "datastores": ["postgresql"],
  "source": {
    "repository": "https://github.com/example/garnet",
    "baseCommit": "abc123"
  },
  "provenance": {
    "origin": "real-repository",
    "seeded": true,
    "seedCommit": "def456"
  },
  "todos": []
}
```

Use controlled, lowercase values in `languages`, `frameworks`, and `datastores` so results can be sliced consistently. Only record facts that can be verified from the fixture; use `todos` for unknown repository, revision, runtime, or seeding information, and omit it once all questions are resolved. Keep project metadata here, vulnerability metadata in `findings*.json`, and task behavior in `evals/tasks/*.json`.

**Guidelines for writing fixtures:**

- Each vulnerability should be unambiguous and clearly exploitable (not a code smell or best-practice issue)
- Assign each vulnerability to a specific file and line number
- Keep the fixture realistic — it should look like code a developer might actually write, not a CTF puzzle
- Cover a mix of severity levels (`critical`, `high`, `medium`) to make scoring more informative
- Intentional vulnerabilities only — don't accidentally introduce real ones that aren't in `findings.json`

---

### Step 2 — Write the ground-truth JSON

Create `fixtures/<your-fixture>/findings.json` inside the fixture directory (but outside `project/`). This is the **answer key** — the ground truth the scorer uses to determine whether the agent found or fixed each vulnerability. The agent's `cwd` is set to `project/`, and `denyRead` blocks the parent directory, so the agent cannot read this file.

These files are parsed as JSON with Comments (JSONC), so they may contain `//` and `/* ... */` comments and trailing commas.

```json
{
  "description": "Sinatra app for security benchmark testing",
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

**The `id` field is what the scorer tracks.** Make each id **unique across the whole repo**, not only within one `fixtures/<name>/findings.json` file. Benchmark results and spreadsheets often aggregate rows from many tasks; duplicate ids (e.g. the same `llm-xpowered-by-header` in two different fixtures) make history ambiguous and harder to join to ground truth. Prefer a **fixture-scoped prefix**: shorten the fixture directory name if needed (`llm-project-blackmirror` → `lbm-`, `js-project-purplehaze` → `jph-`) so every id is globally distinctive. Keep ids descriptive and stable — if you rename an id after runs, historical JSONL will no longer line up.

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

The `fixture` field must exactly match the directory name under `fixtures/`. The `category` field must be one of the registered category ids. For VulnBench 2.0, use `"category": "attacker-reachable-find-vulns"` and `"groundTruth": "attacker-reachable"`; omitting `groundTruth` preserves the V1 default.

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

# Run with 3 repetitions to verify score stability
pnpm run benchmark -- --task ruby-find-vulns --config sonnet-4-6 --repetitions 3
```

If your task is find-vulns and you run it with a **`snyk-code`** (or other SARIF) command config, inspect the JSONL `details.agentFindings`: any finding whose `type` is `"other"` while Snyk clearly reported a real issue usually means **`mapRuleId` in `src/parsers/snyk-code.ts` needs extending** — see [Maintaining Snyk Code ruleId mappings](#maintaining-snyk-code-ruleid-mappings).

---

## Task JSON Reference

| Field | Required | Type | Description |
|---|---|---|---|
| `id` | Yes | `string` | Unique identifier. Used in `--task` CLI filter (supports comma-separated lists) and in result files. |
| `name` | Yes | `string` | Human-readable label shown in console output. |
| `category` | Yes | `"find-vulns"` \| `"llm-find-vulns"` \| `"app-find-vulns"` \| `"attacker-reachable-find-vulns"` \| `"fix-vulns"` | Which eval category this task belongs to. |
| `fixture` | Yes | `string` | Subdirectory name under `fixtures/`. Must contain `project/` and the selected ground-truth file. |
| `groundTruth` | No | `"v1"` \| `"attacker-reachable"` | Ground-truth schema and scoring pipeline. Defaults to `"v1"` and `findings.json`; attacker-reachable loads `findings-attacker-reachable.json`. |
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

**File location:** `fixtures/<fixture-name>/findings.json` — inside the fixture directory but outside `project/`, so the agent cannot access it.

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
| `id` | Yes | `string` | **Globally unique** id, stable across runs (unique across every `fixtures/*/findings.json`, not just within one file). Convention: `<fixture-scoped-prefix>-<type-or-role>-<number>` e.g. `rb-sqli-1` for a single Ruby fixture, or `llm2-sql-injection` / `js5-command-injection-5` when several fixtures share a language or theme so plain `llm-*` / `js-*` would collide. |
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
| `"code-injection"` | User input reaches JavaScript code execution primitives such as `eval` (Snyk: `javascript/CodeInjection`) |
| `"hardcoded-credentials"` | API keys, passwords, DB credentials, session/signing secrets, or other embedded secrets |
| `"insecure-deserialization"` | Deserializing untrusted data with unsafe formats (pickle, Java ObjectInputStream, etc.) |
| `"idor"` | Insecure Direct Object Reference — accessing resources without authorization checks |
| `"xxe"` | XML External Entity injection via an XML parser |
| `"ssrf"` | Server-Side Request Forgery — user-controlled URL used in a server-side HTTP request |
| `"open-redirect"` | User-controlled redirect target without validation |
| `"information-exposure"` | Framework fingerprinting, verbose errors/stack traces, or HTTP/session surface issues that weaken confidentiality (e.g. `X-Powered-By`, session cookies missing `Secure`) |
| `"allocation-of-resources-without-limits-or-throttling"` | Endpoint performs expensive work without rate limiting, enabling DoS. Aliases: "resource exhaustion", "missing rate limiting", "denial of service" |
| `"csrf"` | Cross-Site Request Forgery — state-changing requests accepted without anti-CSRF tokens or equivalent |
| `"redos"` | Regular Expression Denial of Service from vulnerable patterns with excessive backtracking (Snyk: `javascript/reDOSPolynomial`) |
| `"improper-code-sanitization"` | User-controlled data reaches dynamic code execution after ineffective sanitization, often through `eval` (Snyk: `javascript/ImproperCodeSanitization`) |
| `"improper-type-validation"` | Untrusted input used as objects/properties without type checks (e.g. type confusion); distinct from prototype pollution |
| `"insecure-transport"` | Sensitive HTTP service or redirect flow uses plaintext HTTP where HTTPS is expected (Snyk: `javascript/HttpToHttps`) |
| `"insecure-cryptography"` | Broken or risky cryptographic algorithm, such as DES (Snyk: `java/InsecureCipher`, CWE-327) |
| `"prototype-pollution"` | Unsafe merge or dynamic property paths that can pollute `Object.prototype` (Snyk: `javascript/PrototypePollution`, CWE-1321) |
| `"origin-validation-error"` | Overly permissive cross-origin policy (e.g. `Access-Control-Allow-Origin: *` with credentialed requests); Snyk labels this **Origin Validation Error** (`javascript/TooPermissiveCorsHeader`, CWE-942 / CWE-346) |
| `"mass-assignment"` | User-controlled object properties are bound to sensitive model fields without an allowlist |
| `"template-injection"` | User-controlled content is evaluated or rendered in a template context without appropriate escaping |
| `"other"` | Any vulnerability that doesn't fit the above categories |

**Scoring note:** The scorer matches findings by `type`. If your fixture has two SQL injections, give each its own entry with unique `id`s — they will be tracked and scored independently.

### VulnBench 2.0 attacker-reachable ground truth

**File location:** `fixtures/<fixture-name>/findings-attacker-reachable.json`. Like V1 ground truth, this is parsed as JSONC and must remain outside `project/`.

Select it from a dedicated find task:

```json
{
  "id": "my-app-attacker-reachable-find-vulns",
  "name": "My App: Find Attacker-Reachable Vulnerabilities",
  "category": "attacker-reachable-find-vulns",
  "fixture": "my-app",
  "groundTruth": "attacker-reachable"
}
```

Each `vulnerabilities` entry uses the following shape:

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | Yes | `string` | Stable, globally distinctive vulnerability id |
| `type` | Yes | `VulnType` | Canonical vulnerability label |
| `typeAliases` | No | `string[]` | Conservative alternate labels accepted during type matching |
| `severity` | Yes | `Severity` | `"critical"`, `"high"`, `"medium"`, or `"low"` |
| `filesRelated` | Yes | `{ "file": string, "line": number, "type"?: "source" \| "sink" }[]` | Non-empty source-to-sink locations; paths are relative to `project/`. Mark endpoint locations as `source` and `sink`; intermediate locations omit `type`. A one-location flow marks its sole location as either endpoint type. Multiple sources or sinks are alternative acceptable anchors for that endpoint role, not mandatory independent nodes. |
| `description` | Yes | `string` | Explanation of the vulnerability and flow |
| `vulnerabilityImpact` | Yes | `string` | Security impact of successful exploitation |
| `codeFlowMultiLine` | Yes | `"yes"` \| `"no"` | Whether the flow spans multiple locations. It must agree with `filesRelated`. |
| `codeFlowCrossFile` | Yes | `"yes"` \| `"no"` | Whether locations span multiple files. It must agree with `filesRelated`. |
| `codeFlowCrossService` | No | `"yes"` \| `"no"` | Preserved when present, but currently out of scope for scoring |

The V2 primary score is **Attacker-Reachable Vulnerability Recall**: the fraction of independently curated attacker-reachable vulnerabilities matched under the active endpoint-localization policy. Matching requires a type match against `type` or `typeAliases` plus endpoint evidence. Paths match by normalized relative path, normalized suffix, or a bare basename; lines allow an inclusive ±2 tolerance. For one ground-truth location, one match to its `source` or `sink` is enough. For exactly two locations, either both locations or either labeled endpoint may match. For longer flows, distinct reported locations must match both a labeled `source` and a labeled `sink`; intermediate locations are diagnostic and do not raise the headline threshold. Precision and lenient endpoint-localized F1 are retained as secondary metrics.

Each V2 run persists a complete scoring trace at `details.matchDiagnostics` and a complementary `details.scoreSuite` in its JSONL run row. The trace includes every reported-finding × ground-truth candidate, all type-label and location-pair comparisons, endpoint evidence, path match modes, signed/absolute line deltas, compact source-and-sink/sink-only/source-only evidence classes, explicit all/available candidate ranks, eligibility/selection state, and finding/vulnerability outcomes with structured failure reasons. `scoreSuite` records secondary lenient endpoint-localized F1, strict exact-line flow F1, source/sink endpoint recall, tolerant full-flow overlap, and detection-only F1. See [`docs/benchmark.md` → V2 score suite](./benchmark.md#v2-score-suite) for the complete semantics.

Aggregate JSONL rows preserve `groundTruth` and `primaryMetric`. Each `config-aggregate` has `groundTruths` plus a `byGroundTruth` metric breakdown. When selected tasks mix unlike primary metrics, the top-level quality headline is null; reports must use the generation-specific breakdown rather than averaging V1 F1 with V2 recall.

The live V2 inventory is discovered from
`evals/tasks/*-attacker-reachable-find-vulns.json`; each referenced fixture must
contain `findings-attacker-reachable.json`. Do not maintain a hard-coded fixture
list in documentation—the task directory is authoritative as the corpus grows.

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

Both `effort` and `thinking` are optional — when omitted they default to `"high"` and `{ "type": "adaptive" }` respectively. Set `"effort": "default"` to omit the Agent SDK effort option and let Claude Code choose the model's native behavior; use this for models without configurable effort. Both values are captured in the JSONL result file for every run, enabling post-hoc comparisons across effort levels.

`promptTemplateId` is optional and defaults to `"default"`, which leaves the task's user prompt unchanged. Templates may append instructions or replace the user prompt while preserving the task's system prompt. Use `"snyk-mcp"` only for an MCP-backed run. `"security-review"` is Claude Code-only and replaces the user prompt with `/security-review`; incompatible runner/template combinations are rejected during config loading. Because that built-in command reviews a Git branch diff, the harness prepares its temporary fixture copy with an empty `origin/HEAD` baseline and commits the whole project as the branch change; fixture sources remain untouched.

To use Codex CLI instead of the default Claude Code runner, set `runner` and an explicit timeout:

```json
{
  "id": "codex-luna-high",
  "name": "Codex GPT-5.6 Luna High",
  "runner": "codex-cli",
  "model": "gpt-5.6-luna",
  "effort": "high",
  "timeoutMs": 1800000
}
```

Codex runs through the pinned native CLI, not a direct model call. The harness sends prompts on stdin and parses JSONL. On Linux, the full Codex/MCP process tree runs under an outer Landlock allowlist. Before any paid request, a model-free probe verifies that Codex can read the isolated project but cannot read a sibling path. Unsupported hosts fail closed.

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

MCP (Model Context Protocol) servers give general coding agents access to external tools. Both Claude Code and Codex CLI support declared MCP servers; DeepSec intentionally does not.

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

Another example — Snyk MCP with credentials read from the repository-root `.env` file:

```json
{
  "id": "haiku-with-snyk",
  "name": "Claude Haiku 4.5 + Snyk MCP (default effort)",
  "model": "claude-haiku-4-5",
  "effort": "default",
  "promptTemplateId": "snyk-mcp",
  "maxTurns": 30,
  "mcpServers": {
    "Snyk": {
      "command": "npx",
      "args": ["-y", "snyk@latest", "mcp", "-t", "stdio"],
      "env": {
        "SNYK_TOKEN": "${SNYK_TOKEN}",
        "SNYK_CFG_ORG": "${SNYK_CFG_ORG}"
      }
    }
  }
}
```

> **Note:** The harness starts benchmarks in an isolated worker. For every key declared in the ignored root `.env`, that file overrides an inherited shell value before `${NAME}` values are resolved for the MCP process. Other runtime variables, including `PATH`, `HOME`, and Claude OAuth configuration, are preserved. Missing variables fail the run with the variable name, never its value.

### How MCP tool permissions work

The Agent SDK requires every tool the agent may call to be explicitly listed in `allowedTools`. MCP tools use the naming format `mcp__<server-name>__<tool-name>` — for example, a server named `"snyk"` exposing a `scan_file` tool becomes `mcp__snyk__scan_file`.

**You do not need to list these manually.** The Claude runner derives an allowed-tool wildcard. The Codex runner replaces the effective MCP map with only declared servers, forwards exact `${NAME}` references by environment name, marks servers required, and relies on the same outer Landlock boundary inherited by the MCP subprocess.

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
  "executable": "snyk",
  "args": ["code", "test", "{fixturePath}", "--json"],
  "parser": "snyk-code"
}
```

The `{fixturePath}` placeholder is substituted independently in each argv element with the isolated project path. Commands run with `shell: false`, bounded output, timeout handling, and process-group cleanup. The `parser` value must match a key registered in `src/parsers/index.ts`.

**How it works end-to-end:**

1. The benchmark runner executes the command with `{fixturePath}` replaced
2. stdout is passed to the named parser function, which maps the tool's JSON output to the common `FindingRecord[]` format
3. Those structured findings are passed directly to the scorer; a shared `FINDINGS_JSON` serialization is retained for compatibility and diagnostics
4. The scorer normalizes the records and calculates precision/recall/F1 against the fixture's ground-truth JSON
5. The result lands in the JSONL file with `"runConfigType": "command"` so you can filter SAST vs model rows

When the task uses attacker-reachable ground truth, the existing `snyk-code` config automatically dispatches to the separately registered `snyk-code-attacker-reachable` parser. That parser retains `codeFlows` as `filesRelated`, includes driver rule names as type aliases, derives multi-line/cross-file flags, and feeds the V2 location-aware scorer. V1 tasks continue to use the original parser and type-only scorer.

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

### Adding a DeepSec security-harness config

DeepSec is a dedicated run-config type because it orchestrates multiple CLI stages and exports durable findings rather than consuming the benchmark prompt:

```json
{
  "type": "deepsec",
  "id": "deepsec-codex-luna-high",
  "name": "DeepSec + Codex GPT-5.6 Luna High",
  "agent": "codex",
  "model": "gpt-5.6-luna",
  "thinkingLevel": "high",
  "maxTurns": 30,
  "batchSize": 5,
  "concurrency": 1,
  "timeoutMs": 2700000
}
```

The adapter pins DeepSec 2.3.7, creates fresh state for every repetition, and runs `scan → process → export`. Put the canonical `OPENAI_API_KEY` in the root `.env`; the isolated worker makes that value authoritative and exposes it to the DeepSec child only as `OPENAI_API_KEY`. Do not add `mcpServers`: DeepSec controls its own agent toolset.

DeepSec supports V1 and attacker-reachable tasks but uses different V2 evidence semantics. Since its export has file/line locations without source/sink labels, the primary V2 metric is `localized-vulnerability-recall` (type plus any matching curated flow location within ±2 lines), not endpoint-aware attacker-reachable recall. The two metrics are not aggregated together. DeepSec does not support fix-vulns tasks.

### Adding a Codex Security harness config

Codex Security is a separate find-only participant rather than a prompt template for the general Codex runner. The adapter pins both `@openai/codex-security` and its Codex dependency, then runs a standard full-repository scan:

```json
{
  "type": "codex-security",
  "id": "codex-security-sol-xhigh",
  "name": "Codex Security GPT-5.6 Sol XHigh",
  "model": "gpt-5.6-sol",
  "effort": "xhigh",
  "mode": "standard",
  "auth": "api-key",
  "maxCostUsd": 50,
  "timeoutMs": 2700000
}
```

Set `OPENAI_API_KEY` in the ignored root `.env`. The benchmark child receives only that canonical key name; `OPEN_AI_API_KEY`, `CODEX_API_KEY`, and unrelated credentials are not forwarded. Preflight also verifies the pinned package, bundled plugin metadata, Python 3.10+, and authentication before a scan.

`maxCostUsd` is a high fail-safe ceiling, not a target budget: standard Sol xhigh scans can exceed small limits during threat modeling before they seal any findings. Use the reported `metrics.totalCostUsd` to track actual spend.

Every run uses a new Git snapshot and private Codex homes under the temporary state directory. Before scanning, git-ignored dependencies and generated output are removed from that disposable copy so the scanner reviews the fixture rather than vendored packages; tracked source files remain unchanged. The CLI and all descendants run inside the same outer Landlock boundary as the general Codex runner: the copied project is read-only, scanner state/output are writable, and sibling paths such as fixture ground truth are denied. A model-free dry run completes before the paid scan.

The adapter consumes only the current scan's sealed `findings` document. V1 uses type-only F1. V2 maps documented Codex Security location roles conservatively to source/sink endpoints and uses attacker-reachable recall; unknown or evidence-only roles remain unlabelled rather than being guessed. JSONL stores coverage completeness, deferred/excluded counts, target and scan identity, package/plugin versions, parser mapping diagnostics, and reported usage/cost. Sealed partial scans are scored with `coverage: partial`; runs without a valid sealed result fail.

Codex Security does not accept benchmark prompts, MCP servers, deep mode, ChatGPT auth, patching, publication, or fix-vulns tasks in this baseline integration. Its package evolves quickly, so update the exact dependency pin, runner version constant, frozen parser fixtures, and documentation together.

### Maintaining Snyk Code ruleId mappings

Snyk Code’s `snyk code test --json` output is SARIF. Each finding’s tool rule is identified by the **`ruleId`** string on each `runs[0].results[]` entry (see [`parseSnykCodeOutput` docblock](../src/parsers/snyk-code.ts) and [Command configs and Snyk Code (SAST)](./benchmark.md#command-configs-and-snyk-code-sast) in `docs/benchmark.md`). The benchmark maps that string to our shared finding `type` (a `VulnType`) inside **`mapRuleId()`** in **`src/parsers/snyk-code.ts`**. V1 scoring then matches by type only. V2 additionally uses driver rule metadata and `results[].codeFlows` in `src/parsers/snyk-code-attacker-reachable.ts`, then requires location overlap. In either pipeline, an unexpected `"other"` mapping can make recall look artificially low.

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
5. Re-run the benchmark with `--config snyk-code` (and your task filter) and confirm JSONL findings use the expected `type` strings aligned with **`fixtures/<name>/findings.json`** `vulnerabilities[].type`.

**New `VulnType`:** follow [Updating When You Add a New Vulnerability Type](#updating-when-you-add-a-new-vulnerability-type) (types, `normalizeVulnType`, `mapRuleId`, and this doc’s type table). **Existing type, new Snyk id:** usually **`src/parsers/snyk-code.ts` only** plus verification.

---

## Serving HTML Benchmark Reports

Generated HTML benchmark reports are written under `public/<report-id>/`, with an `index.html` entry point. Use the `report:serve` helper to preview one report directory locally:

```bash
pnpm report:serve public/2026-05-14-wpq2k
```

This wraps the `serve` npm package and forwards the provided directory to it. By default, `serve` listens on `0.0.0.0:3000`; pass normal `serve` flags after the directory when needed, for example:

```bash
pnpm report:serve public/2026-05-14-wpq2k --listen 4000
```

With npm, include `--` before forwarded arguments:

```bash
npm run report:serve -- public/2026-05-14-wpq2k
```

---

## Run Config JSON Reference

Each entry in `evals/run-configs.json` is a general coding-agent config, a generic command scanner, or a dedicated DeepSec/Codex Security harness config.

### Model config fields (`type` absent or `"model"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | No | `"model"` | Identifies this as a model config. Omitting it defaults to `"model"`. |
| `runner` | No | `"claude-code"` \| `"codex-cli"` | Native coding-agent harness. Defaults to Claude Code. |
| `id` | Yes | `string` | Unique identifier. Used in `--config` CLI filter. |
| `name` | Yes | `string` | Human-readable label shown in console output and result files. |
| `model` | Yes | `string` | Model identifier accepted by the selected native runner. |
| `effort` | No | `"default"` \| `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"` | Runner-native reasoning effort. Claude and Codex support different subsets. |
| `thinking` | No | `ThinkingConfig` | Extended thinking mode. Defaults to `{ "type": "adaptive" }`. Options: `{ "type": "adaptive" }`, `{ "type": "enabled", "budgetTokens": N }`, `{ "type": "disabled" }`. |
| `promptTemplateId` | No | `"default"` \| `"snyk-mcp"` \| `"security-review"` | User-prompt selection. `"default"` preserves the task prompt, `"snyk-mcp"` appends a required Snyk Code MCP scan, and Claude-only `"security-review"` replaces the user prompt with `/security-review`. |
| `maxTurns` | No | `number` | Max conversation turns for this config. Overridden per-task by the task's `maxTurns` if set. |
| `timeoutMs` | No | `number` | Parent-process wall-clock deadline for CLI-backed agents. |
| `mcpServers` | No | `object` | Map of MCP server name → `MCPServerConfig`. Omit for a bare model run. |

### Command config fields (`type: "command"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | Yes | `"command"` | Identifies this as a SAST/CLI tool config. |
| `id` | Yes | `string` | Unique identifier. Used in `--config` CLI filter. |
| `name` | Yes | `string` | Human-readable label shown in console output and result files. |
| `executable` | Yes | `string` | Executable launched directly without a shell. |
| `args` | No | `string[]` | Argument vector. `{fixturePath}` is replaced in each argument. |
| `parser` | Yes | `string` | Parser key from the registry in `src/parsers/index.ts` (e.g. `"snyk-code"`). |
| `timeoutMs` | No | `number` | Wall-clock deadline. Defaults to ten minutes. |

Command configs only support find-vulns tasks. They produce `"runConfigType": "command"` in JSONL output and have zeroed token/turn metrics (only `sessionDurationMs` and `filesScanned` are populated on raw run rows; aggregate rows also include `sessionDurationStdDevMs` when repetitions are used).

### DeepSec config fields (`type: "deepsec"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | Yes | `"deepsec"` | Selects the DeepSec CLI adapter. |
| `id` / `name` | Yes | `string` | Stable config identity and display label. |
| `agent` | Yes | `"codex"` | DeepSec backend supported by this benchmark integration. |
| `model` | Yes | `string` | Explicit OpenAI model slug. |
| `thinkingLevel` | Yes | `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` | DeepSec reasoning control. |
| `maxTurns` | No | `number` | Maximum turns per DeepSec batch. |
| `batchSize` / `concurrency` | No | `number` | DeepSec processing controls. |
| `limit` | No | `number` | Optional file cap for smoke testing. Omit for scored full runs. |
| `timeoutMs` | No | `number` | Per-stage process deadline. |

### Codex Security config fields (`type: "codex-security"`)

| Field | Required | Type | Description |
|---|---|---|---|
| `type` | Yes | `"codex-security"` | Selects the dedicated Codex Security CLI adapter. |
| `id` / `name` | Yes | `string` | Stable config identity and display label. |
| `model` | Yes | `string` | Explicit OpenAI model slug. |
| `effort` | Yes | `"minimal"` \| `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"` | Codex Security reasoning effort. |
| `mode` | No | `"standard"` | Full-repository standard mode; deep mode is intentionally excluded. |
| `auth` | No | `"api-key"` | Noninteractive canonical `OPENAI_API_KEY` authentication. |
| `maxCostUsd` | No | positive `number` | Estimated scan-cost ceiling; in-flight requests may finish above it. |
| `timeoutMs` | No | `number` | Parent-process deadline for dry run and scan execution. |

**Note on repetitions:** The `--repetitions N` CLI flag controls how many times each (task, config) pair is executed. This is intentionally a run-time concern (how many times to execute) rather than a config property (what to execute), so it does not appear in `run-configs.json`. See [`docs/benchmark.md` — Repetitions](./benchmark.md#repetitions) for details.

For one-off Claude Code diagnostics, pass `--trace-agent`. This opt-in flag writes bounded JSONL traces under `results/agent-traces/`, including the resolved prompts, SDK initialization and slash-command inventory, visible assistant messages, tool calls/results, and Claude Code debug stderr. Credential-shaped fields are redacted and thinking blocks are deliberately omitted, but source code and model-visible tool output are retained; treat traces as sensitive development artifacts. Normal benchmark runs do not create them.

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
fixtures/ruby-project-garnet/
  project/                           ← source code (agent's cwd)
    app.rb                           ← Sinatra app
  findings.json                      ← ground truth (outside agent's cwd)
evals/tasks/ruby-project-garnet-find-vulns.json   ← find task descriptor
evals/tasks/ruby-project-garnet-fix-vulns.json    ← fix task descriptor
```

**`fixtures/ruby-project-garnet/findings.json`:**
```json
{
  "description": "Sinatra app for benchmark testing",
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

**`evals/tasks/ruby-project-garnet-find-vulns.json`:**
```json
{
  "id": "ruby-project-garnet-find-vulns",
  "name": "Ruby App: Find Vulnerabilities",
  "category": "find-vulns",
  "fixture": "ruby-project-garnet",
  "maxTurns": 20
}
```

**`evals/tasks/ruby-project-garnet-fix-vulns.json`:**
```json
{
  "id": "ruby-project-garnet-fix-vulns",
  "name": "Ruby App: Fix Vulnerabilities",
  "category": "fix-vulns",
  "fixture": "ruby-project-garnet",
  "maxTurns": 30
}
```

**Verify and run:**
```bash
# Confirm both tasks appear
pnpm run benchmark -- --dry-run

# Run find task with one model to sanity-check scoring
pnpm run benchmark -- --task ruby-project-garnet-find-vulns --config sonnet-4-6

# Compare model against SAST on the same fixture (comma-separated, no spaces)
pnpm run benchmark -- --task ruby-project-garnet-find-vulns --config sonnet-4-6,snyk-code

# Run both tasks for your new fixture in one run (comma-separated)
pnpm run benchmark -- --task ruby-project-garnet-find-vulns,ruby-project-garnet-fix-vulns
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

**"Failed to read findings.json for fixture ..."**
- The `fixture` field in your task JSON doesn't match a fixture directory under `fixtures/`.
- Make sure `fixtures/<your-fixture>/findings.json` exists inside the fixture directory.

**"`vulnerabilities` must be an array"**
- Your `findings.json` is missing the top-level `"vulnerabilities"` key, or it's not an array.

**Duplicate vulnerability `id`s in different fixture JSON files**
- The loader does not enforce global uniqueness, but you should still use distinct ids across every `fixtures/*/findings.json`. Reusing the same id in two fixtures (e.g. two apps both using `llm-xpowered-by-header`) confuses aggregated results and fix-judge notes. Prefix ids with a short fixture token (`llm2-`, `js5-`, etc.).

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
