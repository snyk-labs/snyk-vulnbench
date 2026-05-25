---
name: benchmark-chart-generator
description: >
  Generates benchmark chart artifacts from JSONL result files: a self-contained HTML
  report, a compact chart manifest, and an article-ready visuals guide with placeholders
  and captions. Use when the user says "generate charts", "make an HTML report",
  "visualize the benchmark", "create article visuals", provides a JSONL file and asks
  for visual output, or pastes table data and asks for charts in the benchmark report
  style. Use this skill even if the user just says "chart this" or "turn these results
  into HTML" in the context of benchmark data. Do NOT use for markdown reports
  (use benchmark-report-writer), adding fixtures (use benchmark-add-new-fixture), or
  running benchmarks (use benchmark-run).
license: Apache-2.0
compatibility: >
  Requires read access to benchmark JSONL files in results/ and write access to public/.
  No external dependencies -- output is static HTML plus compact JSON/Markdown handoff
  files that can be opened or read directly.
metadata:
  author: lirantal
  version: 1.0.0
---

# Benchmark Chart Generator

# Instructions

Turn benchmark JSONL results into polished chart artifacts with Snyk Evo styling --
no manual HTML editing required. The primary output is a self-contained `index.html`
that opens directly in a browser, plus `chart-manifest.json` and `article-visuals.md`
so an article-writing agent can understand and reference the visuals without reading
the full JSONL payload.

The template lives at `assets/report-template.html` relative to this skill. It
contains all CSS, SVG chart rendering JS, and the Snyk Evo color palette. Your job
is to read the JSONL data, build compact chart specs, inject those specs into the
template, and write all three output artifacts from the same source of truth.

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
- `"task-aggregate"` -- mean scores/runtimes plus standard deviation for one (task, config) pair across repeated runs
- `"config-aggregate"` -- headline numbers plus score/runtime standard deviation for one config, macro-averaged across all fixtures

Lines without a `_type` field are legacy `"run"` rows (backward compatible).

### Step 2: Parse, filter, and validate

Parse each line as JSON. **Choose the right aggregate rows for the report:**

- **Headline comparison section**: always use `_type === "config-aggregate"` rows when present. These give one number per config, macro-averaged across all fixtures, plus `scoreStdDev` and `sessionDurationStdDevMs` for headline error bars. The report must start with this section.
- **Per-fixture breakdown sections**: always use `_type === "task-aggregate"` rows when present. These give one number per (task, config) pair, with repeated runs already averaged, plus `scoreStdDev` and `sessionDurationStdDevMs` for per-fixture error bars.
- **Detailed per-run rows**: do not use `_type === "run"` rows for normal reports. They are raw executions and can double-count repeated runs. Use them only as a legacy fallback when a file has no aggregate rows at all, and warn the user that the report was generated from raw rows.

For current JSONL files, collect valid `"config-aggregate"` and `"task-aggregate"`
rows as source data for `CHART_SPECS`. Do not inject raw `"run"` rows into the HTML
when aggregate rows exist. The generated HTML should receive compact chart specs, not
the original JSONL objects.

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
- `sessionDurationStdDevMs` (number >= 0, optional for older JSONL files; treat missing as 0)
- `totalTokens` (number)
- `totalCostUsd` (number or null)

For `"config-aggregate"` rows, validate:
- `runConfigId`, `runConfigName`, `runConfigType`
- `fixtureCount` (number)
- `score` (number 0-1)
- `scoreStdDev` (number >= 0, optional for older JSONL files; treat missing as 0)
- `sessionDurationMs` (number)
- `sessionDurationStdDevMs` (number >= 0, optional for older JSONL files; treat missing as 0)
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

### Step 3: Build compact chart specs

Build a `CHART_SPECS` array from the validated rows. This array is the source of
truth for every generated artifact: the HTML report, the machine-readable manifest,
and the article handoff markdown. Do not make the article agent infer chart contents
from the HTML or read the full JSONL when a compact spec can describe the visual.

Each chart spec must use this shape:

```json
{
  "id": "headline-score",
  "title": "Headline score",
  "chartType": "bar",
  "scope": "config-aggregate",
  "metric": "score",
  "unit": "percent",
  "section": {
    "id": "headline",
    "title": "Headline comparison",
    "subtitle": "Macro-average across 10 fixtures",
    "kind": "headline"
  },
  "placeholder": "<!-- VISUAL: headline-score -->",
  "htmlAnchor": "index.html#chart-headline-score",
  "caption": "Macro-averaged benchmark score across all fixtures. Error bars show standard deviation across repeated runs.",
  "recommendedUse": "Use in the main Results section when introducing the overall comparison.",
  "dataSummary": {
    "unit": "percent",
    "rows": [
      {
        "label": "Claude Opus 4.6 (high)",
        "runConfigType": "model",
        "value": 0.84,
        "stdDev": 0.07,
        "repetitions": 5
      }
    ]
  },
  "talkingPoints": [
    "Repeated runs are summarized as mean plus standard deviation.",
    "Score is shown as a percentage, so 0.84 renders as 84.0%."
  ]
}
```

Required fields:
- `id`: stable lowercase slug, safe for anchors and article placeholders.
- `title`: display title for the chart.
- `chartType`: one of `"bar"`, `"grouped-bar"`, or `"scatter"` for the default template.
- `scope`: source row scope such as `"config-aggregate"`, `"task-aggregate"`, or `"legacy-run-fallback"`.
- `metric`: primary metric, such as `"score"`, `"sessionDurationMs"`, `"totalTokens"`, `"totalCostUsd"`, `"recall-precision"`, or `"score-vs-cost"`.
- `unit`: `"percent"`, `"milliseconds"`, `"tokens"`, `"usd"`, or `"number"` for bar charts.
- `section`: where the chart appears in the HTML. Use `kind: "headline"` for the top comparison and `kind: "task"` for per-fixture sections.
- `placeholder`: markdown-safe placeholder, always `<!-- VISUAL: <id> -->`.
- `htmlAnchor`: relative anchor, always `index.html#chart-<id>`.
- `caption`: publication-ready caption that explains the metric and aggregation.
- `recommendedUse`: one sentence telling an article agent where this visual belongs.
- `dataSummary`: compact values used by the renderer and article agent.

For bar charts, use `dataSummary.rows`:

```json
{
  "dataSummary": {
    "unit": "percent",
    "rows": [
      { "label": "Config A", "runConfigType": "model", "value": 0.72, "stdDev": 0.04, "repetitions": 5 },
      { "label": "Snyk Code", "runConfigType": "command", "value": 1, "stdDev": 0, "repetitions": 5 }
    ]
  }
}
```

For recall/precision grouped bars, use `chartType: "grouped-bar"` and
`dataSummary.groups`:

```json
{
  "chartType": "grouped-bar",
  "metric": "recall-precision",
  "dataSummary": {
    "unit": "percent",
    "groups": [
      { "label": "Config A", "runConfigType": "model", "recall": 0.8, "precision": 0.9 },
      { "label": "Snyk Code", "runConfigType": "command", "recall": 1, "precision": 1 }
    ]
  }
}
```

For scatter charts, use `dataSummary.points` and axis units:

```json
{
  "chartType": "scatter",
  "metric": "score-vs-cost",
  "xAxisLabel": "COST",
  "yAxisLabel": "SCORE",
  "xUnit": "usd",
  "yUnit": "percent",
  "dataSummary": {
    "points": [
      { "label": "Config A", "runConfigType": "model", "x": 0.12, "y": 0.72 }
    ]
  }
}
```

Mapping rules:
- Create a headline section from `"config-aggregate"` rows when present. Include score, duration, total tokens, cost when cost exists, recall/precision when present, and supported scatter tradeoff charts when at least two comparable points exist.
- Create one task section per `taskId` from `"task-aggregate"` rows. Include score, duration, total tokens, cost when cost exists, and recall/precision when present.
- Put `"config-aggregate"` chart specs first, followed by task-level specs in task ID order. This keeps the HTML and article handoff easy to scan.
- Keep values numeric in `dataSummary`; format them only in captions or article prose.
- Include `stdDev` and `repetitions` on bar rows whenever the source aggregate contains standard deviation data.
- For custom charts such as heatmaps or baseline delta charts, add a clear `chartType` value and enough `dataSummary` content for the renderer and article handoff. If the default template cannot render that type yet, still include it in `chart-manifest.json` and mark it in `article-visuals.md` as a planned/custom visual.

Pareto-style scatter rules:
- Use `chartType: "scatter"` for Pareto-style plots unless the template has been extended with a dedicated `pareto-scatter` renderer. The default template renders ordinary scatter charts, so encode Pareto interpretation in `caption`, `recommendedUse`, and `talkingPoints`.
- For `score-vs-cost`, use `x = totalCostUsd` and `y = score`, include only rows where `runConfigType === "model"` and `totalCostUsd` is a number, and exclude Snyk Code SAST because command rows have `totalCostUsd: null` and are not comparable to model session costs. Lower x and higher y are better.
- For `score-vs-duration`, use `x = sessionDurationMs` and `y = score`, include both model and command rows, including Snyk Code SAST, because wall-clock duration and score are shared benchmark metrics. Lower x and higher y are better.
- For `recall-vs-precision`, use `x = recall` and `y = precision`, include both model and command rows when both fields are numeric. This plot is most useful for `find-vulns` results because it shows behavior differences: precision-oriented configs avoid false positives, while recall-oriented configs find more real vulnerabilities but may hallucinate more. Higher x and higher y are better.
- For `score-stability`, use `x = scoreStdDev` and `y = score`, include both model and command rows when `repetitions > 1`. This shows quality plus run stability; Snyk Code SAST often has `scoreStdDev: 0`, which is meaningful because command runs are deterministic relative to repeated model runs. Lower x and higher y are better.
- Add a `talkingPoints` item naming the apparent Pareto frontier or the dominant point when the aggregate data makes it obvious. Treat a point as dominated when another point is at least as good on both axes and strictly better on one axis.
- Keep Snyk Code SAST in shared-metric scatters (`score-vs-duration`, `recall-vs-precision`, `score-stability`) when it is part of the benchmark, but keep model-session-only metrics (`totalCostUsd`, `totalTokens`, context usage) model-only unless the chart explicitly explains command values as not applicable.

Example Pareto-style aggregate data from a 10-fixture find-vulns run:

| Config | Score | Duration | Cost | Recall | Precision | Score std dev |
|---|---:|---:|---:|---:|---:|---:|
| Snyk Code SAST | 1.000 | 14758.1 | N/A | 1.000 | 1.000 | 0.000 |
| Claude Opus 4.6 Medium | 0.754 | 27324.2 | 0.0628 | 0.680 | 0.915 | 0.002 |
| Claude Opus 4.6 High | 0.752 | 53827.1 | 0.1249 | 0.682 | 0.898 | 0.003 |
| Claude Opus 4.7 Max | 0.688 | 37350.7 | 0.3559 | 0.714 | 0.696 | 0.022 |
| Claude Sonnet 4.6 Medium | 0.674 | 59318.1 | 0.0860 | 0.809 | 0.626 | 0.009 |
| Claude Sonnet 4.6 High | 0.649 | 94820.6 | 0.1322 | 0.813 | 0.586 | 0.035 |

In this example, `score-vs-cost` should be model-only and highlights Claude Opus 4.6 Medium as the best quality/cost point. `score-vs-duration` should include Snyk Code SAST and shows it dominating the shared benchmark outcome. `recall-vs-precision` should include Snyk Code SAST and shows Opus 4.6 as more precision-oriented while Sonnet 4.6 is more recall-oriented. `score-stability` should include Snyk Code SAST and shows quality together with repeated-run variance.

For custom chart renderers, compute the y-axis scale with label headroom, not just
data coverage. Reserve about 10-15% space above the tallest visible value (including
stacked totals) so value labels sit in white space above bars. Avoid clamping labels
to the same y position as the bar top; if a label would hit the plot boundary, raise
`yMax`, add top margin, or lower the bar scale until the label has visible padding.

### Step 4: Build the three artifacts

Read the template from this skill's `assets/report-template.html`, then replace:
- `__CHART_SPECS__` -- the compact chart spec array.
- `__REPORT_TITLE__` -- derive from the data: use the shared `taskName` if all rows share one task, otherwise use "Benchmark Results".
- `__REPORT_SUBTITLE__` -- derive from the data: use `taskId` if single-task, otherwise "Multi-task comparison" or a comma-separated list of task IDs.

Write these files under the same output directory:

1. `index.html`
   - Self-contained static HTML report.
   - Embeds `CHART_SPECS`, not raw JSONL rows.
   - Renders SVG charts in the browser with stable anchors like `#chart-headline-score`.

2. `chart-manifest.json`
   - Machine-readable chart catalog.
   - Write the same chart specs, plus top-level metadata:

```json
{
  "schemaVersion": 1,
  "reportTitle": "Benchmark Results",
  "reportSubtitle": "Multi-task comparison",
  "generatedAt": "2026-05-20T00:00:00.000Z",
  "sourceFiles": ["results/benchmark-example.jsonl"],
  "htmlReport": "index.html",
  "charts": []
}
```

3. `article-visuals.md`
   - Preferred handoff for article-writing agents.
   - Keep it concise and ordered like the HTML report.
   - Include each chart's figure number, placeholder, use, caption, source anchor, data scope, metric, and 1-3 talking points.

Use this markdown format for each chart:

```md
### FIG-1: Headline score
Placeholder: `<!-- VISUAL: headline-score -->`

Use: Main Results section, when introducing the overall benchmark comparison.

Caption: Macro-averaged benchmark score across all fixtures. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-headline-score`
Data: `config-aggregate`, metric `score`.

Talking points:
- Repeated runs are summarized as mean plus standard deviation.
- Higher score is better.
```

### Step 5: Write the output

Generate the output directory: `public/<YYYY-MM-DD-XXXXX>/` where:
- `YYYY-MM-DD` is today's date
- `XXXXX` is a random 5-character alphanumeric slug for uniqueness

Create the directory and write `index.html`, `chart-manifest.json`, and
`article-visuals.md`. Report all three paths to the user.

### Step 6: Verify

Confirm the output files:
- `index.html`, `chart-manifest.json`, and `article-visuals.md` exist and are non-empty.
- `index.html` contains valid HTML (check for `<!DOCTYPE html>` at the start).
- `index.html` contains `const CHART_SPECS =` and does not contain `const BENCHMARK_ROWS =` during normal aggregate-report generation.
- `chart-manifest.json` parses as JSON and has `schemaVersion`, `htmlReport`, and a non-empty `charts` array.
- Every chart in `chart-manifest.json` has `id`, `title`, `chartType`, `scope`, `metric`, `placeholder`, `htmlAnchor`, `caption`, `recommendedUse`, and `dataSummary`.
- Every `htmlAnchor` in the manifest has a matching `id="chart-..."` or equivalent renderer-created anchor in the HTML template.
- `article-visuals.md` includes one figure entry per manifest chart and uses the same placeholders.
- Score and duration charts include standard-deviation values when aggregate rows include `scoreStdDev` / `sessionDurationStdDevMs` and `repetitions > 1`.
- Scatter plots are present as additive sections when there are at least two valid comparable aggregate points.
- Pareto-style scatter plots follow the Snyk inclusion rules: model-only for `score-vs-cost`, model plus command rows for `score-vs-duration`, `recall-vs-precision`, and `score-stability`.
- Multi-task reports include task-level chart specs when `"task-aggregate"` rows cover at least two tasks.
- Tallest bar and stacked-bar labels have visible white space above the bars and are not pinned to the chart top.

Report success to the user with the output directory and a note that `article-visuals.md`
is the recommended input for the article-writing agent.

Done when: all three artifacts exist, the HTML renders from compact chart specs, the
manifest describes every visual, and the user has been told where to find the files.

## Article handoff workflow

When the user plans to write an article from benchmark results, treat
`article-visuals.md` as the primary handoff artifact. The article-writing agent should
receive this file, not the full JSONL and not the full generated HTML, unless the user
explicitly asks for a full-data review.

The handoff file should let the article agent:
- Choose which visual belongs in each article section.
- Insert stable placeholders such as `<!-- VISUAL: headline-score -->`.
- Reuse publication-ready captions.
- Mention the exact data scope and metric behind each visual.
- Make high-level observations without spending context on raw per-run data.

Keep `chart-manifest.json` for automated workflows and editorial tooling. It should
be exact enough for a script or agent to validate placeholders, map them to HTML
anchors, or later export each chart as SVG/PNG without re-reading the benchmark JSONL.

## Legacy raw-run fallback

Prefer aggregate rows whenever they exist. If a JSONL file has only raw `"run"` rows
or legacy rows without `_type`, compact them before rendering:

1. Group raw rows by `taskId` and `runConfigName`.
2. If repeated runs are present, compute the mean score, mean duration, mean tokens,
   mean cost, and sample standard deviation for score and duration.
3. Build chart specs with `scope: "legacy-run-fallback"` so readers know the source
   was not a modern aggregate row.
4. Include a short warning in `article-visuals.md`: "Generated from legacy raw run
   rows because no aggregate rows were present."
5. Do not embed the original raw rows into `index.html`; render from compact chart
   specs even in fallback mode.

Done when: old result files still produce useful visuals, but large raw datasets are
not copied wholesale into the HTML or article handoff.

## Available data fields for charting

JSONL files contain three row types, distinguished by the `_type` field. Build chart
specs from aggregate rows: `"config-aggregate"` for the report headline and
`"task-aggregate"` for individual task sections. For the full schema see
[`docs/benchmark.md`](../../docs/benchmark.md#evalresult--the-final-record).

### Row type discriminator

| `_type` value | Description | When to use |
|---|---|---|
| `"run"` (or absent) | Raw `EvalResult` -- one execution | Legacy fallback only when aggregates are absent |
| `"task-aggregate"` | Mean plus score and runtime standard deviation across repeated runs for one (task, config) pair | Individual task breakdown charts with score and duration error bars |
| `"config-aggregate"` | Macro-average plus score and runtime standard deviation across repetition-level headline values for one config | Headline comparison charts at the top of the report with score and duration error bars |

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
| `sessionDurationStdDevMs` | number | Sample standard deviation of wall-clock time across repetitions. Use for duration error bars. |
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
| `sessionDurationStdDevMs` | number | Sample standard deviation of repetition-level headline runtimes. Use for headline duration error bars. |
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
| Cost vs quality tradeoff | `totalCostUsd` vs `score`, model rows only | Pareto-style scatter plot |
| Speed vs quality tradeoff | `sessionDurationMs` vs `score`, model and command rows | Pareto-style scatter plot |
| Context vs quality tradeoff | `totalTokens` vs `score` for model configs | Scatter plot |
| Detection quality tradeoff | `recall` vs `precision` for find-vulns rows, model and command rows | Pareto-style scatter plot |
| Quality vs stability | `scoreStdDev` vs `score` when repetitions > 1, model and command rows | Pareto-style scatter plot |
| Runtime stability across repetitions | `sessionDurationMs` + `sessionDurationStdDevMs` on aggregate rows | Bar chart with vertical error bars and `mean ± SD` labels |
| Which fixtures are hard? | `taskId` x `runConfigName` from `"task-aggregate"` rows, colored by `score` | Heatmap |
| Compare against a baseline | Matched `"task-aggregate"` rows, `comparison.score - baseline.score` | Diverging delta bars |
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
generation, inject compact `CHART_SPECS`; keep the built-in bar, grouped-bar, and
scatter renderers intact. Modify CSS or chart JS only when the user asks for a custom
chart type or provides non-JSONL data that needs a purpose-built page.

## Examples

User says: "Generate a chart from results/benchmark-2026-05-12T10-46-33-179Z.jsonl"

Actions:
1. Read the specified JSONL file
2. Parse and validate aggregate rows, or use legacy raw rows only if no aggregates exist
3. Build compact chart specs for score, duration, cost/tokens, and recall/precision when present
4. Read the template and replace `__CHART_SPECS__`, title, and subtitle placeholders
5. Generate output directory, e.g. `public/2026-05-12-a7k2m/`
6. Write `index.html`, `chart-manifest.json`, and `article-visuals.md`
7. Confirm all paths to the user

Result: A styled HTML report plus a compact chart manifest and article handoff guide with placeholders for score, duration, and recall/precision visuals.

---

User says: "Chart the latest benchmark results"

Actions:
1. List `results/` directory, pick the file with the most recent timestamp in its filename
2. Read and parse the JSONL
3. Build chart specs from aggregate rows
4. Build HTML and article handoff artifacts from those specs
5. Write to `public/<today-slug>/`
6. Report the output directory and recommend `article-visuals.md` for article drafting

Result: The most recent benchmark run visualized as an HTML chart page, with manifest metadata available for downstream article agents.

---

User says: "Make charts from these two files: results/benchmark-2026-05-11T15-59-59-091Z.jsonl and results/benchmark-2026-05-12T10-46-33-179Z.jsonl"

Actions:
1. Read both files, concatenate all rows (e.g. 4 rows from file 1, 2 rows from file 2 = 6 total)
2. Parse and validate all 6 rows
3. Build headline specs from config aggregates and task specs grouped by `taskId`
4. Set title to "Benchmark Results", subtitle to the list of unique task IDs
5. Write `index.html`, `chart-manifest.json`, and `article-visuals.md` to `public/<today-slug>/`
6. Report the path and note that the page and visual guide have multiple task sections

Result: A multi-section chart package with one group of charts per task ID and an article guide that lists each figure placeholder.

---

User says: "Visualize just the Snyk Code results from the last run"

Actions:
1. Find the latest JSONL file in results/
2. Parse all rows, filter to only rows where `runConfigType === "command"`
3. Build chart specs from the filtered subset
4. Write all three output artifacts and report

Result: A chart package showing only the Snyk Code SAST results, with article placeholders that make the single-tool scope explicit.

---

User says: "Generate charts from the latest benchmark results and include tradeoffs"

Actions:
1. Read the latest JSONL file and select aggregate rows.
2. Build chart specs for the standard headline and per-task bar charts.
3. Add scatter chart specs for supported headline tradeoffs:
   score vs cost, score vs duration, recall vs precision, and score stability when available.
4. Apply Pareto-style inclusion rules: keep Snyk Code SAST out of score vs cost, but include it in score vs duration, recall vs precision, and score stability when those shared metrics are present.
5. Verify the scatter specs and article placeholders appear only when there are at least two valid points.

Result: A report with the usual benchmark charts plus tradeoff scatter plots, and an article guide that tells the writer where each tradeoff visual belongs.

---

User says: "Generate a multi-task benchmark report and show which fixtures are hard"

Actions:
1. Read the JSONL file and select `"task-aggregate"` rows.
2. Build the standard headline and per-task chart specs.
3. Add a task/config heatmap spec when there are at least two tasks and two configs.
4. Use task names or IDs as rows, config names as columns, `score` as cell color, and percentage labels in cells.

Result: A report that preserves the normal charts and adds a matrix view in the manifest and article guide showing task difficulty and config strengths at a glance.

---

User says: "Show the effect of Snyk MCP compared with no MCP"

Actions:
1. Read `"task-aggregate"` rows and identify matched config pairs from names or user-provided baseline/comparison labels.
2. For each task, compute `comparison.score - baseline.score`.
3. Add a diverging delta chart spec centered at zero, labeling improvements and regressions in percentage points.
4. Keep the absolute score charts so readers can see both the delta and the underlying score.

Result: A chart package with the usual benchmark charts plus a baseline comparison visual that the article guide can reference directly.

## Troubleshooting

Error: Template file not found at the expected path.
Cause: The skill's assets directory may not be at the expected relative location.
Solution: Search for `report-template.html` in `.claude/skills/benchmark-chart-generator/assets/`. If the skill was moved, update the path accordingly.

---

Error: `details.recall` or `details.precision` is undefined for some rows.
Cause: `fix-vulns` category tasks produce `FixVulnsDetails` which has `vulnsFixed`/`vulnsAttempted` instead of recall/precision.
Solution: Only create recall/precision chart specs when at least one source row has both fields. No action needed for fix-vulns reports.

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

---

Error: Generated HTML still embeds the full JSONL data.
Cause: The generator replaced the old row placeholder or copied source rows directly instead of building `CHART_SPECS`.
Solution: Rebuild compact chart specs from the parsed rows, replace only `__CHART_SPECS__`, and verify `index.html` does not contain `const BENCHMARK_ROWS =`.

---

Error: Article placeholders do not match rendered chart anchors.
Cause: `chart-manifest.json`, `article-visuals.md`, and `index.html` were generated from different chart IDs or a chart ID was edited manually.
Solution: Regenerate all three artifacts from the same `CHART_SPECS` array. Each placeholder must be `<!-- VISUAL: <id> -->` and each anchor must be `index.html#chart-<id>`.
