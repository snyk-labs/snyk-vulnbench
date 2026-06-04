# LLM Security Review Repeatability

Generated from `reports/vulnbench-js-1.0/benchmark-2026-05-20T23-06-29-348Z.jsonl`.

Use this file as the article handoff for the repeatability-first Snyk VulnBench JS 1.0 narrative.

Finding signature for unmatched reports: taskId + runConfigId + vulnerability type + basename(file) + line.
True-positive signature: taskId + runConfigId + Snyk Code reference finding id.

### FIG-1: Unmatched model finding repeatability
Placeholder: `<!-- VISUAL: unmatched-finding-repeatability -->`

Use: Use as the lead visual for the non-determinism story.

Caption: Distribution of unique unmatched model findings by how often the same finding signature appeared across five repetitions of the same task and model config. Signature = task + config + vulnerability type + file + line.

Source: `index.html#chart-unmatched-finding-repeatability`
Data: `raw-run-derived`, metric `false-positive-repetition-frequency`.

Talking points:
- 80 of 161 unique unmatched findings (49.7%) appeared in only one of five runs.
- 22 of 161 unique unmatched findings (13.7%) appeared in all five runs.
- This isolates extra model reports rather than Snyk Code reference-matched true positives.

### FIG-2: Reference-matched model finding repeatability
Placeholder: `<!-- VISUAL: matched-finding-repeatability -->`

Use: Use directly after unmatched finding repeatability to show that true positives were much more stable than extra reports.

Caption: Distribution of reference-matched model findings by how often the same Snyk Code reference finding was matched across five repetitions of the same task and model config.

Source: `index.html#chart-matched-finding-repeatability`
Data: `raw-run-derived`, metric `true-positive-repetition-frequency`.

Talking points:
- 134 of 158 unique reference-matched findings (84.8%) appeared in all five runs.
- The instability is concentrated in extra model reports, not in every model finding equally.

### FIG-3: Non-SQL unmatched finding repeatability
Placeholder: `<!-- VISUAL: non-sql-unmatched-repeatability -->`

Use: Use when discussing how a few stable SQL-shaped exceptions otherwise mask the instability of extra model reports.

Caption: Distribution of unmatched model findings after excluding SQL injection reports, which include one deliberate decoy and one likely Snyk Code product-gap case.

Source: `index.html#chart-non-sql-unmatched-repeatability`
Data: `raw-run-derived`, metric `non-sql-false-positive-repetition-frequency`.

Talking points:
- 79 of 149 non-SQL unmatched findings (53.0%) appeared in only one of five runs.
- 12 of 149 non-SQL unmatched findings (8.1%) appeared in all five runs.

### FIG-4: Headline score variance by configuration
Placeholder: `<!-- VISUAL: score-variance-by-config -->`

Use: Use alongside the recurrence charts to connect finding-level instability to benchmark-level score variance.

Caption: Headline Snyk-reference F1 standard deviation across repeated runs. Lower values indicate more repeatable benchmark outcomes under the same prompt and code.

Source: `index.html#chart-score-variance-by-config`
Data: `config-aggregate`, metric `scoreStdDev`.

Talking points:
- Claude Sonnet 4.6 High had the largest headline Snyk-reference F1 standard deviation at 3.5 percentage points.
- Snyk Code SAST had 0.0 percentage-point score standard deviation against the Snyk Code reference set.

### FIG-5: Snyk-reference F1 vs variance by configuration
Placeholder: `<!-- VISUAL: score-stability-labeled-scatter -->`

Use: Use as an experimental repeatability visual when Snyk Code's zero-variance reference point should be visually prominent.

Caption: Snyk-reference F1 plotted against headline Snyk-reference F1 standard deviation. Better points move toward the top-left: higher agreement score with lower repeated-run variance. Snyk Code SAST is highlighted in purple at zero variance.

Source: `index.html#chart-score-stability-labeled-scatter`
Data: `config-aggregate`, metric `score-vs-scoreStdDev`.

Talking points:
- Snyk Code SAST sits at 100.0% Snyk-reference F1 and 0.0 percentage-point variance because it reproduces the reference set deterministically.
- Claude Sonnet 4.6 High is farthest right, with 3.5 percentage-point Snyk-reference F1 standard deviation across repeated runs.
- The stronger model tradeoff is toward the upper-left: high agreement with lower run-to-run variance.

### FIG-6: Score vs estimated model-session cost
Placeholder: `<!-- VISUAL: score-vs-cost-repeatability-story -->`

Use: Use in the cost-quality section to show that Opus 4.7 Max cost more and scored lower than Opus 4.6 Medium.

Caption: Model-only cost/quality tradeoff. Better points move toward the top-left: higher Snyk-reference F1 at lower estimated model-session cost.

Source: `index.html#chart-score-vs-cost-repeatability-story`
Data: `config-aggregate`, metric `score-vs-cost`.

Talking points:
- Claude Opus 4.7 Max cost 5.67x Claude Opus 4.6 Medium while scoring lower: 68.8% vs 75.4% Snyk-reference F1.
- Claude Opus 4.6 Medium was the strongest model cost/quality point in this run.

### FIG-7: SQL-shaped reports outside the reference set
Placeholder: `<!-- VISUAL: sql-shaped-complementarity -->`

Use: Use in the complementarity section to show why unmatched model reports are not all equivalent.

Caption: Model runs that reported SQL injection outside the Snyk Code reference set. Tigerteam is a deliberate non-executable SQL decoy; Nightowl is a likely Snyk Code product-gap case.

Source: `index.html#chart-sql-shaped-complementarity`
Data: `raw-run-derived`, metric `model-sql-extra-run-count`.

Talking points:
- Models reported SQL injection in 25 of 25 Tigerteam model runs, but the helper never executes SQL.
- Models reported SQL injection in 25 of 25 Nightowl model runs; that finding is likely valid and should be investigated as a Snyk Code product gap.

### FIG-8: Nightowl missed-reference pattern
Placeholder: `<!-- VISUAL: nightowl-recall-cliff -->`

Use: Use to support the claim that models often identify one representative pattern but fail to enumerate repeated vulnerable sinks in larger app-like fixtures.

Caption: Reference findings missed by Claude Opus 4.6 High on the larger Nightowl fixture across five repetitions. Path traversal was missed in all 15 opportunities, while resource-limit findings were missed in 10 of 15 opportunities.

Source: `index.html#chart-nightowl-recall-cliff`
Data: `raw-run-derived`, metric `nightowl-opus-high-miss-rate`.

Talking points:
- Claude Opus 4.6 High was stable on Nightowl, but stably incomplete: 40.0% Snyk-reference F1 in every repetition.
- Snyk Code enumerated repeated path traversal and resource-limit findings that the model missed.
