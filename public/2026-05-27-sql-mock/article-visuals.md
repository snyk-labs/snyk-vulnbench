# Tigerteam Non-Executable SQL Pattern Analysis

Generated from `reports/vulnbench-js-1.0/benchmark-2026-05-20T23-06-29-348Z.jsonl`.

Use this file as the article handoff for custom Tigerteam non-executable SQL-pattern visuals.

### FIG-1: False-positive profile
Placeholder: `<!-- VISUAL: tigerteam-fp-profile -->`

Use: Use when comparing non-executable SQL-pattern false positives against other false-positive noise.

Caption: False-positive profile on Tigerteam. Every model configuration produced one false positive on the non-executable SQL pattern per run; Snyk Code SAST produced zero false positives.

Source: `index.html#chart-tigerteam-fp-profile`
Data: `run`, metric `sql-pattern-fp-vs-other-fp`.

Talking points:
- This directly compares non-executable SQL-pattern false positives against all other false positives.
- Every model configuration produced one SQL-pattern false positive per run.
- Snyk Code SAST is at the origin: zero SQL-pattern false positives and zero other false positives.

### FIG-2: Precision ablation
Placeholder: `<!-- VISUAL: tigerteam-precision-slope -->`

Use: Use when quantifying the precision cost of the SQL-shaped non-sink pattern.

Caption: Observed precision compared with counterfactual precision after removing only the non-executable SQL-pattern false positive.

Source: `index.html#chart-tigerteam-precision-slope`
Data: `run`, metric `precision-without-sql-pattern-fp`.

Talking points:
- Removing only the SQL-pattern false positive raises aggregate model precision from 69.4% to 82.6%.
- The counterfactual does not change recall; it isolates the precision cost of this false-positive pattern.
