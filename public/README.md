# Static benchmark report (`public/`)

This folder holds a **single-file HTML report** that visualizes rows from a benchmark **JSONL** result file. The chart styling is tuned to match a clean lab-style bar chart (light grid, rounded bars, one highlighted series vs neutral comparison bars).

## Files

| File | Purpose |
|------|---------|
| `benchmark-report.html` | Self-contained report: embedded JSON rows + inline CSS + SVG charts drawn in the browser. |
| `README.md` | How the HTML was produced and how to regenerate it from a new JSONL export. |

No build step or server is required. Open the HTML file directly in a browser (double-click, or `file://` / static hosting).

## How `benchmark-report.html` was created

1. **Source data**  
   One benchmark run produced `results/benchmark-2026-04-24T11-21-37-863Z.jsonl`. That file is **newline-delimited JSON**: each line is one complete JSON object (one row per task × run configuration).

2. **Rows used**  
   For this report, both lines from that file were copied verbatim. They share the same `taskId` (`js-find-vulns`) and compare:
   - **Claude Sonnet 4.6 (no MCP)** — `runConfigType`: `model`
   - **Snyk Code SAST** — `runConfigType`: `command`

3. **Embedding in HTML**  
   The full JSON for each line was pasted into the `BENCHMARK_ROWS` array inside `benchmark-report.html` (inside the `<script>` block). The page script parses that array and builds three SVG charts:
   - **Composite score** — `score` (0–1, shown as percent).
   - **Session duration** — `metrics.sessionDurationMs` (linear scale, bar labels shown as seconds when ≥ 1000 ms).
   - **Recall and precision** — `details.recall` and `details.precision` as grouped bars per run.

4. **Styling**  
   Layout and colors are **inline CSS** in the same file (`:root` variables for bar colors, typography, grid). SVG elements use classes for grid lines and labels so you can adjust appearance in one place.

## Color palette and styling

### Snyk Evo glow palette

The chart colors are derived from the Snyk Evo brand "glow" tokens. These are defined as CSS custom properties in the `:root` block of `benchmark-report.html`:

| CSS variable | Hex | Description |
|---|---|---|
| `--snyk-purple` | `#9043c6` | Core Snyk purple — primary brand accent |
| `--snyk-glow-light-blue` | `#00bcffb3` | Light blue (70% opacity) |
| `--snyk-glow-pink` | `#ff0ff3b3` | Pink (70% opacity) |
| `--snyk-glow-orange` | `#ff890499` | Orange (60% opacity) |
| `--snyk-glow-pink-soft` | `#ff0ff399` | Soft pink (60% opacity) |
| `--snyk-glow-red` | `#fb2c3680` | Red (50% opacity) |
| `--snyk-glow-orange-soft` | `#ff890480` | Soft orange (50% opacity) |

### Chart role assignments

These variables map palette tokens to chart roles. To retheme the report, change these assignments — you should not need to touch the rendering JS.

Color assignment is **keyed on `runConfigType`**: rows with `"command"` get Snyk-branded colors; rows with `"model"` get neutral tones. This ensures the Snyk bar always looks like Snyk regardless of row order.

| CSS variable | Default | Used for |
|---|---|---|
| `--bar-snyk` | `var(--snyk-purple)` | Score and Duration bar for Snyk (`runConfigType: "command"`) |
| `--bar-model` | `#4a4a4a` | Score and Duration bar for the AI model (`runConfigType: "model"`) |
| `--bar-snyk-recall` | `var(--snyk-purple)` | Recall bar in grouped chart for Snyk |
| `--bar-snyk-precision` | `#c39bdf` | Precision bar in grouped chart for Snyk (lighter purple) |
| `--bar-model-recall` | `#4a4a4a` | Recall bar in grouped chart for the model (dark gray) |
| `--bar-model-precision` | `#a0a0a0` | Precision bar in grouped chart for the model (light gray) |

### Chart alignment and legend placement

All three charts (Score, Duration, Recall/Precision) use the same SVG `viewBox` width (720) and left margin (64px) so their Y-axes are vertically aligned. The recall/precision legend is rendered as an HTML `<div>` **above** the SVG (not inside it), so it doesn't affect chart dimensions. Each model gets a column showing its name with colored swatches for Recall and Precision.

### Bar rounding

Bars use **top-only rounding** (radius = 6px) so they sit flush against the X-axis with no gap. This is implemented via SVG `<path>` elements (the `topRoundedRect()` helper) rather than `<rect rx ry>`, which would round all four corners.

### Y-axis label spacing

The Y-axis label ("SCORE", "DURATION", "RATE") is offset at `y: -50` in the rotated coordinate system, with a left chart margin of 64px. This leaves comfortable whitespace between the label and the tick numbers. If tick labels become wider (e.g. larger numbers), increase the left margin and push the label `y` further negative.

## How to create this report again from a bare JSONL file

### Option A — Manual (no tools)

1. Run your benchmark so it writes a new file under `results/`, e.g. `results/benchmark-<timestamp>.jsonl`.
2. Open the JSONL in an editor. Copy **only the lines** you want on the chart (same `taskId` is easiest to compare apples-to-apples).
3. Open `public/benchmark-report.html`.
4. Replace the contents of the `BENCHMARK_ROWS` array with valid JavaScript array elements:
   - Each line of JSONL becomes one array element (the whole JSON object).
   - Ensure **double quotes** inside the JSON stay valid; the object sits inside `[ ... ]` separated by commas.
5. Save and open `benchmark-report.html` in a browser.

### Option B — Quick copy with `sed` / shell (read-only on JSONL)

To print specific lines (e.g. lines 1–2) for pasting:

```bash
sed -n '1,2p' results/benchmark-2026-04-24T11-21-37-863Z.jsonl
```

Wrap the printed lines in `[` `]` and add commas between objects if you paste into `BENCHMARK_ROWS`.

### Option C — `jq` to emit a JS array snippet

If `jq` is installed, you can turn the whole file into a minified JSON array for embedding:

```bash
jq -s '.' results/benchmark-2026-04-24T11-21-37-863Z.jsonl
```

Copy the output into `const BENCHMARK_ROWS = ` ... `;` in the HTML (still valid JS for numeric/boolean/string fields).

### Fields the page expects

Each row should include at least:

| Field | Used for |
|-------|-----------|
| `taskName`, `taskId` | Header / subtitle |
| `timestamp` | Footer meta |
| `runConfigName` | Bar labels |
| `score` | Score chart |
| `metrics.sessionDurationMs` | Duration chart |
| `details.recall`, `details.precision` | Grouped recall/precision chart |

If `details` is missing, the script will throw; extend the script if you add runs without those fields.

### Ordering and color assignment

Bar colors are assigned by `runConfigType`, not row order: `"command"` rows get Snyk brand colors; `"model"` rows get neutral grays. Row order only affects left-to-right position on the chart. Put the AI model first and Snyk second for a natural comparison layout.

## Privacy / portability

The embedded JSON may contain **paths** (e.g. `filesScanned`) from the machine that ran the benchmark. For public sharing, strip or redact those fields in the copy you embed, or post-process the JSONL before pasting.
