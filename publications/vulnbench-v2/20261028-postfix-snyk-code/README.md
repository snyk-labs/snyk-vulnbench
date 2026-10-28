# VulnBench V2 Post-Disclosure Snyk Code Re-scan

This publication preserves one Snyk Code execution run on 2026-10-28 after the
Snyk Code rule updates that followed VulnBench 2.0. Its role is
**post-disclosure re-scan**.

It supplements—but never replaces—the authoritative VulnBench V2 child:

```text
20260907-vulnbench-v2-deepsec-150-574753a2
```

It is also separate from the 2026-10-01 supplementary runs in
`20261001-supplementary-controls/`. Do not merge rows from this bundle into the
authoritative V2 aggregates, and do not merge them into the 2026-10-01
supplementary aggregates. Analyze this execution on its own and label it as a
post-disclosure re-scan.

## Bundle

```text
20261028-default-2b4cb3f9
```

Role: `post-disclosure-rescan`

This execution runs Snyk Code once on each of the 20 VulnBench 2.0
attacker-reachable tasks. All 20 runs completed successfully. There were no
failed runs and no resume retry.

## Execution conditions

- Run date: 2026-10-28 (created 2026-10-28T07:53:02Z, completed 2026-10-28T08:04:17Z)
- Harness commit:
  `6f66b5aa01f1cd8fbcd6a34eec82f7da2597ae9c`
- Related authoritative execution:
  `20260907-vulnbench-v2-deepsec-150-574753a2`
- Snyk org slug: `snyk-demo-567`
- Snyk CLI recorded per run, and by preflight:
  `1.1309.0-preview.8314b050a0d69e4060bfc4834d0b614af9f7f5f3`
- CLI package: `snyk@preview`, resolved on PATH at
  `/usr/local/share/npm-global/bin/snyk`. That is the binary the harness invokes.

Tasks, attacker-reachable ground truth, and active task prompts are those on
main at the harness commit above, including the iguana ground-truth fix from
93ef5af. That commit removes one duplicate unlabelled Iguana
`src/gitintegration/frontend.py:45` location while retaining the labelled sink.
Say this explicitly when citing this bundle: the reference set is the
post-93ef5af set, not the frozen ground truth inside the authoritative V2
publication.

Fixture metadata hashes match the 2026-10-01 Snyk repeatability execution.
The working tree was clean (`dirtyFingerprint` is null).

## Contents

- `index.json` — machine-readable provenance, bundle role, status, counts,
  source/plan fingerprints, size, and checksums.
- `SHA256SUMS` — checksum for the archive.
- `bundles/<execution-id>.tar.gz` — deterministic copy of the complete
  execution directory.
- `checksums/<execution-id>.sha256` — checksum for every file in the
  execution directory.

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
id=20261028-default-2b4cb3f9
DEST="$(mktemp -d)"
tar -xzf "bundles/$id.tar.gz" -C "$DEST"
(
  cd "$DEST/$id"
  sha256sum -c "$PUB/checksums/$id.sha256"
)
rm -rf "$DEST"
```

The checksum manifest uses paths relative to the execution directory.

## Reproduce the deterministic archive

From the repository root:

```bash
PUB="publications/vulnbench-v2/20261028-postfix-snyk-code"
id=20261028-default-2b4cb3f9
tar \
  --sort=name \
  --mtime='2026-10-28 00:00Z' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C results/executions \
  -cf - "$id" |
  gzip -n -9 > "$PUB/bundles/$id.tar.gz"
```

## Publication safety

The archive contains scanner findings and excerpts from intentionally
vulnerable fixtures. Treat it as security-research data. Credential scans must
remain clean before publication. Never add `.env`, raw provider credentials, or
ephemeral agent homes to this directory.
