---
name: benchmark-report-writer
description: Produces publishable markdown benchmark reports from eval results, modeled on the structure and tone of frontier AI lab reports (Anthropic, Cursor, FrontierSWE, BaxBench). Use when the user wants to write up benchmark findings, turn eval results into a blog post or technical report, publish a model/agent comparison, announce a new eval, or share benchmark data publicly. Triggers on phrases like "write a benchmark report", "turn these results into a post", "publish our evals", "draft a writeup", "create a model comparison report", or "generate a benchmark blog post". Use this skill even if the user just says "write this up" or "make a report" in the context of benchmark/eval results. Do NOT use for generating chart HTML/assets (use benchmark-chart-generator), internal changelog entries, release notes, PR descriptions, or academic paper drafts.
license: MIT
compatibility: Requires read access to benchmark result files and optionally a benchmark guide plus chart-generator artifacts. Output is markdown with tables and visual placeholders; benchmark result charts are supplied by benchmark-chart-generator. `jq` is recommended for reliably aggregating JSONL results.
metadata:
  author: Liran Tal
  version: 1.0.0
---

# Benchmark Report Writer

# Instructions

Produce a publishable markdown benchmark report from eval results and, when available, a benchmark guide. The report should match what a reader expects from frontier AI lab writeups: a short summary that sets honest expectations, a methodology section that earns the reader's trust, a results section anchored by a leaderboard and optional generated visuals, a qualitative analysis section that explains *what the numbers mean*, and a limitations section that doesn't flinch.

The goal is a report that a reader can skim in two minutes or read thoroughly in twenty, and that stands up to scrutiny because every claim is traceable to the data.

## Inputs

- **Required**: one or more result files (JSONL with one record per run, JSON, or CSV) with per-run scores and metrics.
- **Recommended**: a benchmark guide document (e.g. `docs/benchmark.md`) describing goals, methodology, and task design. If it's missing, ask the user for the missing context rather than inventing it.
- **Optional**: chart-generator artifacts, either as a generated report directory or direct paths to `article-visuals.md` and `chart-manifest.json`. Treat `article-visuals.md` as the preferred visual catalog and `chart-manifest.json` as validation/detail metadata. Treat `index.html` as a human preview, not the source of chart truth.
- **Optional**: an existing draft or a prior report to build on, and a target style ("Anthropic announcement", "FrontierSWE deep-dive", "Cursor blog", etc.).

## Reference files

Read these on demand — don't dump them all into context at the start.

- `references/report-structure.md` — the full section-by-section template, including which sections to keep or drop based on data shape. **Read before Step 3.**
- `references/voice-and-style.md` — tone rules, writing patterns, phrases to avoid. **Read before Step 4.**
- `references/visualizations.md` — how to use chart-generator visual catalogs and decide which generated visuals belong in the article. **Read when the user provides `article-visuals.md`, `chart-manifest.json`, or asks about visuals.**
- `references/example-sections.md` — short before/after examples of Summary, Results, and Qualitative Analysis prose. **Read when stuck on phrasing.**
- `assets/report-template.md` — skeleton markdown to copy and fill in.

## Workflow

Follow these steps in order. Do not skip verification — reports that invent numbers are worse than no report at all.

### Step 1: Gather the inputs and the audience

1. Locate the result files (ask the user if not provided). Check `results/` directories and the user's message for attached paths.
2. Locate the benchmark guide if one exists (common paths: `docs/benchmark.md`, `README.md`, `BENCHMARK.md`). If none is available, ask the user for the five-sentence version: what the benchmark measures, how scores are computed, what varies across runs, how many runs were aggregated, and what the known limits are.
3. Locate optional chart-generator artifacts if the user provides a generated report directory or visual files. Prefer `article-visuals.md`; read `chart-manifest.json` when you need exact chart IDs, anchors, metrics, or data summaries. Do not parse `index.html` for chart content unless both visual handoff files are missing.
4. Ask the user who the report is for — public blog post, internal writeup, paper submission — unless it's obvious from context. The target shapes both tone and depth. When in doubt, default to "public blog post for a technical audience".
5. Ask whether there is a preferred house style (e.g. "like the Anthropic Claude 3.7 post", "like FrontierSWE"). If not specified, use the default hybrid described in `references/report-structure.md`.

Done when: you have a results source, a methodology source (guide or user-provided summary), optional visual catalog status, and a clear target audience and style.

### Step 2: Extract findings from the data

1. Load the results programmatically. Prefer `jq` on JSONL or a small script over eyeballing the file — you need exact numbers, and exact numbers are the whole point.
2. Compute at minimum, for each task × config cell: the score, total tokens (summing all token fields), wall time, and turn count. Identify the best score per task, the most efficient config (best score-per-token), and any outliers.
3. Scan for patterns that could become qualitative observations: does quality correlate with cost, or diverge from it? Do different configs fail on the same tasks? Does one tool dominate the tool-use breakdown? Is the score spread wide or tight? Each pattern is a candidate section in the Qualitative Analysis.
4. If `article-visuals.md` exists, summarize the available visual placeholders and captions in the scratchpad. Map each visual to the section where it best supports the narrative.
5. Write every headline number into a scratchpad (inline in your response is fine). Every number that ends up in the report must be traceable to this scratchpad — never let a number appear in the draft without a source.

Done when: you have a structured summary of findings with exact numbers, optional visual placeholders, and 2–4 candidate themes for qualitative analysis.

### Step 3: Draft the outline

1. Read `references/report-structure.md` for the template and variant guidance.
2. Map findings onto sections. Drop any section that would be padding for the data at hand — a three-config run doesn't need a dedicated "Methodology Comparison" section, for example.
3. Decide which generated visuals, if any, belong in each section using `references/visualizations.md` and the available `article-visuals.md` entries. If no visual catalog is available, outline table-led results and note whether running `benchmark-chart-generator` would help.
4. Write a one-line intent per section (what the reader should take away). If you can't state an intent, the section shouldn't exist.

Done when: you have a section-by-section outline with a one-line intent per section, table plan, and optional visual placeholder plan.

### Step 4: Write the report

1. Read `references/voice-and-style.md` before drafting the first sentence.
2. Start with the Summary and the Introduction. These set the frame and are hardest to change once the body is written.
3. Draft each section at the outline's intent — no more. A short section that lands beats a long one that meanders.
4. For benchmark result visuals, insert placeholders and captions from `article-visuals.md` rather than generating charts in the report. Keep the leaderboard and important breakdowns as markdown tables so exact numbers remain readable without images.
5. If no chart artifacts exist, do not invent result charts. Write table-led results and mention in the delivery summary that `benchmark-chart-generator` should be run for publishable visuals.
6. Copy methodology diagrams from the benchmark guide only if they already exist and clarify the benchmark design. Don't redraw what's already clear, and don't use methodology diagrams as substitutes for result visuals.
7. Write the Limitations section honestly — every benchmark has caveats, and hiding them undermines credibility. See the examples in `references/example-sections.md` for calibration.

Done when: every planned section is drafted, tables and visual placeholders are placed intentionally, and the report reads as one voice rather than a patchwork.

### Step 5: Verify every claim

1. For each specific number or comparison in the report, trace it back to the scratchpad from Step 2. Any number without a source is a bug — fix it or cut the claim.
2. Check that the Summary's headline claim actually follows from the Results section. A reader who only reads the Summary should leave with an accurate picture, not an oversold one.
3. Check that every named model, config, and task is spelled consistently throughout.
4. Run one final pass for voice: imperative where appropriate, no filler, no unsupported superlatives, no "revolutionary" or "groundbreaking" language.
5. Verify every visual placeholder came from `article-visuals.md` and, when available, matches an entry in `chart-manifest.json`. Do not revalidate rendered chart geometry here; that belongs to `benchmark-chart-generator`.

Done when: every claim has a source, the Summary matches the body, names are consistent, visual placeholders are valid, and the voice reads cleanly.

### Step 6: Deliver

1. Write the report to the path the user specifies, or default to `reports/benchmark-<YYYY-MM-DD>.md`.
2. Summarize for the user: what's in the report, what you deliberately omitted and why, which generated visual placeholders were included or whether charts still need to be generated, and what the user should review before publishing (named partners, claims about competitors, unverified numbers).

Done when: the file is written and the user has a short list of pre-publication review items.

## Examples

User says: "We just finished a benchmark run — can you write this up as a blog post?"

Actions:
1. Find the most recent `results/benchmark-*.jsonl` file and read it.
2. Locate `docs/benchmark.md` (if present) and skim for methodology.
3. Ask the target audience (default: public, technical).
4. Check whether a chart-generator directory or `article-visuals.md` was provided; if not, keep the draft table-led and note that visuals can be generated separately.
5. Work through Steps 2–6: extract exact numbers with `jq`, draft a ~1,500-word report with leaderboard/per-task tables, optional visual placeholders, and 2–3 qualitative observations.
6. Save to `reports/benchmark-<date>.md` and summarize what's in it and what the user should double-check.

Result: A publishable markdown file the user can paste into their blog platform or push to a docs repo.

---

User says: "Here's our benchmark guide and the latest JSONL file. Draft the writeup."

Actions:
1. Read the guide to understand methodology; use it directly to write the Benchmark Design section rather than re-describing from scratch.
2. Load the JSONL and extract aggregates programmatically, including `scoreStdDev` and `sessionDurationStdDevMs` when repeated runs are present.
3. If the user also provides a generated chart directory, read `article-visuals.md` and insert the relevant placeholders in Results.
4. Write sections in order; include a methodology diagram only if it already exists in the guide and helps explain the setup.
5. Deliver the report and flag any gaps where the guide didn't supply enough context.

Result: A report that faithfully represents the documented benchmark and the actual results, with gaps called out for the user rather than papered over.

---

User says: "Turn these eval results into a report in the style of the Anthropic Claude 3.7 Sonnet announcement."

Actions:
1. Recognize the request for Anthropic-style framing: outcome-forward summary, visually clear results, methodology pushed to an appendix, confident-but-measured tone.
2. In Step 3, consult the "Announcement" variant in `references/report-structure.md` and follow it.
3. Use generated visual placeholders from `article-visuals.md` as the visual core when available; otherwise write the announcement table-first and recommend running `benchmark-chart-generator`.
4. Draft with methodology in the appendix rather than the body; emphasize headline benchmark numbers and a single punchy claim in the opening.

Result: A report in the requested house style, grounded entirely in the user's real data.

---

User says: "Write this up but we don't have a benchmark guide, just the JSONL."

Actions:
1. Ask the user for a five-sentence summary of the benchmark (what's measured, how it's scored, what varies, number of runs, known limits).
2. Inspect the JSONL to infer what you can — task IDs, config IDs, metric fields — and confirm your inferences with the user ("I see three configs named X/Y/Z, each run against two tasks — is that correct?").
3. Proceed with Steps 2–6, using the user's five-sentence summary as the source for the Benchmark Design section and flagging any methodology detail you had to leave vague.

Result: A report that is appropriately hedged where methodology context was thin, rather than one that confidently makes things up.

---

User says: "Use this chart report directory while writing the article: public/2026-05-20-ab123"

Actions:
1. Read `public/2026-05-20-ab123/article-visuals.md` first.
2. Read `chart-manifest.json` only if you need to validate placeholders, anchors, or chart data summaries.
3. Use the visual guide to place comments like `<!-- VISUAL: headline-score -->` in the Results section and preserve the suggested captions.
4. Write the report narrative and tables from the benchmark data; do not recreate the charts in markdown.

Result: A report draft with stable visual placeholders that the user can replace with images or embeds during editorial review.

## Troubleshooting

Error: "I don't have enough context to write the Benchmark Design section."
Cause: No benchmark guide was provided and the user didn't describe the methodology.
Solution: Ask the user for the five-sentence version (what's measured, how it's scored, what varies, how many runs, known limits). Do not invent methodology — a vague design section is better than a confident wrong one.

---

Error: "The Summary's headline claim isn't supported by the Results."
Cause: The Summary was drafted from vibes rather than from the Step 2 scratchpad.
Solution: Rewrite the Summary using only claims that trace to the scratchpad. If no headline claim is strong enough, say so plainly ("No single config dominated across all tasks") rather than over-selling.

---

Error: "The user provided a chart directory, but I can't find `article-visuals.md`."
Cause: The directory was not generated by the current `benchmark-chart-generator` workflow, or only `index.html` was copied.
Solution: Look for `chart-manifest.json` as a fallback. If neither handoff file exists, write a table-led report and tell the user to regenerate visuals with `benchmark-chart-generator`.

---

Error: "A visual placeholder does not match the manifest."
Cause: The report used a placeholder that was typed manually or copied from a different chart report.
Solution: Regenerate the placeholder from `article-visuals.md` or validate the chart ID against `chart-manifest.json`. Do not invent placeholder IDs.

---

Error: "The user asks this skill to generate charts."
Cause: Chart rendering belongs to `benchmark-chart-generator`; this skill owns the narrative report.
Solution: Explain that the report can include tables now, but publishable benchmark charts should be generated with `benchmark-chart-generator` and then passed back as `article-visuals.md` / `chart-manifest.json`.

---

Error: "The report reads like a pitch deck."
Cause: Over-reliance on superlatives, marketing language, or unsupported claims.
Solution: Re-read `references/voice-and-style.md`, strip every "revolutionary", "state-of-the-art", and "groundbreaking" unless it's supported by a cited number, and reframe claims as measurements ("scored X on Y") rather than adjectives ("best-in-class at Y").

---

Error: "The report is 5,000 words and the user asked for a blog post."
Cause: Every section was written at maximum depth; no editing pass.
Solution: Cut the Appendix to essentials, trim the Qualitative Analysis to the 2–3 strongest observations, and aim for 1,200–2,000 words total for a blog post. Full-depth technical reports belong on a different track.
