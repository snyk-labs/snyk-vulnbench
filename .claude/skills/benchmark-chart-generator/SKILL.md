---
name: benchmark-chart-generator
description: >
  Generates a self-contained HTML chart report from benchmark JSONL result files,
  matching the Snyk Evo brand styling. Use when the user says "generate charts",
  "make an HTML report from these results", "visualize the benchmark", "create a
  chart page", or provides a JSONL file and asks for visual output. Use this skill
  even if the user just says "chart this" or "turn these results into HTML" in the
  context of benchmark data. Do NOT use for markdown reports (use benchmark-report-writer),
  adding fixtures (use benchmark-add-new-fixture), or running benchmarks (use benchmark-run).
license: Apache-2.0
compatibility: >
  Requires read access to benchmark JSONL files in results/ and write access to public/.
  No external dependencies -- output is a single self-contained HTML file that opens
  directly in a browser.
metadata:
  author: lirantal
  version: 1.0.0
---

# Benchmark Chart Generator

# Instructions

Turn benchmark JSONL results into a polished HTML chart page with Snyk Evo styling --
no manual HTML editing required. The output is a self-contained file you can open
directly in a browser or host statically.

The template lives at `assets/report-template.html` relative to this skill. It
contains all CSS, SVG chart rendering JS, and the Snyk Evo color palette. Your job
is to read the JSONL data, inject it into the template, and write the output file.

### Step 1: Gather inputs

Identify which JSONL file(s) to use:
- If the user provided explicit file paths, use those.
- If the user said "latest" or didn't specify, find the most recent file in `results/` by filename timestamp.
- If multiple files are provided, read all of them and concatenate their rows.

Read each JSONL file. Each line is one complete JSON object. Lines have a `_type`
field that determines what kind of row they are:

- `"run"` -- a single raw `EvalResult` (one execution of one task+config)
- `"task-aggregate"` -- mean scores for one (task, config) pair across repeated runs
- `"config-aggregate"` -- headline numbers for one config, macro-averaged across all fixtures

Lines without a `_type` field are legacy `"run"` rows (backward compatible).

### Step 2: Parse, filter, and validate

Parse each line as JSON. **Choose the right row type for the chart:**

- **Headline comparison charts** (the most common request): use `_type === "config-aggregate"` rows. These give one number per config, macro-averaged across all fixtures.
- **Per-fixture breakdown charts**: use `_type === "task-aggregate"` rows. These give one number per (task, config) pair, with repeated runs already averaged.
- **Detailed per-run charts** (rare): use `_type === "run"` rows. These are the raw individual results.

When in doubt, default to `"config-aggregate"` for headline charts and `"task-aggregate"` for per-fixture charts. If only `"run"` rows exist (legacy JSONL files or single-rep runs), use those directly.

For `"run"` rows, validate that every row has these required fields:
- `taskId`, `taskName`
- `runConfigName`, `runConfigType` (must be `"model"` or `"command"`)
- `score` (number 0-1)
- `metrics.sessionDurationMs` (number)

For aggregate rows, validate:
- `runConfigId`, `runConfigName`, `runConfigType`
- `score` (number 0-1)
- `sessionDurationMs` (number)

The `details.recall` and `details.precision` fields are present on `"run"` rows for
`find-vulns` tasks but absent for `fix-vulns` tasks. On aggregate rows, `recall` and
`precision` are top-level fields (null for non-find-vulns tasks). The template handles
this gracefully -- the recall/precision chart is only rendered when the data exists.

If a row is missing critical fields (`score`, `metrics.sessionDurationMs` or
`sessionDurationMs`), warn the user and skip that row rather than failing entirely.

For the full EvalResult schema and all available fields, see
[`docs/benchmark.md` — EvalResult](../../docs/benchmark.md#evalresult--the-final-record).

### Step 3: Build the HTML

1. Read the template from this skill's `assets/report-template.html`.
2. Collect all valid rows into a JSON array.
3. Replace the three placeholders in the template:
   - `__BENCHMARK_ROWS__` -- the JSON array (use `JSON.stringify` formatting, or paste the raw array)
   - `__REPORT_TITLE__` -- derive from the data: use the shared `taskName` if all rows share one task, otherwise use "Benchmark Results"
   - `__REPORT_SUBTITLE__` -- derive from the data: use `taskId` if single-task, otherwise "Multi-task comparison" or a comma-separated list of task IDs

The template JS groups rows by `taskId` automatically, so multi-task JSONL files
produce one chart section per task without any extra work.

### Step 4: Write the output

Generate the output path: `public/<YYYY-MM-DD-XXXXX>/index.html` where:
- `YYYY-MM-DD` is today's date
- `XXXXX` is a random 5-character alphanumeric slug for uniqueness

Create the directory and write the file. Report the full path to the user.

### Step 5: Verify

Confirm the output file:
- Exists and is non-empty
- Contains valid HTML (check for `<!DOCTYPE html>` at the start)
- The `BENCHMARK_ROWS` array in the output has the expected number of entries

Report success to the user with the output path and how to open it.

Done when: the HTML file exists at the output path, contains the correct data, and
the user has been told where to find it.

## Available data fields for charting

JSONL files contain three row types, distinguished by the `_type` field. The default
template uses `"run"` rows. When the user asks for headline comparison charts, prefer
aggregate rows. For the full schema see
[`docs/benchmark.md`](../../docs/benchmark.md#evalresult--the-final-record).

### Row type discriminator

| `_type` value | Description | When to use |
|---|---|---|
| `"run"` (or absent) | Raw `EvalResult` -- one execution | Per-run detail charts, legacy files |
| `"task-aggregate"` | Mean across repeated runs for one (task, config) pair | Per-fixture breakdown charts |
| `"config-aggregate"` | Macro-average across all fixtures for one config | Headline comparison charts |

### Core fields on `"run"` rows

| Field path | Type | Description |
|---|---|---|
| `taskId`, `taskName` | string | Task identifier and display name |
| `runConfigId`, `runConfigName` | string | Config identifier and display name |
| `runConfigType` | `"model"` or `"command"` | Distinguishes AI agent runs from SAST tool runs |
| `effort` | `"low"\|"medium"\|"high"\|"max"\|null` | Reasoning effort level. Null for command runs. |
| `thinking` | `ThinkingConfig\|null` | Extended thinking config: `{type:"adaptive"}`, `{type:"enabled",budgetTokens:N}`, or `{type:"disabled"}`. Null for command runs. |
| `score` | number (0-1) | Overall F1 score (find-vulns) or fraction fixed (fix-vulns) |
| `timestamp` | string (ISO 8601) | When this run happened |
| `repetition` | number (1-indexed) | Which repetition this is (e.g. 2 of 3) |
| `totalRepetitions` | number | Total repetitions requested for this task+config pair |

### Metrics (always present)

| Field path | Type | Description |
|---|---|---|
| `metrics.sessionDurationMs` | number | Wall-clock time |
| `metrics.totalCostUsd` | number or null | Session cost in USD (model runs only) |
| `metrics.totalLogicalInputTokens` | number | Total context the model processed |
| `metrics.totalOutputTokens` | number | Total tokens generated |
| `metrics.totalTurns` | number | API round-trips |
| `metrics.toolStats` | object | Per-tool `{count, totalDurationMs, totalInputTokensEst, totalOutputTokensEst}` |
| `metrics.filesScanned` | string[] | Unique file paths touched |

### Find-vulns details (when `details.recall` exists)

| Field path | Type | Description |
|---|---|---|
| `details.recall` | number (0-1) | Fraction of ground-truth vulns found |
| `details.precision` | number (0-1) | Fraction of agent findings that were real |
| `details.truePositives` | `Array<{id, type, severity}>` | Correctly matched vulns |
| `details.falsePositives` | `Vulnerability[]` | Unmatched agent findings (hallucinations) |
| `details.falseNegatives` | `Array<{id, type, severity}>` | Missed vulns |
| `details.byType` | `Record<VulnType, BreakdownEntry>` | Per-vulnerability-type breakdown |
| `details.bySeverity` | `Record<Severity, BreakdownEntry>` | Per-severity breakdown |

A `BreakdownEntry` has: `{ total: number, found: number, precision: number, recall: number, f1: number }`.

`VulnType` values: `sql-injection`, `xss`, `path-traversal`, `command-injection`,
`hardcoded-credentials`, `information-exposure`, `allocation-of-resources-without-limits-or-throttling`,
`ssrf`, `csrf`, `open-redirect`, `xxe`, `idor`, `insecure-deserialization`,
`improper-type-validation`, `prototype-pollution`, `origin-validation-error`, `other`.

`Severity` values: `critical`, `high`, `medium`, `low`.

### Fields on `"task-aggregate"` rows

| Field path | Type | Description |
|---|---|---|
| `taskId`, `taskName` | string | Task identifier and display name |
| `runConfigId`, `runConfigName` | string | Config identifier and display name |
| `runConfigType` | `"model"` or `"command"` | Distinguishes AI agent runs from SAST tool runs |
| `repetitions` | number | How many runs were averaged |
| `score` | number (0-1) | Mean score across repetitions |
| `recall` | number (0-1) or null | Mean recall (find-vulns only) |
| `precision` | number (0-1) or null | Mean precision (find-vulns only) |
| `sessionDurationMs` | number | Mean wall-clock time |
| `totalTokens` | number | Mean total tokens (logical input + output) |
| `totalCostUsd` | number or null | Mean cost in USD |

### Fields on `"config-aggregate"` rows

| Field path | Type | Description |
|---|---|---|
| `runConfigId`, `runConfigName` | string | Config identifier and display name |
| `runConfigType` | `"model"` or `"command"` | Distinguishes AI agent runs from SAST tool runs |
| `fixtureCount` | number | How many distinct tasks contributed |
| `score` | number (0-1) | Macro-averaged score across all fixtures |
| `recall` | number (0-1) or null | Macro-averaged recall (find-vulns only) |
| `precision` | number (0-1) or null | Macro-averaged precision (find-vulns only) |
| `sessionDurationMs` | number | Macro-averaged wall-clock time |
| `totalTokens` | number | Macro-averaged total tokens |
| `totalCostUsd` | number or null | Macro-averaged cost in USD |

### Chart ideas by data field

When the user asks for comparisons, use these patterns:

| User wants | Fields to use | Chart type |
|---|---|---|
| Compare configs on a specific vuln type | `details.byType["xss"].recall` per config | Grouped bars |
| Compare configs on a severity level | `details.bySeverity["critical"].f1` per config | Grouped bars |
| Show "excluding low, scores are similar" | `details.bySeverity` -- sum found/total for non-low | Stacked or grouped bars |
| Effort level comparison | `effort` + `score` (or `metrics.totalCostUsd`) | Bar chart or scatter |
| Cost vs quality tradeoff | `metrics.totalCostUsd` vs `score` | Scatter plot |
| Token usage breakdown | `metrics.totalLogicalInputTokens`, `metrics.totalOutputTokens` | Stacked bars |
| Tool usage comparison | `metrics.toolStats[tool].count` per config | Grouped bars |
| What did the model hallucinate? | `details.falsePositives` -- group by `.type` | Pie or horizontal bars |
| Which vuln types are hardest? | `details.byType[type].recall` across all types for one config | Horizontal bar chart |

When building these custom charts, follow the same Snyk Evo styling and use the
existing `renderBarChart` and `renderGroupedRecallPrecision` functions from the template
as a starting point. Add new chart rendering functions as needed for scatter plots,
stacked bars, or horizontal bars.

## Color and styling reference

Colors are assigned by `runConfigType`, not row order:
- `"command"` rows (Snyk Code SAST) get `--snyk-purple` (#9043c6)
- `"model"` rows (AI agents) get neutral gray (#4a4a4a)

The template handles all styling automatically. Do not modify CSS or chart JS --
just inject the data and placeholders.

## Examples

User says: "Generate a chart from results/benchmark-2026-05-12T10-46-33-179Z.jsonl"

Actions:
1. Read the specified JSONL file
2. Parse both lines into a JSON array (2 rows: one model, one command)
3. Read the template from this skill's assets/report-template.html
4. Replace `__BENCHMARK_ROWS__` with the 2-element array, set title to the shared taskName, set subtitle to the taskId
5. Generate output path, e.g. `public/2026-05-12-a7k2m/index.html`
6. Write the file and confirm to the user

Result: A styled HTML report at `public/2026-05-12-a7k2m/index.html` with score, duration, and recall/precision charts comparing the model vs Snyk Code.

---

User says: "Chart the latest benchmark results"

Actions:
1. List `results/` directory, pick the file with the most recent timestamp in its filename
2. Read and parse the JSONL
3. Build HTML from template with appropriate title/subtitle
4. Write to `public/<today-slug>/index.html`
5. Report the path

Result: The most recent benchmark run visualized as an HTML chart page.

---

User says: "Make charts from these two files: results/benchmark-2026-05-11T15-59-59-091Z.jsonl and results/benchmark-2026-05-12T10-46-33-179Z.jsonl"

Actions:
1. Read both files, concatenate all rows (e.g. 4 rows from file 1, 2 rows from file 2 = 6 total)
2. Parse and validate all 6 rows
3. The template groups by taskId automatically, so multiple tasks get separate chart sections
4. Set title to "Benchmark Results", subtitle to the list of unique taskIds
5. Write to `public/<today-slug>/index.html`
6. Report the path and note that the page has multiple task sections

Result: A multi-section chart page with one group of charts per taskId, all in a single HTML file.

---

User says: "Visualize just the Snyk Code results from the last run"

Actions:
1. Find the latest JSONL file in results/
2. Parse all rows, filter to only rows where `runConfigType === "command"`
3. Build HTML with the filtered subset
4. Write output and report

Result: A chart page showing only the Snyk Code SAST results (useful for single-tool analysis, though comparison charts are more informative with both model and command rows).

## Troubleshooting

Error: Template file not found at the expected path.
Cause: The skill's assets directory may not be at the expected relative location.
Solution: Search for `report-template.html` in `.claude/skills/benchmark-chart-generator/assets/`. If the skill was moved, update the path accordingly.

---

Error: `details.recall` or `details.precision` is undefined for some rows.
Cause: `fix-vulns` category tasks produce `FixVulnsDetails` which has `vulnsFixed`/`vulnsAttempted` instead of recall/precision.
Solution: This is handled automatically -- the template only renders the recall/precision chart when at least one row in a task group has those fields. No action needed.

---

Error: Output directory already exists.
Cause: The random slug collided (extremely unlikely) or the skill was run twice in quick succession.
Solution: Generate a new slug and retry. The 5-character alphanumeric space (36^5 = ~60M combinations) makes collisions negligible in practice.

---

Error: JSONL file has zero valid rows after parsing.
Cause: The file is empty, corrupted, or all rows failed validation.
Solution: Report the error to the user with specifics about which fields were missing. Check that the file is actual JSONL (one JSON object per line, no wrapping array).
