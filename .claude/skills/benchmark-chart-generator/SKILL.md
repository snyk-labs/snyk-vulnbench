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

Read each JSONL file. Each line is one complete JSON object (one `EvalResult` row).

### Step 2: Parse and validate

Parse each line as JSON. Validate that every row has these required fields:
- `taskId`, `taskName`
- `runConfigName`, `runConfigType` (must be `"model"` or `"command"`)
- `score` (number 0-1)
- `metrics.sessionDurationMs` (number)

The `details.recall` and `details.precision` fields are required for `find-vulns` tasks
but absent for `fix-vulns` tasks. The template handles this gracefully -- the
recall/precision chart is only rendered when the data exists.

If a row is missing critical fields (`score`, `metrics.sessionDurationMs`), warn the
user and skip that row rather than failing entirely.

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
