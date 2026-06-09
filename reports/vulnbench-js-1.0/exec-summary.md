# Snyk VulnBench JS 1.0 Executive Summary

Snyk VulnBench JS 1.0 ran 300 repeated JavaScript vulnerability scans to answer a practical AppSec question: when coding agents review the same vulnerable code more than once, do they find the same security issues?

The short answer is: LLMs were useful, but not yet deterministic. They repeatedly found many familiar vulnerability shapes, but they also missed systematic SAST findings, produced one-off extra reports, and became less reliable as the code became more app-like. The strongest conclusion is not "LLM versus SAST." It is that LLM review and deterministic SAST cover different failure modes and should be evaluated together.

## Short Key Highlights

- Across all LLM configurations, nearly half of extra vulnerability reports appeared only once across five identical scans: 80 of 161 unique LLM-only reports.

- Claude Sonnet 4.6 Medium produced the most one-off extra vulnerability reports: 61.7% of its LLM-only reports appeared in just one of five runs. Claude Opus 4.6 Medium produced zero one-off extra reports; all of its LLM-only reports appeared in at least two runs.

- Across all LLM runs, models repeated 85% of the Snyk-reference vulnerabilities they found, but only 14% of extra vulnerability reports appeared in every run.

- Claude Opus 4.6 Medium was the most repeatable model on known vulnerabilities, reproducing 100% of the Snyk-reference issues it found across all five runs; Claude Opus 4.7 Max was the least repeatable at 74.3%.

- Claude Opus 4.6 Medium was the best-scoring LLM configuration, matching 75.4% of the Snyk Code reference set and leaving a 24.6 percentage-point gap against deterministic SAST reference reproduction.

- Claude Sonnet 4.6 High found the most reference vulnerabilities of any LLM configuration at 81.3% recall, but precision fell to 58.6%, creating the noisiest review queue.

- Claude Opus 4.6 Medium had the cleanest LLM review queue, reaching 91.5% precision, but it found only 68.0% of Snyk-reference vulnerabilities.

- Claude Sonnet 4.6 High optimized for coverage over precision: it found 81.3% of Snyk-reference vulnerabilities, but only 58.6% of its reported vulnerabilities matched the reference set.

- Claude Opus 4.7 Max was the most expensive LLM configuration: it cost 5.7x more than Claude Opus 4.6 Medium, used 1.9x more tokens, and scored lower.

- Claude Opus 4.6 Medium was the fastest LLM scan at 27.3 seconds on average, still almost 2x slower than Snyk Code SAST at 14.8 seconds. Claude Sonnet 4.6 High was the slowest at 94.8 seconds, more than 6x slower than Snyk Code SAST.

- LLMs were strongest on familiar exploit shapes like command injection, XSS, hardcoded credentials, SQL injection, SSRF, open redirect, prototype pollution, and ReDoS.

- LLMs were weaker on systematic SAST classes: resource-limit findings, framework information exposure, insecure transport, sanitization and type-validation issues, and repeated path traversal flows.

- In the largest app-like fixture, Claude Opus 4.6 High was the best model at only 40.0% Snyk-reference F1, repeatedly missing path traversal and resource-limit vulnerabilities.

- Not every LLM-only report was noise: one unmatched SQL injection report looks like a real Snyk Code product gap to investigate.

- The practical takeaway: use SAST for deterministic coverage and LLMs for exploratory review, not as interchangeable scanners.

### Per-Model Highlights

- Claude Sonnet 4.6 Medium produced the most one-off extra reports: 61.7% of its LLM-only reports appeared in just one of five runs.

- Claude Opus 4.6 Medium had the strongest overall profile: best Snyk-reference repeatability, best LLM score, cleanest precision, fastest LLM runtime, and lowest model-session cost.

- Claude Opus 4.7 Max had the weakest known-vulnerability repeatability and the highest model-session cost.

- Claude Sonnet 4.6 High found the most Snyk-reference vulnerabilities, but also had the lowest precision and slowest LLM runtime.

## Friendly Report Summary

We evaluated 10 small JavaScript and Express applications with 44 Snyk Code reference findings. Each of six configurations ran each task five times: Snyk Code SAST plus five Claude model configurations. That produced 300 total vulnerability-finding runs.

Snyk Code reproduced its own reference set every time. That 100% result should be read carefully: Snyk Code defines the benchmark reference set, so this is a determinism baseline, not a claim that Snyk Code found every possible vulnerability in the projects.

The best model configuration, Claude Opus 4.6 Medium, reached 75.4% Snyk-reference F1. It was also the best value run, averaging $0.0628 per session and 51,574 tokens. Claude Opus 4.7 Max cost $0.3559 per session and used 95,969 tokens, but scored lower at 68.8% F1. Higher model cost did not translate into better vulnerability coverage.

The biggest reliability issue was not the vulnerabilities models found consistently. When an LLM matched a Snyk Code reference vulnerability, that finding was usually stable: 134 of 158 unique reference-matched findings appeared in all five repeated runs. The problem was the extra review queue. Across 250 model runs, 80 of 161 unique extra vulnerability reports appeared in only one of five repeated runs.

That matters for developers. If the same code and prompt can produce a different set of reported vulnerabilities depending on which run executes, teams get different triage queues for the same pull request. Some of those extra reports were useful, but many were one-off, adjacent, duplicate, or vulnerability-shaped code that did not have a real sink.

The models were especially good at familiar, high-signal bug shapes: direct command injection, reflected XSS, hardcoded credentials, SSRF, open redirects, prototype pollution, ReDoS, and obvious SQL injection patterns. They were less reliable at enumerating repeated sinks, distinguishing mock SQL-like code from executable SQL flows, and catching less exploit-shaped findings such as missing resource limits or framework information exposure.

The larger todo-style fixture made this visible. Claude Opus 4.6 High was perfectly stable across five repetitions, but stably incomplete: it scored 40.0%, missed every path-traversal reference finding, and missed two of three resource-limit findings. The model found representative issues but did not systematically enumerate repeated vulnerable flows.

The benchmark also found complementarity. In one case, all model runs reported a SQL injection outside the Snyk Code reference set, and the code appears worth investigating as a real findings gap. That is why "unmatched" should not automatically mean "hallucinated." LLM-only reports can include false positives, useful adjacent review comments, and valid issues outside the current SAST reference set.

The headline finding for AppSec teams is simple: LLMs can improve security review, but they do not behave like deterministic scanners. SAST gives repeatable coverage of known vulnerability classes and repeated data-flow sinks. LLMs add flexible reasoning and can surface product gaps, but their extra findings need triage and repeatability checks.

## Marketing Guide

### Report Digest

Can you trust an LLM security review to find the same vulnerabilities twice? In Snyk VulnBench JS 1.0, we ran 300 repeated scans across 10 JavaScript fixtures to find out. The models were useful, but uneven: they repeated most known vulnerabilities once found, yet nearly half of their extra vulnerability reports appeared in only one of five identical runs. The result is a practical AppSec lesson: LLMs and SAST are complementary, but not interchangeable.

Nearly half of extra LLM vulnerability reports appeared only once across repeated scans, while 85% of reference vulnerabilities were found consistently.

This is the clearest version of the benchmark's main insight. It avoids overclaiming Snyk Code accuracy, keeps the focus on vulnerability review, and explains why repeatability matters to developers and security teams.

### Terminology

Use "reference vulnerabilities" instead of "reference-matched findings" when writing for a broad AppSec audience.

Use "extra vulnerability reports" or "LLM-only reports" instead of "unmatched findings."

Use "one-off reports" instead of "findings that appeared in exactly one repetition."

Use "repeatable vulnerabilities" instead of "stable matched signatures."

Use "deterministic SAST baseline" instead of "command baseline."

Use "agreement with the Snyk Code reference set" instead of "accuracy" unless an independent ground truth set is introduced.
