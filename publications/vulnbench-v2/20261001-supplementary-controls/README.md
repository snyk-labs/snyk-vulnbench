# VulnBench V2 Supplementary Control Runs

This publication preserves two supplementary executions run on 2026-10-01 and
three derived sensitivity rescoring files. It supplements—but never replaces—
the authoritative VulnBench V2 child:

```text
20260907-vulnbench-v2-deepsec-150-574753a2
```

Do not merge rows from these bundles into the authoritative V2 aggregates.
Analyze each supplementary arm separately and label it as a control or
repeatability study.

## Bundles

### S1: supplementary prompt control

```text
20261001-default-5b51e708
```

Role: `supplementary-control`

This execution compares two Claude Code Opus 5 arms over the same 20 V2 tasks:

- medium effort with the built-in `/security-review` command;
- xhigh effort with the benchmark's default audit prompt and no
  `/security-review`.

Final status was 39/40 successful. The
`app-project-halloween-attacker-reachable-find-vulns` run failed twice for
`opus-5-xhigh-default-prompt`. Both attempts were aborted by SIGTERM about four
minutes into the run. The cause was not determined, and the disposable
per-attempt Claude transcript directories were not retained. That fixture is
excluded from the xhigh control arm's aggregate; do not treat it as a scored
zero or impute a result.

### S2: supplementary Snyk repeatability

```text
20261001-default-0bc94ea4
```

Role: `supplementary-repeatability`

This execution runs Snyk Code twice on each of the same 20 V2 tasks. All 40
runs completed successfully. Use the two repetitions to inspect deterministic
score and runtime behavior; do not fold them into the authoritative V2 Snyk
aggregate.

## Execution conditions

- Run date: 2026-10-01
- Harness commit:
  `3b0fd00752a4890d5fc0c3b547be889f2fe051a5`
- Related authoritative execution:
  `20260907-vulnbench-v2-deepsec-150-574753a2`
- Gateway and model aliases: identical to the authoritative V2 execution
- Claude Code binary recorded per successful S1 run:
  `2.1.251 (Claude Code)`
- Snyk CLI recorded per S2 run: `1.1305.1`

Tasks, attacker-reachable ground truth, and active task prompts are identical
to V2. Three copied fixture trees—Flask Bones, Pygmy, and Rob's Awesome—differ
from their earlier archived trees only in git-ignored cache or log files; those
files are not benchmark inputs or ground truth.

## Derived ground-truth sensitivity files

`derived/rescored-gtfix/` contains non-mutating rescoring output generated after
commit:

```text
93ef5af3acb79afb0e9cebaa83b837f3e3184bf4
```

That commit removes one duplicate unlabelled Iguana
`src/gitintegration/frontend.py:45` location while retaining the labelled sink.

- `v2-child.jsonl` — authoritative child rows rescored against the corrected
  reference set.
- `s1.jsonl` — S1 rows rescored against the corrected reference set.
- `s2.jsonl` — S2 rows rescored against the corrected reference set.

These files have role `derived-rescore-gt-fix`. They are sensitivity analysis
only. The authoritative V2 publication's frozen ground truth and metrics remain
the headline record.

## Contents

- `index.json` — machine-readable provenance, bundle roles, statuses, counts,
  source/plan fingerprints, sizes, and checksums.
- `SHA256SUMS` — checksums for both archives and all three derived JSONL files.
- `bundles/<execution-id>.tar.gz` — deterministic copies of the complete S1
  and S2 execution directories.
- `checksums/<execution-id>.sha256` — checksum for every file in the
  corresponding execution directory.
- `derived/rescored-gtfix/*.jsonl` — non-mutating sensitivity rescoring output.

Archive file order, timestamps, ownership, group, and gzip headers are
normalized. Source bundle contents and relative paths are unchanged.

## Verify top-level integrity

From this directory:

```bash
sha256sum -c SHA256SUMS
```

## Verify every archived file

```bash
PUB="$PWD"
for id in \
  20261001-default-5b51e708 \
  20261001-default-0bc94ea4
do
  DEST="$(mktemp -d)"
  tar -xzf "bundles/$id.tar.gz" -C "$DEST"
  (
    cd "$DEST/$id"
    sha256sum -c "$PUB/checksums/$id.sha256"
  )
  rm -rf "$DEST"
done
```

The checksum manifests use paths relative to each execution directory.

## Reproduce deterministic archives

From the repository root:

```bash
PUB="publications/vulnbench-v2/20261001-supplementary-controls"
for id in \
  20261001-default-5b51e708 \
  20261001-default-0bc94ea4
do
  tar \
    --sort=name \
    --mtime='2026-10-01 00:00Z' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -C results/executions \
    -cf - "$id" |
    gzip -n -9 > "$PUB/bundles/$id.tar.gz"
done
```

## Publication safety

The archives and derived files contain model/security findings and excerpts
from intentionally vulnerable fixtures. Treat them as security-research data.
Credential scans must remain clean before publication. Never add `.env`, raw
provider credentials, or ephemeral agent homes to this directory.
