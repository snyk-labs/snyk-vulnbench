# VulnBench V2 Completed Run Handoff

This document is the canonical orientation guide for the completed VulnBench
V2 execution. It connects the benchmark methodology to the actual execution
lineage, result files, metric semantics, DeepSec scoring policy, and reporting
constraints. Read this before analyzing or publishing the V2 results.

## Authoritative completed execution

Use this bundle for final analysis:

```text
results/executions/20260907-vulnbench-v2-deepsec-150-574753a2/
```

Final reconstructed status:

- Status: `completed`
- Successful runs: `180 / 180`
- Failed, interrupted, or pending runs: `0`
- Tasks: 20 attacker-reachable application fixtures
- Reference vulnerabilities: 108
- Observed execution cost: `$1,594.0825`
- Observed tokens: `3,695,597,430`

The authoritative source of truth is the set of per-run JSON records under
`runs/`. `progress.json`, `aggregates.json`, and `benchmark.jsonl` are
reconstructible snapshots. On 2026-09-27, `--status` rebuilt those snapshots
from the run ledger and confirmed 180/180 successful records.

Do not use the parent bundle as the final dataset:

```text
results/executions/20260901-vulnbench-v2-c08730c4/
```

The parent is an audit record. Its first 140 runs completed, but its original
30-turn DeepSec phase stopped after 10 successes, one turn-limit failure, and
29 pending runs.

## Execution lineage

The final execution is an offline fork of the parent:

- Imported from parent: 140 successful runs
  - Snyk Code: 20
  - Claude Code: 60
  - Codex Security: 60
- Discarded from child plan: all 11 parent DeepSec records
  - 10 successful 30-turn DeepSec-Claude runs
  - 1 failed 30-turn DeepSec-Claude run
- Fresh child runs: 40 DeepSec evaluations
  - `deepsec-claude-opus-5-xhigh-turns-150`: 20
  - `deepsec-codex-sol-xhigh-turns-150`: 20

The parent was never mutated. The child manifest contains fork lineage, parent
source/plan fingerprints, the parent manifest and run-ledger hashes, import
counts, discarded statuses, and discarded-spend metadata. Imported child run
records also retain their original parent run keys and source fingerprints.
The discarded parent DeepSec attempts consumed `$175.1349`; that historical
spend is auditable in `manifest.json` but is not included in the child's
`$1,594.0825` observed execution cost.

The revised DeepSec profiles use 150 turns per batch, matching DeepSec 2.3.7's
native default. The original 30-turn config IDs remain separate and must not be
mixed with the revised profiles.

### Reproduction caveat

`pnpm run benchmark:v2` still selects the original `vulnbench-v2` group, whose
DeepSec profiles use 30 turns. It does **not** reproduce this final matrix.
Select `--config-group vulnbench-v2-deepsec-150` to plan a new run with the
revised profiles. The completed execution itself is immutable: analyze or
resume it by execution ID rather than creating a replacement.

## Execution conditions and versions

- Repetitions: 1 per task/config pair
- Parent harness source commit: `9d9934fdc2045010bdfe9d05738be23b4df0234d`
- Child harness source commit: `0f59c77aa81b4ae018bc9d50f708ef661645e2d6`
- Claude Code CLI observed during preflight: 2.1.251
- Codex Security package: 0.1.24
- Codex Security plugin reported by completed scans: 0.1.79
- DeepSec CLI: 2.3.7
- DeepSec batch size: 5
- DeepSec concurrency: 1
- Revised DeepSec max turns per batch: 150
- Canonical model/security profiles used the configured LiteLLM gateway.

The child source commit differs from the parent because resumability, phased
execution, and safe fork/provenance support were added between executions.
Imported rows retain their parent source fingerprint so this distinction is
auditable rather than hidden.

## Matrix and phase completion

| Phase | Configs | Runs | Final status | Observed phase cost |
| --- | ---: | ---: | --- | ---: |
| Snyk Code | 1 | 20 | completed | `$0.0000` |
| Claude Code | 3 | 60 | completed | `$264.4365` |
| Codex Security | 3 | 60 | completed | `$974.4744` |
| DeepSec | 2 | 40 | completed | `$355.1715` |

`progress.observedUsage` is attempt-level operational telemetry. It includes
imported attempts and successful retries. The child deliberately excludes spend
from the discarded parent DeepSec attempts; that historical spend remains in
the parent lineage/audit data.

## V2 ground truth and primary metric

V2 tasks use:

```text
category: attacker-reachable-find-vulns
groundTruth: attacker-reachable
answer key: fixtures/<fixture>/findings-attacker-reachable.json
```

The reference set was curated independently of all participating tools. A
finding must first match the canonical vulnerability type or a conservative
`typeAliases` entry. Location matching uses normalized relative paths (with
documented basename/suffix compatibility) and an inclusive ±2-line tolerance.

For endpoint-aware runners—Snyk Code, Claude Code, and Codex Security—the
headline is **Attacker-Reachable Vulnerability Recall**. Depending on the
ground-truth flow shape, matching requires the active source/sink endpoint
policy documented in `docs/benchmark.md` and `docs/benchmark-management.md`.
Precision and the V2 score suite are secondary metrics.

The top-level `score` in each run is defined by `primaryMetric`. Never interpret
or aggregate scores without checking that field.

## Why DeepSec uses localized vulnerability recall

DeepSec exports vulnerability type plus file/line evidence, but its export does
not label locations as `source` or `sink`. Inventing endpoint roles would give
DeepSec evidence it did not actually report. Therefore DeepSec is scored with
the deliberately distinct primary metric:

```text
localized-vulnerability-recall
```

The implementation is `scoreLocalizedFindVulns()` in `src/scorer.ts`.

A reported DeepSec finding is a one-to-one true positive only when:

1. Its vulnerability type matches the ground-truth `type` or `typeAliases`.
2. At least one reported file/line location overlaps any curated flow location
   for that vulnerability within the inclusive ±2-line tolerance.
3. Neither the reported finding nor the reference vulnerability has already
   been consumed by another match.

Candidates are ranked by the number of matching locations, then deterministically
by vulnerability ID. Unmatched reported findings are false positives; unmatched
reference vulnerabilities are false negatives.

DeepSec's headline is:

```text
localized recall = true positives / (true positives + false negatives)
```

`details.localizedScore` also stores localized precision, F1, counts, and
`lineTolerance: 2`. The benchmark's top-level V2 `score` uses recall, not F1.

### Comparability rule

Do not directly average or rank DeepSec localized recall together with
endpoint-aware attacker-reachable recall. They use the same independent
reference set but different evidence requirements:

- Endpoint-aware runners report source/sink roles and use
  `attacker-reachable-vulnerability-recall`.
- DeepSec lacks roles and uses `localized-vulnerability-recall`.

Present the metrics side by side with explicit labels. Any cross-runner
comparison must disclose this limitation.

## DeepSec zero-score audit

All 40 revised DeepSec runs completed successfully. None of the zero scores are
execution errors, interrupted attempts, missing result records, or scorer
fallbacks.

### DeepSec Claude Opus 5 XHigh, 150 turns

- Successful fixtures: 20 / 20
- Macro localized recall: `37.52%`
- Macro localized precision: `9.43%`
- Zero-localized-recall fixtures: 8
- Nonzero-localized-recall fixtures: 12
- Every zero-recall fixture contained exported findings.
- Zero-run token usage ranged from approximately 494K to 11.29M tokens.

For those eight fixtures, DeepSec reported findings, but none matched both a
compatible vulnerability type and a curated file/line location within ±2
lines. They are legitimate zero localized-recall results.

### DeepSec Codex Sol XHigh, 150 turns

- Successful fixtures: 20 / 20
- Macro localized recall: `2.50%`
- Macro localized precision: `5.00%`
- Zero-localized-recall fixtures: 19
- Nonzero-localized-recall fixtures: 1
- Of the 19 zero-recall fixtures:
  - 16 exported no findings.
  - 3 exported findings that did not satisfy localized matching.
- Every zero run recorded model usage (approximately 64K–2.62M tokens).

The remembered phase positions were valid:

- `[37/40]` was a completed Codex DeepSec run with 0 localized recall.
- `[38/40]` was SassyReg, where one of two reference vulnerabilities matched,
  producing 50% localized recall.

The successful SassyReg match demonstrates that the Codex DeepSec
export/parser/scorer path was functioning. The 19 zeros indicate poor
performance of this DeepSec+Codex configuration on the active localized
criterion—not a batch execution failure. Attribute this result to the complete
configuration/harness, not to the underlying model in isolation.

There is nevertheless an operational under-scan caveat: many successful Codex
DeepSec runs stopped after very few turns, 16 exported no findings, and
per-run cost telemetry was unavailable even though token usage was recorded.
The records satisfy the benchmark's success contract and there is no evidence
of scorer fallback, but reports should disclose this behavior and characterize
the result as DeepSec+Codex harness/configuration performance rather than pure
model capability.

## Final config-level headlines

All values below are macro-averages across 20 fixtures. Tokens, cost, and
duration in config aggregates are means per fixture, not execution totals.

| Config | Primary metric | Macro recall | Macro precision |
| --- | --- | ---: | ---: |
| `snyk-code` | attacker-reachable recall | 82.43% | 54.92% |
| `opus-5-medium-security-review-with-snyk-mcp` | attacker-reachable recall | 75.21% | 84.58% |
| `opus-5-xhigh-security-review` | attacker-reachable recall | 79.26% | 77.68% |
| `sonnet-5-xhigh-security-review` | attacker-reachable recall | 67.04% | 78.08% |
| `codex-security-luna-xhigh` | attacker-reachable recall | 41.23% | 25.34% |
| `codex-security-terra-xhigh` | attacker-reachable recall | 30.13% | 17.54% |
| `codex-security-sol-xhigh` | attacker-reachable recall | 29.21% | 14.32% |
| `deepsec-claude-opus-5-xhigh-turns-150` | localized recall | 37.52% | 9.43% |
| `deepsec-codex-sol-xhigh-turns-150` | localized recall | 2.50% | 5.00% |

The table intentionally labels DeepSec differently. It is not one homogeneous
leaderboard metric.

## Authoritative files and inspection order

Start with:

1. `manifest.json`
   - Frozen tasks/configs/phases, source and config fingerprints, fork lineage.
2. `progress.json`
   - Reconstructed global/phase completion and attempt-level observed usage.
3. `aggregates.json`
   - Task and config macro-aggregates plus complete coverage.
4. `benchmark.jsonl`
   - Compatible run/task/config rows for charts, reports, jq, and pandas.
   - Filter on `_type == "run"` before per-run analysis; the file also contains
     task-aggregate and config-aggregate rows.
5. `runs/<config-id>/<task>--r001--<run-key>.json`
   - Authoritative attempt history, result, metrics, findings, and score details.
6. `artifacts/fork-audit.json`
   - Parent hash, import mapping, reset policy, and discarded-record audit.

Useful checks:

```bash
pnpm tsx src/index.ts --status \
  20260907-vulnbench-v2-deepsec-150-574753a2

jq '.status, .counts, .phases' \
  results/executions/20260907-vulnbench-v2-deepsec-150-574753a2/progress.json

jq 'select(._type == "config-aggregate") |
    {config: .runConfigId, metric: .primaryMetric, score, precision}' \
  results/executions/20260907-vulnbench-v2-deepsec-150-574753a2/benchmark.jsonl
```

## Reporting guardrails

- Use the final child bundle only for final metrics.
- Require global `completed`, 180/180 successes, and zero failed/interrupted
  runs before unqualified reporting.
- Disclose that 140 runs were imported from the parent and that DeepSec was
  rerun under distinct 150-turn profiles.
- Do not include the parent's partial 30-turn DeepSec rows in final charts.
- Keep DeepSec localized recall separate from endpoint-aware recall.
- A successful zero score is not an execution failure. Inspect `status`,
  `result`, `primaryMetric`, `details.localizedScore`, findings, and usage.
- `attemptsWithUnknownCost` means cost telemetry was unavailable; it is not a
  failed-run count.
- When publishing operational cost, distinguish child observed cost from
  discarded parent DeepSec spend retained in lineage metadata.

## Related implementation and methodology references

- `docs/benchmark.md`
  - Pipeline, result schema, V2 endpoint-aware policies, aggregation, resume,
    phased execution, and fork semantics.
- `docs/benchmark-management.md`
  - Ground-truth schema, line/path matching, DeepSec/Codex Security adapters,
    config groups, and operational workflows.
- `docs/litellm-integration.md`
  - Gateway protocol and credential routing for Claude, Codex Security, and
    both DeepSec backends.
- `src/scorer.ts`
  - `scoreAttackerReachableFindVulns()` and `scoreLocalizedFindVulns()`.
- `src/aggregator.ts`
  - Macro aggregation and primary-metric separation.
- `src/results/`
  - Execution manifests, fork provenance, checkpointing, and result I/O.

`docs/vulnbench-2-research-questions.md` is a research-design draft, not the
authoritative record of the completed execution. When it conflicts with this
handoff or the final child manifest, use this handoff and the manifest.
