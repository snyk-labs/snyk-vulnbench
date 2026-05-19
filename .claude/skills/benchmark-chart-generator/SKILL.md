---
name: benchmark-chart-generator
description: >
  Generates a self-contained HTML chart report from benchmark JSONL result files,
  matching the Snyk Evo brand styling. Use when the user says "generate charts",
  "make an HTML report from these results", "visualize the benchmark", "create a
  chart page", provides a JSONL file and asks for visual output, or pastes raw
  spreadsheet/table data and asks for charts in the benchmark report style. Use this
  skill even if the user just says "chart this" or "turn these results into HTML" in
  the context of benchmark or benchmark-adjacent data. Do NOT use for markdown reports
  (use benchmark-report-writer), adding fixtures (use benchmark-add-new-fixture), or
  running benchmarks (use benchmark-run).
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

If the user provides pasted spreadsheet, CSV, markdown-table, or Google Sheets data
instead of JSONL, normalize that table data into explicit JavaScript arrays and build
a custom static page using the same Snyk Evo palette, typography, spacing, SVG chart
style, rounded bars, section layout, and output path convention. Do not force raw
article data into the benchmark JSONL schema when a custom chart page is clearer.

### Step 1: Gather inputs

Identify which JSONL file(s) to use:
- If the user provided explicit file paths, use those.
- If the user said "latest" or didn't specify, find the most recent file in `results/` by filename timestamp.
- If multiple files are provided, read all of them and concatenate their rows.

Read each JSONL file. Each line is one complete JSON object. Lines have a `_type`
field that determines what kind of row they are:

- `"run"` -- a single raw `EvalResult` (one execution of one task+config)
- `"task-aggregate"` -- mean scores and score standard deviation for one (task, config) pair across repeated runs
- `"config-aggregate"` -- headline numbers and headline score standard deviation for one config, macro-averaged across all fixtures

Lines without a `_type` field are legacy `"run"` rows (backward compatible).

### Step 2: Parse, filter, and validate

Parse each line as JSON. **Choose the right aggregate rows for the report:**

- **Headline comparison section**: always use `_type === "config-aggregate"` rows when present. These give one number per config, macro-averaged across all fixtures, plus `scoreStdDev` for headline error bars. The report must start with this section.
- **Per-fixture breakdown sections**: always use `_type === "task-aggregate"` rows when present. These give one number per (task, config) pair, with repeated runs already averaged, plus `scoreStdDev` for per-fixture score error bars.
- **Detailed per-run rows**: do not use `_type === "run"` rows for normal reports. They are raw executions and can double-count repeated runs. Use them only as a legacy fallback when a file has no aggregate rows at all, and warn the user that the report was generated from raw rows.

For current JSONL files, collect valid `"config-aggregate"` and `"task-aggregate"` rows into the `BENCHMARK_ROWS` array. Do not inject raw `"run"` rows when aggregate rows exist.

For `"run"` rows, validate that every row has these required fields:
- `taskId`, `taskName`
- `runConfigName`, `runConfigType` (must be `"model"` or `"command"`)
- `score` (number 0-1)
- `metrics.sessionDurationMs` (number)

For `"task-aggregate"` rows, validate:
- `taskId`, `taskName`
- `runConfigId`, `runConfigName`, `runConfigType`
- `score` (number 0-1)
- `scoreStdDev` (number >= 0, optional for older JSONL files; treat missing as 0)
- `sessionDurationMs` (number)
- `totalTokens` (number)
- `totalCostUsd` (number or null)

For `"config-aggregate"` rows, validate:
- `runConfigId`, `runConfigName`, `runConfigType`
- `fixtureCount` (number)
- `score` (number 0-1)
- `scoreStdDev` (number >= 0, optional for older JSONL files; treat missing as 0)
- `sessionDurationMs` (number)
- `totalTokens` (number)
- `totalCostUsd` (number or null)

The `details.recall` and `details.precision` fields are present on `"run"` rows for
`find-vulns` tasks but absent for `fix-vulns` tasks. On aggregate rows, `recall` and
`precision` are top-level fields (null for non-find-vulns tasks). The template handles
this gracefully -- the recall/precision chart is only rendered when the data exists.

If a row is missing critical fields (`score`, `sessionDurationMs`, `totalTokens`, or
`totalCostUsd`), warn the user and skip that row rather than failing entirely.

For the full EvalResult schema and all available fields, see
[`docs/benchmark.md` — EvalResult](../../docs/benchmark.md#evalresult--the-final-record).

### Step 3: Build the HTML

1. Read the template from this skill's `assets/report-template.html`.
2. Collect all valid aggregate rows into a JSON array: `"config-aggregate"` rows first, followed by `"task-aggregate"` rows. This makes the embedded data easy to inspect and ensures the template can render the headline section first.
3. Replace the three placeholders in the template:
   - `__BENCHMARK_ROWS__` -- the JSON array (use `JSON.stringify` formatting, or paste the raw array)
   - `__REPORT_TITLE__` -- derive from the data: use the shared `taskName` if all rows share one task, otherwise use "Benchmark Results"
   - `__REPORT_SUBTITLE__` -- derive from the data: use `taskId` if single-task, otherwise "Multi-task comparison" or a comma-separated list of task IDs

The template JS renders all `"config-aggregate"` rows as the headline comparison first,
then groups `"task-aggregate"` rows by `taskId` so multi-task JSONL files produce one
chart section per task. Each section should include score, duration, total tokens, cost,
and recall/precision when those fields exist. Score charts must render `scoreStdDev`
as vertical error bars and label the score as `mean ± standard deviation` when
`repetitions > 1`.

When aggregate rows contain enough comparable points, include scatter plots as
supplementary views in addition to the standard bar charts. Do not replace score,
duration, token, cost, or recall/precision charts with scatter plots. The default
template can render these headline scatter sections from `"config-aggregate"` rows:
- `totalCostUsd` vs `score` for model configs with known cost. This shows
  quality/cost tradeoff; better points move toward the top-left.
- `sessionDurationMs` vs `score` for all configs. This shows speed/quality tradeoff;
  better points move toward the top-left.
- `precision` vs `recall` for find-vulns aggregate rows. This shows detection quality;
  better points move toward the top-right.

For custom reports or future template work, other useful scatter plots from the JSONL
schema are:
- `totalTokens` vs `score` for model configs, to show context/quality efficiency.
- `totalCostUsd` vs `recall` for find-vulns model configs, to show cost per coverage.
- `scoreStdDev` vs `score` when `repetitions > 1`, to show quality vs stability.
- `metrics.totalLogicalInputTokens + metrics.totalOutputTokens` vs `score` on raw
  `"run"` rows only when intentionally using raw rows as a legacy fallback.

For custom chart renderers, compute the y-axis scale with label headroom, not just
data coverage. Reserve about 10-15% space above the tallest visible value (including
stacked totals) so value labels sit in white space above bars. Avoid clamping labels
to the same y position as the bar top; if a label would hit the plot boundary, raise
`yMax`, add top margin, or lower the bar scale until the label has visible padding.

### Step 4: Write the output

Generate the output path: `public/<YYYY-MM-DD-XXXXX>/index.html` where:
- `YYYY-MM-DD` is today's date
- `XXXXX` is a random 5-character alphanumeric slug for uniqueness

Create the directory and write the file. Report the full path to the user.

### Step 5: Verify

Confirm the output file:
- Exists and is non-empty
- Contains valid HTML (check for `<!DOCTYPE html>` at the start)
- The `BENCHMARK_ROWS` array in the output has the expected number of aggregate entries
- The output includes `"config-aggregate"` rows when the source file contains them
- The output includes `"task-aggregate"` rows instead of raw `"run"` rows for task charts
- Score charts show standard-deviation error bars and textual `±` labels when aggregate rows include `scoreStdDev` and `repetitions > 1`
- Scatter plots are present as additive sections when there are at least two valid comparable aggregate points
- Tallest bar and stacked-bar labels have visible white space above the bars and are not pinned to the chart top

Report success to the user with the output path and how to open it.

Done when: the HTML file exists at the output path, contains the correct data, and
the user has been told where to find it.

## Available data fields for charting

JSONL files contain three row types, distinguished by the `_type` field. The default
template uses aggregate rows: `"config-aggregate"` for the report headline and
`"task-aggregate"` for individual task sections. For the full schema see
[`docs/benchmark.md`](../../docs/benchmark.md#evalresult--the-final-record).

### Row type discriminator

| `_type` value | Description | When to use |
|---|---|---|
| `"run"` (or absent) | Raw `EvalResult` -- one execution | Legacy fallback only when aggregates are absent |
| `"task-aggregate"` | Mean and score standard deviation across repeated runs for one (task, config) pair | Individual task breakdown charts with score error bars |
| `"config-aggregate"` | Macro-average and score standard deviation across repetition-level headline scores for one config | Headline comparison charts at the top of the report with score error bars |

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
| `scoreStdDev` | number | Sample standard deviation of score across repetitions. Use for score error bars. |
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
| `repetitions` | number | How many repetition-level headline scores contributed |
| `score` | number (0-1) | Macro-averaged score across all fixtures |
| `scoreStdDev` | number | Sample standard deviation of repetition-level headline scores. Use for headline score error bars. |
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
| Cost comparison | `totalCostUsd` on aggregate rows | Bar chart, with null command costs shown as N/A |
| Token usage comparison | `totalTokens` on aggregate rows | Bar chart |
| Cost vs quality tradeoff | `totalCostUsd` vs `score` | Scatter plot |
| Speed vs quality tradeoff | `sessionDurationMs` vs `score` | Scatter plot |
| Context vs quality tradeoff | `totalTokens` vs `score` for model configs | Scatter plot |
| Detection quality tradeoff | `precision` vs `recall` for find-vulns rows | Scatter plot |
| Quality vs stability | `scoreStdDev` vs `score` when repetitions > 1 | Scatter plot |
| Score stability across repetitions | `score` + `scoreStdDev` on aggregate rows | Bar chart with vertical error bars and `mean ± SD` labels |
| Token usage breakdown | `metrics.totalLogicalInputTokens`, `metrics.totalOutputTokens` on raw rows | Detailed custom chart only when intentionally using raw run data |
| Tool usage comparison | `metrics.toolStats[tool].count` per config | Grouped bars |
| What did the model hallucinate? | `details.falsePositives` -- group by `.type` | Pie or horizontal bars |
| Which vuln types are hardest? | `details.byType[type].recall` across all types for one config | Horizontal bar chart |

When building these custom charts, follow the same Snyk Evo styling and use the
existing `renderBarChart` and `renderGroupedRecallPrecision` functions from the template
as a starting point. Add new chart rendering functions as needed for scatter plots,
stacked bars, or horizontal bars. For any bar-like chart, set `yMax` high enough for
both the data and the value labels; stacked bars should scale against the largest
stack total plus headroom.

## Color and styling reference

Colors are assigned by `runConfigType`, not row order:
- `"command"` rows (Snyk Code SAST) get `--snyk-purple` (#9043c6)
- `"model"` rows (AI agents) get neutral gray (#4a4a4a)

The template handles normal styling automatically. During normal JSONL report
generation, inject aggregate data and placeholders; keep the built-in bar and scatter
sections intact. Modify CSS or chart JS only when the user asks for a custom chart
type or provides non-JSONL data that needs a purpose-built page.

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

---

User says: "Generate charts from the latest benchmark results and include tradeoffs"

Actions:
1. Read the latest JSONL file and select aggregate rows.
2. Build the standard report with headline and per-task bar charts.
3. Preserve the template's additive scatter sections for supported headline tradeoffs:
   score vs cost, score vs duration, and recall vs precision when available.
4. Verify the scatter sections appear only when there are at least two valid points.

Result: A report with the usual benchmark charts plus tradeoff scatter plots that make cost, speed, and detection-quality relationships visible.

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

---

Error: Value labels touch the top of the tallest bar or chart boundary.
Cause: The chart y-axis max was set to the data maximum with no headroom, so labels for
the tallest bar get clamped into the same visual space as the bar.
Solution: Increase `yMax` by roughly 10-15%, add a larger top margin, or calculate
`yMax` from the largest stacked total plus label padding. Re-check the rendered chart
before reporting success.
