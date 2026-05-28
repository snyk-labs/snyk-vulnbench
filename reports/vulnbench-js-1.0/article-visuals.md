# Benchmark Results

Multi-task comparison: js-project-copperline-find-vulns, js-project-goldleaf-find-vulns, js-project-ironclad-find-vulns, js-project-nightowl-find-vulns, js-project-purplehaze-find-vulns, js-project-riverbend-find-vulns, js-project-shadowfox-find-vulns, js-project-silvergate-find-vulns, js-project-skylark-find-vulns, js-project-tigerteam-find-vulns

Generated from `results/benchmark-2026-05-20T23-06-29-348Z.jsonl`.

Use this file as the article handoff. Insert the placeholders below where each visual should appear.

### FIG-1: Headline score
Placeholder: `<!-- VISUAL: headline-score -->`

Use: Use in the main Results section when introducing the overall benchmark comparison.

Caption: Macro-averaged benchmark score across all fixtures. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-headline-score`
Data: `config-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-2: Headline session duration
Placeholder: `<!-- VISUAL: headline-duration -->`

Use: Use when discussing benchmark speed and operational latency.

Caption: Macro-averaged wall-clock session duration across benchmark fixtures. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-headline-duration`
Data: `config-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-3: Headline total tokens
Placeholder: `<!-- VISUAL: headline-total-tokens -->`

Use: Use when discussing model context usage and inference footprint.

Caption: Macro-averaged total tokens per config. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-headline-total-tokens`
Data: `config-aggregate`, metric `totalTokens`.

Talking points:
- Lower token usage generally means lower inference load for model runs.

### FIG-4: Headline estimated cost
Placeholder: `<!-- VISUAL: headline-cost -->`

Use: Use when comparing model-session costs.

Caption: Macro-averaged estimated session cost in USD. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-headline-cost`
Data: `config-aggregate`, metric `totalCostUsd`.

Talking points:
- Command runs are not model sessions, so their USD cost is shown as N/A.

### FIG-5: Headline recall and precision
Placeholder: `<!-- VISUAL: headline-recall-precision -->`

Use: Use when explaining detection behavior: coverage of known vulnerabilities versus false-positive control.

Caption: Macro-averaged recall and precision for find-vulns tasks.

Source: `index.html#chart-headline-recall-precision`
Data: `config-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-6: Score vs estimated cost
Placeholder: `<!-- VISUAL: headline-score-vs-cost -->`

Use: Use as a Pareto-style tradeoff visual for model configs only.

Caption: Model-only cost/quality tradeoff. Better points move toward the top-left: higher score at lower estimated session cost.

Source: `index.html#chart-headline-score-vs-cost`
Data: `config-aggregate`, metric `score-vs-cost`.

Talking points:
- Snyk Code SAST is excluded because command rows do not have comparable model-session cost.
- Claude Opus 4.6 Medium is the apparent dominant point in this tradeoff view.

### FIG-7: Score vs session duration
Placeholder: `<!-- VISUAL: headline-score-vs-duration -->`

Use: Use when comparing benchmark quality against elapsed runtime.

Caption: Speed/quality tradeoff across model and command configs. Better points move toward the top-left: higher score in less wall-clock time.

Source: `index.html#chart-headline-score-vs-duration`
Data: `config-aggregate`, metric `score-vs-duration`.

Talking points:
- Snyk Code SAST is the apparent dominant point in this tradeoff view.

### FIG-8: Recall vs precision
Placeholder: `<!-- VISUAL: headline-recall-vs-precision -->`

Use: Use when explaining whether configs are recall-oriented or precision-oriented.

Caption: Detection tradeoff for find-vulns tasks. Better points move toward the top-right: more known vulnerabilities found with fewer false positives.

Source: `index.html#chart-headline-recall-vs-precision`
Data: `config-aggregate`, metric `recall-vs-precision`.

Talking points:
- Snyk Code SAST is the apparent dominant point in this tradeoff view.

### FIG-9: Score stability
Placeholder: `<!-- VISUAL: headline-score-stability -->`

Use: Use when discussing repeatability across benchmark repetitions.

Caption: Quality and repeated-run stability. Better points move toward the top-left: higher score with lower score standard deviation.

Source: `index.html#chart-headline-score-stability`
Data: `config-aggregate`, metric `score-stability`.

Talking points:
- A zero standard deviation for command-based SAST is meaningful for deterministic repeated runs.
- Snyk Code SAST is the apparent dominant point in this tradeoff view.

### FIG-10: JS Snippet (Plugin Installer): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-copperline-score -->`

Use: Use when discussing per-fixture performance for js-project-copperline-find-vulns.

Caption: Mean benchmark score for JS Snippet (Plugin Installer): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-copperline-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-11: JS Snippet (Plugin Installer): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-copperline-duration -->`

Use: Use when discussing per-fixture runtime for js-project-copperline-find-vulns.

Caption: Mean wall-clock session duration for JS Snippet (Plugin Installer): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-copperline-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-12: JS Snippet (Plugin Installer): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-copperline-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-copperline-find-vulns.

Caption: Mean total tokens for JS Snippet (Plugin Installer): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-copperline-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-13: JS Snippet (Plugin Installer): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-copperline-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-copperline-find-vulns.

Caption: Mean estimated session cost in USD for JS Snippet (Plugin Installer): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-copperline-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-14: JS Snippet (Plugin Installer): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-copperline-recall-precision -->`

Use: Use when discussing detection behavior for js-project-copperline-find-vulns.

Caption: Mean recall and precision for JS Snippet (Plugin Installer): Find Vulnerabilities.

Source: `index.html#chart-js-project-copperline-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-15: JS Snippet (Report Preview): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-goldleaf-score -->`

Use: Use when discussing per-fixture performance for js-project-goldleaf-find-vulns.

Caption: Mean benchmark score for JS Snippet (Report Preview): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-goldleaf-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-16: JS Snippet (Report Preview): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-goldleaf-duration -->`

Use: Use when discussing per-fixture runtime for js-project-goldleaf-find-vulns.

Caption: Mean wall-clock session duration for JS Snippet (Report Preview): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-goldleaf-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-17: JS Snippet (Report Preview): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-goldleaf-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-goldleaf-find-vulns.

Caption: Mean total tokens for JS Snippet (Report Preview): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-goldleaf-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-18: JS Snippet (Report Preview): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-goldleaf-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-goldleaf-find-vulns.

Caption: Mean estimated session cost in USD for JS Snippet (Report Preview): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-goldleaf-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-19: JS Snippet (Report Preview): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-goldleaf-recall-precision -->`

Use: Use when discussing detection behavior for js-project-goldleaf-find-vulns.

Caption: Mean recall and precision for JS Snippet (Report Preview): Find Vulnerabilities.

Source: `index.html#chart-js-project-goldleaf-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-20: JS App (Knex/Postgres 3): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-ironclad-score -->`

Use: Use when discussing per-fixture performance for js-project-ironclad-find-vulns.

Caption: Mean benchmark score for JS App (Knex/Postgres 3): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-ironclad-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-21: JS App (Knex/Postgres 3): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-ironclad-duration -->`

Use: Use when discussing per-fixture runtime for js-project-ironclad-find-vulns.

Caption: Mean wall-clock session duration for JS App (Knex/Postgres 3): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-ironclad-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-22: JS App (Knex/Postgres 3): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-ironclad-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-ironclad-find-vulns.

Caption: Mean total tokens for JS App (Knex/Postgres 3): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-ironclad-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-23: JS App (Knex/Postgres 3): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-ironclad-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-ironclad-find-vulns.

Caption: Mean estimated session cost in USD for JS App (Knex/Postgres 3): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-ironclad-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-24: JS App (Knex/Postgres 3): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-ironclad-recall-precision -->`

Use: Use when discussing detection behavior for js-project-ironclad-find-vulns.

Caption: Mean recall and precision for JS App (Knex/Postgres 3): Find Vulnerabilities.

Source: `index.html#chart-js-project-ironclad-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-25: JS Todo App (SQLite 4): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-nightowl-score -->`

Use: Use when discussing per-fixture performance for js-project-nightowl-find-vulns.

Caption: Mean benchmark score for JS Todo App (SQLite 4): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-nightowl-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-26: JS Todo App (SQLite 4): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-nightowl-duration -->`

Use: Use when discussing per-fixture runtime for js-project-nightowl-find-vulns.

Caption: Mean wall-clock session duration for JS Todo App (SQLite 4): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-nightowl-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-27: JS Todo App (SQLite 4): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-nightowl-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-nightowl-find-vulns.

Caption: Mean total tokens for JS Todo App (SQLite 4): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-nightowl-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-28: JS Todo App (SQLite 4): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-nightowl-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-nightowl-find-vulns.

Caption: Mean estimated session cost in USD for JS Todo App (SQLite 4): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-nightowl-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-29: JS Todo App (SQLite 4): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-nightowl-recall-precision -->`

Use: Use when discussing detection behavior for js-project-nightowl-find-vulns.

Caption: Mean recall and precision for JS Todo App (SQLite 4): Find Vulnerabilities.

Source: `index.html#chart-js-project-nightowl-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-30: JS Todo App (SQLite 5): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-purplehaze-score -->`

Use: Use when discussing per-fixture performance for js-project-purplehaze-find-vulns.

Caption: Mean benchmark score for JS Todo App (SQLite 5): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-purplehaze-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-31: JS Todo App (SQLite 5): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-purplehaze-duration -->`

Use: Use when discussing per-fixture runtime for js-project-purplehaze-find-vulns.

Caption: Mean wall-clock session duration for JS Todo App (SQLite 5): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-purplehaze-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-32: JS Todo App (SQLite 5): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-purplehaze-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-purplehaze-find-vulns.

Caption: Mean total tokens for JS Todo App (SQLite 5): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-purplehaze-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-33: JS Todo App (SQLite 5): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-purplehaze-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-purplehaze-find-vulns.

Caption: Mean estimated session cost in USD for JS Todo App (SQLite 5): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-purplehaze-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-34: JS Todo App (SQLite 5): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-purplehaze-recall-precision -->`

Use: Use when discussing detection behavior for js-project-purplehaze-find-vulns.

Caption: Mean recall and precision for JS Todo App (SQLite 5): Find Vulnerabilities.

Source: `index.html#chart-js-project-purplehaze-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-35: JS Snippet (Import Profile): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-riverbend-score -->`

Use: Use when discussing per-fixture performance for js-project-riverbend-find-vulns.

Caption: Mean benchmark score for JS Snippet (Import Profile): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-riverbend-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-36: JS Snippet (Import Profile): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-riverbend-duration -->`

Use: Use when discussing per-fixture runtime for js-project-riverbend-find-vulns.

Caption: Mean wall-clock session duration for JS Snippet (Import Profile): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-riverbend-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-37: JS Snippet (Import Profile): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-riverbend-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-riverbend-find-vulns.

Caption: Mean total tokens for JS Snippet (Import Profile): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-riverbend-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-38: JS Snippet (Import Profile): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-riverbend-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-riverbend-find-vulns.

Caption: Mean estimated session cost in USD for JS Snippet (Import Profile): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-riverbend-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-39: JS Snippet (Import Profile): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-riverbend-recall-precision -->`

Use: Use when discussing detection behavior for js-project-riverbend-find-vulns.

Caption: Mean recall and precision for JS Snippet (Import Profile): Find Vulnerabilities.

Source: `index.html#chart-js-project-riverbend-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-40: JS App (Knex/Postgres 2): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-shadowfox-score -->`

Use: Use when discussing per-fixture performance for js-project-shadowfox-find-vulns.

Caption: Mean benchmark score for JS App (Knex/Postgres 2): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-shadowfox-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-41: JS App (Knex/Postgres 2): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-shadowfox-duration -->`

Use: Use when discussing per-fixture runtime for js-project-shadowfox-find-vulns.

Caption: Mean wall-clock session duration for JS App (Knex/Postgres 2): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-shadowfox-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-42: JS App (Knex/Postgres 2): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-shadowfox-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-shadowfox-find-vulns.

Caption: Mean total tokens for JS App (Knex/Postgres 2): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-shadowfox-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-43: JS App (Knex/Postgres 2): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-shadowfox-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-shadowfox-find-vulns.

Caption: Mean estimated session cost in USD for JS App (Knex/Postgres 2): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-shadowfox-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-44: JS App (Knex/Postgres 2): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-shadowfox-recall-precision -->`

Use: Use when discussing detection behavior for js-project-shadowfox-find-vulns.

Caption: Mean recall and precision for JS App (Knex/Postgres 2): Find Vulnerabilities.

Source: `index.html#chart-js-project-shadowfox-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-45: JS Snippet (Redirect Handoff): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-silvergate-score -->`

Use: Use when discussing per-fixture performance for js-project-silvergate-find-vulns.

Caption: Mean benchmark score for JS Snippet (Redirect Handoff): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-silvergate-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-46: JS Snippet (Redirect Handoff): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-silvergate-duration -->`

Use: Use when discussing per-fixture runtime for js-project-silvergate-find-vulns.

Caption: Mean wall-clock session duration for JS Snippet (Redirect Handoff): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-silvergate-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-47: JS Snippet (Redirect Handoff): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-silvergate-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-silvergate-find-vulns.

Caption: Mean total tokens for JS Snippet (Redirect Handoff): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-silvergate-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-48: JS Snippet (Redirect Handoff): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-silvergate-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-silvergate-find-vulns.

Caption: Mean estimated session cost in USD for JS Snippet (Redirect Handoff): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-silvergate-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-49: JS Snippet (Redirect Handoff): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-silvergate-recall-precision -->`

Use: Use when discussing detection behavior for js-project-silvergate-find-vulns.

Caption: Mean recall and precision for JS Snippet (Redirect Handoff): Find Vulnerabilities.

Source: `index.html#chart-js-project-silvergate-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-50: JS Snippet (Shelf Validator): Find Vulnerabilities score
Placeholder: `<!-- VISUAL: js-project-skylark-score -->`

Use: Use when discussing per-fixture performance for js-project-skylark-find-vulns.

Caption: Mean benchmark score for JS Snippet (Shelf Validator): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-skylark-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-51: JS Snippet (Shelf Validator): Find Vulnerabilities session duration
Placeholder: `<!-- VISUAL: js-project-skylark-duration -->`

Use: Use when discussing per-fixture runtime for js-project-skylark-find-vulns.

Caption: Mean wall-clock session duration for JS Snippet (Shelf Validator): Find Vulnerabilities. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-skylark-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-52: JS Snippet (Shelf Validator): Find Vulnerabilities total tokens
Placeholder: `<!-- VISUAL: js-project-skylark-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-skylark-find-vulns.

Caption: Mean total tokens for JS Snippet (Shelf Validator): Find Vulnerabilities. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-skylark-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-53: JS Snippet (Shelf Validator): Find Vulnerabilities estimated cost
Placeholder: `<!-- VISUAL: js-project-skylark-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-skylark-find-vulns.

Caption: Mean estimated session cost in USD for JS Snippet (Shelf Validator): Find Vulnerabilities. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-skylark-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-54: JS Snippet (Shelf Validator): Find Vulnerabilities recall and precision
Placeholder: `<!-- VISUAL: js-project-skylark-recall-precision -->`

Use: Use when discussing detection behavior for js-project-skylark-find-vulns.

Caption: Mean recall and precision for JS Snippet (Shelf Validator): Find Vulnerabilities.

Source: `index.html#chart-js-project-skylark-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

### FIG-55: JS App: Find Vulnerabilities 1 score
Placeholder: `<!-- VISUAL: js-project-tigerteam-score -->`

Use: Use when discussing per-fixture performance for js-project-tigerteam-find-vulns.

Caption: Mean benchmark score for JS App: Find Vulnerabilities 1. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-tigerteam-score`
Data: `task-aggregate`, metric `score`.

Talking points:
- Higher values are better.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-56: JS App: Find Vulnerabilities 1 session duration
Placeholder: `<!-- VISUAL: js-project-tigerteam-duration -->`

Use: Use when discussing per-fixture runtime for js-project-tigerteam-find-vulns.

Caption: Mean wall-clock session duration for JS App: Find Vulnerabilities 1. Error bars show standard deviation across repeated runs.

Source: `index.html#chart-js-project-tigerteam-duration`
Data: `task-aggregate`, metric `sessionDurationMs`.

Talking points:
- Lower duration is better for throughput.
- Repeated runs are summarized as mean plus standard deviation.

### FIG-57: JS App: Find Vulnerabilities 1 total tokens
Placeholder: `<!-- VISUAL: js-project-tigerteam-total-tokens -->`

Use: Use when discussing per-fixture context usage for js-project-tigerteam-find-vulns.

Caption: Mean total tokens for JS App: Find Vulnerabilities 1. Command-based SAST rows use zero-token accounting.

Source: `index.html#chart-js-project-tigerteam-total-tokens`
Data: `task-aggregate`, metric `totalTokens`.

### FIG-58: JS App: Find Vulnerabilities 1 estimated cost
Placeholder: `<!-- VISUAL: js-project-tigerteam-cost -->`

Use: Use when discussing per-fixture model-session cost for js-project-tigerteam-find-vulns.

Caption: Mean estimated session cost in USD for JS App: Find Vulnerabilities 1. Command-based SAST rows report cost as not applicable.

Source: `index.html#chart-js-project-tigerteam-cost`
Data: `task-aggregate`, metric `totalCostUsd`.

### FIG-59: JS App: Find Vulnerabilities 1 recall and precision
Placeholder: `<!-- VISUAL: js-project-tigerteam-recall-precision -->`

Use: Use when discussing detection behavior for js-project-tigerteam-find-vulns.

Caption: Mean recall and precision for JS App: Find Vulnerabilities 1.

Source: `index.html#chart-js-project-tigerteam-recall-precision`
Data: `task-aggregate`, metric `recall-precision`.

Talking points:
- Recall measures known vulnerabilities found; precision measures how many reported findings matched ground truth.
- Higher recall and higher precision are both better.

