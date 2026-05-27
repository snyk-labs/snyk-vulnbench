# Visual Handoff

Every visual must earn its place. A visual that restates the leaderboard table is
noise; a visual that reveals a pattern the table hides is signal.

This skill does not render benchmark result charts. Use `benchmark-chart-generator`
to produce `index.html`, `chart-manifest.json`, and `article-visuals.md`; then use
this reference to decide which generated visual placeholders belong in the article.

## Preferred visual sources

Use chart artifacts in this order:

1. `article-visuals.md` -- preferred article handoff. It contains figure titles,
   placeholders, captions, recommended uses, sources, and talking points.
2. `chart-manifest.json` -- machine-readable validation source. Use it to confirm
   chart IDs, anchors, metrics, scopes, and compact data summaries.
3. `index.html` -- human preview only. Do not scrape it to infer chart content if
   either handoff file is available.

If no chart artifacts are available, keep the report table-led and mention in the
delivery summary that `benchmark-chart-generator` should be run for publishable
visuals.

## Leaderboard table

The leaderboard is the heart of the Results section. Always include a markdown
table, even when generated visuals exist. Tables carry exact values; visuals explain
shape and tradeoffs.

Per-cell format works well when task x config is small:

```markdown
| Task | Config | Score | Tokens | Time |
|---|---|---|---|---|
| js-find-vulns | opus-4-6 | 89% | 18,432 | 24.8s |
| js-find-vulns | sonnet-4-6 | 72% | 14,210 | 19.3s |
| js-fix-vulns | sonnet-4-6 | 80% | 42,100 | 48.2s |
```

Per-config format is better when there are many tasks and few configs:

```markdown
| Config | js-find | js-fix | python-find | Avg |
|---|---|---|---|---|
| opus-4-6 | 89% | -- | 100% | 94% |
| sonnet-4-6 | 72% | 80% | 80% | 77% |
```

Round percentages to the nearest whole number in body tables unless the variance or
ranking depends on tenths of a point.

## Visual placement guide

Match article questions to generated visual intents:

| Reader question | Prefer this generated visual | Use it where |
|---|---|---|
| "Who won overall?" | Headline score / leaderboard visual | Start of Results |
| "How stable were repeated runs?" | Score chart with error bars | Results or limitations on non-determinism |
| "Which fixtures were hardest?" | Task/config heatmap or per-task score visuals | Per-task breakdown |
| "What's the speed tradeoff?" | Score vs session duration scatter or duration bars | Efficiency analysis |
| "What's the cost tradeoff?" | Score vs estimated cost scatter or cost bars | Cost/quality section |
| "Did models find issues cleanly?" | Recall vs precision visual | Detection quality section |
| "Did a tool/config help?" | Baseline delta visual | Tooling impact section |

If a generated visual does not support a section's thesis, do not include it. Use
the table and prose instead.

## Placeholder format

Copy placeholders exactly from `article-visuals.md`:

```markdown
<!-- VISUAL: headline-score -->
```

Place the caption immediately after the placeholder, either as plain prose or a
markdown blockquote depending on the target publishing platform:

```markdown
<!-- VISUAL: headline-score -->

*Figure 1: Macro-averaged benchmark score across all fixtures. Error bars show
standard deviation across repeated runs.*
```

If a markdown table follows the visual, separate the two with one short bridge
sentence so readers do not confuse the figure caption with the table. Keep it
plain:

```markdown
The table below provides exact values for the preceding chart.
```

Do not invent placeholder IDs. If a needed visual is missing, write the section
with a table and tell the user which chart-generator visual would help.

## Visual sanity checks

Before finalizing visual placeholders:

- Does every placeholder appear in `article-visuals.md`?
- If `chart-manifest.json` exists, does every placeholder ID have a matching chart?
- Does the paragraph before the placeholder explain why the reader should look at it?
- Does the caption describe the metric, aggregation, and uncertainty when relevant?
- Is the same data also available in a table or prose for readers who cannot see the image?

The chart generator owns rendered chart correctness. The report writer owns narrative
fit: whether the visual belongs, where it appears, and whether the surrounding prose
accurately explains it.
