<div align="center">

# Snyk VulnBench

**A benchmark harness for measuring how AI coding agents find and fix security vulnerabilities.**

<p>
  <a href="https://vulnbench.com"><img src="https://img.shields.io/badge/Explore-VulnBench.com-4C4A73?style=for-the-badge&logo=snyk&logoColor=white" alt="Explore VulnBench.com"></a>
  <a href="https://arxiv.org/abs/2606.15762"><img src="https://img.shields.io/badge/Read_the_paper-arXiv_B31B1B?style=for-the-badge&logo=arxiv&logoColor=white" alt="Read the JS 1.0 paper on arXiv"></a>
  <a href="https://snyk.io/blog/snyk-vulnbench-js-1-0-llm-security-review-repeatability/"><img src="https://img.shields.io/badge/Announcement-Snyk_Blog-4C4A73?style=for-the-badge&logo=snyk&logoColor=white" alt="Read the Snyk blog post"></a>
</p>

<img width="1200" height="730" src="https://github.com/user-attachments/assets/bf4c66fe-139e-4601-9b61-699968808e34" alt="Snyk VulnBench" />

</div>

## What is Snyk VulnBench?

[Snyk VulnBench](https://vulnbench.com) is a versioned research initiative for studying AI-assisted security review. It makes the behavior of coding agents inspectable and repeatable: the same vulnerable projects, prompts, configurations, and scoring rules can be run repeatedly to measure what agents find, miss, and report consistently.

This repository contains the **VulnBench benchmarking harness**. It runs security tasks against AI coding agents and deterministic tooling, then records both outcome and operating characteristics:

- **Finding and fixing quality** — precision, recall, F1, and fix rates against documented answer keys.
- **Attacker-reachability** — source-to-sink matching for curated, reachable vulnerability flows.
- **Repeatability and efficiency** — recurrence across runs, token use, elapsed time, tool calls, and estimated cost.

VulnBench measures observed behavior under a defined protocol. It is not a universal leaderboard, and agreement with a reference set is not a claim of independent ground-truth accuracy.

## Current release

**[Snyk VulnBench JS 1.0](https://vulnbench.com/releases/js-1.0)** asks: _Can LLMs find the same bugs twice?_ The release evaluates repeated agentic security reviews across inspectable JavaScript projects and compares the results with a deterministic Snyk Code reference set.

<p>
  <a href="https://vulnbench.com/releases/js-1.0/explore">Explore results</a>
  · <a href="https://vulnbench.com/releases/js-1.0/methodology">Review methodology</a>
  · <a href="https://vulnbench.com/releases/js-1.0/data">Download release data</a>
  · <a href="https://github.com/snyk-labs/snyk-vulnbench-js-1.0">View the JS 1.0 source snapshot</a>
</p>

Read the accompanying [paper](https://arxiv.org/abs/2606.15762) and [Snyk blog post](https://snyk.io/blog/snyk-vulnbench-js-1-0-llm-security-review-repeatability/) for the findings, limitations, and interpretation of this release.

## The benchmarking harness

The harness is a TypeScript/Node.js runner built around the Claude Agent SDK. It:

1. Loads task definitions, vulnerable fixture projects, and model/tool configurations.
2. Sandboxes each agent to the fixture's `project/` directory, keeping ground-truth files outside its reach.
3. Runs each task × configuration pairing, optionally with repeated trials.
4. Scores the output and writes structured JSONL results for analysis and reporting.

It currently supports:

| Evaluation | What it measures |
| --- | --- |
| `find-vulns` | Whether an agent identifies known vulnerability types. |
| `attacker-reachable-find-vulns` | Whether reported source-to-sink flows match curated attacker-reachable findings. |
| `fix-vulns` | Whether an agent remediates documented vulnerabilities. |

### Benchmark output

The VulnBench benchmark harness reports results data as pretty standard output as well as JSONL files:

<img width="807" height="259" alt="SCR-20260820-nnaz" src="https://github.com/user-attachments/assets/f12e1bcf-6a63-4f4e-8281-5f1b18da1eb9" />

Additionally, there are built-in skills in the benchmark harness (in this repo) that generate visual charts through HTML files:

<img width="924" height="509" alt="SCR-20260820-nncj" src="https://github.com/user-attachments/assets/33f1470e-437e-40f3-90c9-fe38a8b90b2b" />


## Quick start

Requires Node.js 24+ and [pnpm](https://pnpm.io/).

```bash
pnpm install

# Run the default benchmark matrix
pnpm run benchmark

# Run only attacker-reachable tasks with Snyk Code
pnpm run benchmark:v2:snyk
```

Results are written to `results/benchmark-<timestamp>.jsonl`. See the [benchmark guide](docs/benchmark.md) for the pipeline and scoring model, and the [management guide](docs/benchmark-management.md) for adding tasks, fixtures, and configurations.

## Repository map

```text
src/        Harness runner, scoring, reporting, and CLI
evals/      Task descriptors and model/tool run configurations
fixtures/   Inspectable vulnerable projects and protected answer keys
results/    JSONL benchmark output
docs/       Benchmark and fixture-management documentation
```

> **Security note:** fixture projects intentionally contain vulnerable code for controlled security research. Do not deploy them.

## Learn more

- [VulnBench.com](https://vulnbench.com) — releases, results, and research principles
- [JS 1.0 paper](https://arxiv.org/abs/2606.15762) — _Snyk VulnBench JS 1.0: Can LLMs Find the Same Bugs Twice?_
- [JS 1.0 methodology](https://vulnbench.com/releases/js-1.0/methodology) and [data](https://vulnbench.com/releases/js-1.0/data)
- [Snyk announcement](https://snyk.io/blog/snyk-vulnbench-js-1-0-llm-security-review-repeatability/)
- [VulnBench source repository](https://github.com/snyk-labs/snyk-vulnbench)
