# Benchmark Publications

This directory contains immutable, versioned benchmark datasets prepared for
analysis and publication. Runtime output remains under the ignored `results/`
directory; completed executions are copied here as compressed archives so they
can be reviewed and committed without moving or modifying the originals.

## Layout

```text
publications/
  <benchmark-generation>/
    <authoritative-execution-id>/
      README.md       # human entry point and analysis guidance
      index.json      # machine-readable bundle inventory and provenance
      SHA256SUMS      # archive integrity checks
      bundles/        # complete execution bundles
      checksums/      # checksums for every file inside each bundle
```

## Available datasets

- [`vulnbench-v2/20260907-vulnbench-v2-deepsec-150-574753a2/`](./vulnbench-v2/20260907-vulnbench-v2-deepsec-150-574753a2/)
  — completed VulnBench V2 execution, including its audit parent and
  authoritative 180/180 child bundle.
- [`vulnbench-v2/20261001-supplementary-controls/`](./vulnbench-v2/20261001-supplementary-controls/)
  — supplementary prompt-control and Snyk repeatability runs plus
  ground-truth-fix sensitivity rescoring; not part of authoritative aggregates.
