# Model-Visible Repeatability And Complementarity

Generated from `reports/vulnbench-js-1.0/benchmark-2026-05-20T23-06-29-348Z.jsonl`.

Use this file as the article handoff for the model-callout visual storyline.

Unmatched finding signature: taskId + vulnerability type + basename(file) + line, grouped by model configuration.
True-positive signature: taskId + Snyk Code reference finding id, grouped by model configuration.

### FIG-1: One-run-only unmatched findings by model
Placeholder: `<!-- VISUAL: one-run-unmatched-by-model -->`

Use: Use as the lead visual: it names the model configurations and shows non-deterministic extra findings directly.

Caption: Share of each model configuration's unique unmatched finding signatures that appeared in only one of five repeated runs. Signature = task + vulnerability type + file + line, grouped by model config.

Source: `index.html#chart-one-run-unmatched-by-model`
Data: `raw-run-derived`, metric `one-run-unmatched-finding-share`.

Talking points:
- Claude Opus 4.6 Medium: 0 of 5 unique unmatched findings (0.0%) appeared in only one of five runs.
- Claude Opus 4.6 High: 1 of 6 unique unmatched findings (16.7%) appeared in only one of five runs.
- Claude Opus 4.7 Max: 17 of 36 unique unmatched findings (47.2%) appeared in only one of five runs.
- Claude Sonnet 4.6 Medium: 37 of 60 unique unmatched findings (61.7%) appeared in only one of five runs.
- Claude Sonnet 4.6 High: 25 of 54 unique unmatched findings (46.3%) appeared in only one of five runs.

### FIG-2: Unmatched findings stable in all five runs by model
Placeholder: `<!-- VISUAL: stable-unmatched-by-model -->`

Use: Use after the one-run chart to show which extra findings were stable rather than incidental.

Caption: Share of unique unmatched finding signatures that appeared in all five repeated runs for each model configuration.

Source: `index.html#chart-stable-unmatched-by-model`
Data: `raw-run-derived`, metric `all-run-unmatched-finding-share`.

Talking points:
- Claude Opus 4.6 Medium: 3 of 5 unique unmatched findings (60.0%) appeared in all five runs.
- Claude Opus 4.6 High: 3 of 6 unique unmatched findings (50.0%) appeared in all five runs.
- Claude Opus 4.7 Max: 6 of 36 unique unmatched findings (16.7%) appeared in all five runs.
- Claude Sonnet 4.6 Medium: 5 of 60 unique unmatched findings (8.3%) appeared in all five runs.
- Claude Sonnet 4.6 High: 5 of 54 unique unmatched findings (9.3%) appeared in all five runs.

### FIG-3: Reference-matched findings stable in all five runs by model
Placeholder: `<!-- VISUAL: stable-matched-by-model -->`

Use: Use to contrast noisy unmatched reports with much more stable reference-matched findings.

Caption: Share of unique Snyk Code reference findings matched in all five repeated runs for each model configuration.

Source: `index.html#chart-stable-matched-by-model`
Data: `raw-run-derived`, metric `all-run-matched-finding-share`.

Talking points:
- Claude Opus 4.6 Medium: 25 of 25 unique reference-matched findings (100.0%) appeared in all five runs.
- Claude Opus 4.6 High: 25 of 26 unique reference-matched findings (96.2%) appeared in all five runs.
- Claude Opus 4.7 Max: 26 of 35 unique reference-matched findings (74.3%) appeared in all five runs.
- Claude Sonnet 4.6 Medium: 29 of 36 unique reference-matched findings (80.6%) appeared in all five runs.
- Claude Sonnet 4.6 High: 29 of 36 unique reference-matched findings (80.6%) appeared in all five runs.

### FIG-4: Reference finding coverage by vulnerability type and config
Placeholder: `<!-- VISUAL: reference-coverage-by-type-and-config -->`

Use: Use as the main complementarity visual: it names each model and shows which vulnerability classes were consistently covered or missed.

Caption: Mean recall against the Snyk Code reference set by vulnerability type and configuration. Snyk Code is shown as deterministic reference reproduction; model rows show where agentic review agrees or falls short by class.

Source: `index.html#chart-reference-coverage-by-type-and-config`
Data: `raw-run-derived`, metric `reference-recall-by-vulnerability-type`.

Talking points:
- Model rows are strongest on high-signal exploit shapes such as command injection, code injection, hardcoded credentials, SQL injection, SSRF, and open redirect.
- Coverage is weaker on resource-limit findings, improper sanitization/type-validation, insecure transport, and repeated path traversal flows.
- Snyk Code appears as 100% because it is the deterministic reference set for this benchmark, not because this chart proves universal accuracy.

### FIG-5: Extra reports by vulnerability type and model
Placeholder: `<!-- VISUAL: extra-reports-by-type-and-model -->`

Use: Use after the coverage heatmap to show how model configurations differ in the extra findings they introduce.

Caption: Average unmatched reports per model run by vulnerability type and model configuration. These include model false positives, adjacent review comments, and likely product-gap candidates outside the Snyk Code reference set.

Source: `index.html#chart-extra-reports-by-type-and-model`
Data: `raw-run-derived`, metric `false-positive-type-rate-by-config`.

Talking points:
- Sonnet configurations produce a broader spread of extra vulnerability classes than Opus 4.6 Medium/High.
- SQL-shaped extras appear across all model configs because the dataset contains both a non-executable SQL-shaped mock helper and a likely Snyk Code product gap.

### FIG-6: Larger multi-file fixture score by configuration
Placeholder: `<!-- VISUAL: larger-fixture-score-by-config -->`

Use: Use when explaining that the larger app-like fixture created a recall cliff for model configurations.

Caption: Mean benchmark score for the larger multi-file fixture. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-larger-fixture-score-by-config`
Data: `task-aggregate`, metric `larger-fixture-score`.

Talking points:
- Claude Opus 4.6 High was the best model on the larger multi-file fixture at 40.0% Snyk-reference F1, while Snyk Code reproduced the reference set at 100.0%.
- The issue was not only noise: models missed repeated path traversal and resource-limit findings.

### FIG-7: Score vs estimated model-session cost
Placeholder: `<!-- VISUAL: score-vs-cost-model-callouts -->`

Use: Use in the cost-quality section to show that Opus 4.7 Max cost more and scored lower than Opus 4.6 Medium.

Caption: Model-only cost/quality tradeoff. Better points move toward the top-left: higher Snyk-reference F1 at lower estimated model-session cost.

Source: `index.html#chart-score-vs-cost-model-callouts`
Data: `config-aggregate`, metric `score-vs-cost`.

Talking points:
- Claude Opus 4.7 Max cost 5.67x Claude Opus 4.6 Medium while scoring lower: 68.8% vs 75.4% Snyk-reference F1.
- Claude Opus 4.6 Medium was the strongest model cost/quality point in this run.
