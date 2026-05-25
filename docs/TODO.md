# Project TODO

IMPORTANT: This file should be considered as a general project bookkeeping of ToDos and enhancements to how the benchmarking project works but everything here is out of scope unless explicitly instructed to be implemented and addressed.

## Project structure

@TBD better design and structure for the project's architecture that allows it to be extended

## Project scorer

The current scorer works as follows:

```text
A reported finding is counted as a TP if:

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

Potential consideration for improvements from the above:
1. The scorer should first go through all findings reported and then capture the one closest to the matching criteria for the ground truth, rather than its current implementation which is a first-seen match is accounted for (which is a naive loop approach)
2. The scorer should also match the file as part of its criteria for a match 
3. The scorer should also match the line number as part of its criteria for a match but allow for a +-5 lines of difference match. Meaning, a ground-truth report for line number 15 should be matched if the reported finding is on line 10 or line 20 or anything between 10 to 20, but shouldn't match if it's anything else lower or higher line number.