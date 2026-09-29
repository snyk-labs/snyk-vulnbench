# VulnBench V2 Completed Execution

This publication preserves the complete execution lineage for the finished
VulnBench V2 benchmark. The original directories under `results/executions/`
were copied into deterministic gzip-compressed tar archives; they were not
moved or modified.

## Which bundle to analyze

The authoritative dataset is:

```text
20260907-vulnbench-v2-deepsec-150-574753a2
```

It contains 180 successful runs, with zero failed, interrupted, pending, or
running items. Use it for all final metrics, charts, and publication claims.

Its parent is retained for provenance and audit only:

```text
20260901-vulnbench-v2-c08730c4
```

The parent stopped with 150 successful runs, one failed run, and 29 pending
runs. It includes partial 30-turn DeepSec work that must not be mixed into the
final dataset. The child imported the first 140 compatible successful runs and
replaced the DeepSec phase with 40 fresh 150-turn runs.

See
[`docs/vulnbench-v2-run-handoff.md`](../../../docs/vulnbench-v2-run-handoff.md)
for scoring semantics, final aggregates, fork lineage, the DeepSec zero-score
audit, and reporting guardrails.

## Contents

- `index.json` — machine-readable publication metadata, roles, execution
  statuses, plan fingerprints, file counts, sizes, and checksums.
- `SHA256SUMS` — SHA-256 checksums for the two compressed archives.
- `bundles/<execution-id>.tar.gz` — complete copies of the parent and child
  execution directories.
- `checksums/<execution-id>.sha256` — SHA-256 checksum for every file inside
  each corresponding execution directory.

The archives preserve all manifests, run records, attempt histories, aggregate
snapshots, compatible JSONL output, fork audit metadata, and execution logs
present in the source bundles. Archive ownership and timestamps are normalized
for reproducibility; file contents and paths are unchanged.

## Verify integrity

From this directory:

```bash
sha256sum -c SHA256SUMS
```

To verify every file in the authoritative child:

```bash
PUB="$PWD"
DEST="$(mktemp -d)"
tar -xzf \
  bundles/20260907-vulnbench-v2-deepsec-150-574753a2.tar.gz \
  -C "$DEST"
(
  cd "$DEST/20260907-vulnbench-v2-deepsec-150-574753a2"
  sha256sum -c \
    "$PUB/checksums/20260907-vulnbench-v2-deepsec-150-574753a2.sha256"
)
```

## Analysis workflow

Extract the authoritative child archive, then inspect files in this order:

1. `manifest.json` — frozen tasks, configs, phases, source fingerprints, and
   fork lineage.
2. `progress.json` — completion and attempt-level observed usage.
3. `aggregates.json` — task and config macro-aggregates.
4. `benchmark.jsonl` — run, task-aggregate, and config-aggregate rows.
5. `runs/<config-id>/*.json` — authoritative per-run findings, attempts,
   metrics, and scoring details.
6. `artifacts/fork-audit.json` — parent integrity and import/discard mapping.

Filter `benchmark.jsonl` on `_type == "run"` before per-run analysis.

DeepSec rows use `localized-vulnerability-recall`; all other V2 participants
use `attacker-reachable-vulnerability-recall`. These metrics must remain
separately labeled and must not be averaged into one leaderboard.

The recorded `$1,594.0825` execution cost is observed known cost, not complete
provider spend. DeepSec Codex recorded token usage but no dollar cost, so its
20 run costs are `null` and excluded from that amount.

## Publication safety

A credential-assignment scan of both source bundles found no stored provider
or gateway credentials. The only matching assignments were redacted
`SNYK_TOKEN` placeholders in the frozen manifests. The data does contain
model-generated security findings and excerpts from intentionally vulnerable
benchmark fixtures.
