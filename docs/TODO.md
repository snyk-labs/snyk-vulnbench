# Project TODO

IMPORTANT: This file should be considered as a general project bookkeeping of ToDos and enhancements to how the benchmarking project works but everything here is out of scope unless explicitly instructed to be implemented and addressed.

## Project structure

@TBD better design and structure for the project's architecture that allows it to be extended

## Project scorer

### VulnBench 1.0 scorer

```text
A V1 reported finding is counted as a TP if:

1. Its type normalizes to the same VulnType as a ground-truth vuln.
2. That ground-truth vuln has not already been matched by an earlier finding.

The scorer does not require these fields to match:

- file
- line
- severity
- description
- ground-truth id

Severity is normalized and stored, but it is not part of TP matching. File and line are retained in details.agentFindings and falsePositives for inspection, but they don’t affect precision/recall.

So a finding like command-injection at app.js:22 can match a ground-truth command-injection at app.js:17, while a later exact-line command-injection report becomes a duplicate FP. This makes scoring tolerant of line-number drift, but it can misattribute matches and duplicate penalties in cases like Copperline.
```

The V1 behavior is retained for historical compatibility with `findings.json` fixtures and past results.

### VulnBench 2.0 attacker-reachable scorer

V2 tasks opt into `findings-attacker-reachable.json` with `"groundTruth": "attacker-reachable"`. Their scorer addresses the original location-matching limitations:

1. It compares normalized vulnerability `type` and conservative `typeAliases`.
2. It matches normalized relative paths (or exact basenames) and allows an inclusive ±5-line difference.
3. It uses the ground truth's `filesRelated[].type` endpoint annotations:
   - one-location flows require a match to that `source` or `sink`;
   - exactly two locations accept both matching locations or a match to either endpoint;
   - longer flows require distinct reported locations matching both source and sink.
4. When duplicate vulnerability types exist, it chooses the qualifying unmatched candidate with the strongest endpoint/location overlap instead of relying only on ground-truth array order.

Intermediate flow locations remain useful diagnostics but do not increase the endpoint threshold. V1 scoring remains type-only.

V2 run rows also persist complete candidate/type/location comparisons and finding/vulnerability outcomes under `details.matchDiagnostics`, including structured failure reasons for report generation and post-hoc scoring analysis.

### Open scorer enhancements

1. Support selecting/configuring scorer implementations per benchmark execution instead of deriving the scorer only from task ground-truth metadata.
2. Decide whether any V2 location-aware behavior should be offered as an opt-in scorer for V1 fixtures without changing historical defaults.