# Voice and Style

Read this before writing. Benchmark reports fail more often on voice than on content — a technically correct report in the wrong voice reads like a press release or a lab notebook instead of something people share.

## The target voice

**Confident but not promotional. Technical but not academic. Transparent about limitations.**

Think of the reader as a skilled engineer who is skeptical by default. They will leave if they sense marketing spin. They will also leave if the prose reads like a thesis abstract.

Models for tone:
- Anthropic's model announcements — confident claims, cited numbers, measured hedging.
- FrontierSWE blog posts — rigorous but warm, willing to discuss model failures openly.
- Cursor engineering posts — concrete, practical, leads with the engineering problem.

## Core rules

**Lead with outcomes, not mechanisms.**
- Good: "Opus found all five vulnerabilities in the Express fixture; Sonnet missed the command injection."
- Bad: "Our evaluation harness invoked the Agent SDK's `query()` function with hooks configured to capture per-tool timing data."

The mechanism belongs in Benchmark Design or the Appendix, not at the top of Results.

For benchmark articles, the opening should usually start with the measured outcome:
what was evaluated, the reference point, the top score, and the most important
delta. Avoid fluffy setup paragraphs before the numbers.

**Cite numbers inline.**
- Good: "Opus scored 89% (F1); Sonnet scored 72%."
- Bad: "Opus performed better than Sonnet."

Every comparative claim should have the numbers backing it on the same line or immediately after.

**Use imperative or declarative voice. Avoid hedging verbs.**
- Good: "The judge-LLM marked the command injection fix as incomplete."
- Bad: "It seems that the judge-LLM may have considered the command injection fix to be somewhat incomplete."

Hedging verbs ("seems", "may", "possibly", "somewhat") dilute confidence without adding accuracy. If something is uncertain, say *why* it's uncertain ("The judge was run once; another run could grade differently") rather than sprinkling hedges.

**Name things precisely.**
- Use the exact model IDs (`claude-opus-4-6`) or the exact config names (`opus-4-6`, `sonnet-with-semgrep`) once, then a consistent short form throughout.
- Don't switch between "Opus 4.6", "Claude Opus", "the Opus config", and "opus-4-6" across paragraphs.

**Be concrete about fixtures and tasks.**
- Good: "We ran each config against three fixtures: a 200-line Express app with 5 planted vulnerabilities (SQL injection, XSS, path traversal, command injection, hardcoded credentials), a Flask equivalent, and a Go HTTP server."
- Bad: "We used a diverse set of realistic vulnerable code samples."

Concrete detail is free credibility. Abstract descriptions read as hand-waving.

**Explain scoring with a worked example.**
Once per report (usually in Benchmark Design), walk through one concrete scoring case end-to-end. "An agent reports 4 findings; 3 are true positives and 1 is a false positive, and it missed 1 real vuln. Precision = 0.75, Recall = 0.75, F1 = 0.75." This saves the reader from having to re-derive the math.

**Show failures, not just wins.**
- The strongest reports describe what *didn't* work — misfires, surprising weaknesses, judge disagreements. Readers trust a report more when it admits what it got wrong.
- A report where every finding is positive reads as a pitch deck, regardless of the actual numbers.

When explaining model limitations, connect the limitation to a concrete code pattern
and a measured outcome. A strong pattern is: "models flagged code that looked like a
vulnerability, while the reference tool required a recognized executable sink." This
is sharper than saying "the model hallucinated" and helps readers understand why the
systems disagree.

**Stay neutral when the benchmark compares approaches.**
- Good: "The goal is not to prove that one technique replaces another. It is to measure how agentic review performs as a vulnerability-finding system against this reference set."
- Bad: "This benchmark proves scanners are better than models."

When a baseline defines the reference set, say so plainly. A 100% score means the
baseline reproduced that reference set in the benchmark; it is not a universal
claim that no other vulnerabilities exist.

## Language to avoid

- Superlatives without numbers: "revolutionary", "groundbreaking", "state-of-the-art" (unless followed immediately by a comparison), "unmatched", "best-in-class".
- Marketing clichés: "game-changing", "paradigm shift", "leverages", "empowers", "unlocks".
- Filler transitions: "It is important to note that…", "In order to…", "As mentioned above…".
- Passive voice when active works: prefer "Opus scored 89%" over "A score of 89% was achieved by Opus".
- Meta-commentary about the report itself: "In this report we will…" — just do the thing instead.

## Language that works

- Specific verbs: "scored", "found", "missed", "flagged", "patched", "hallucinated", "refused".
- Plain contrast: "Opus won on JS fixtures; Sonnet won on Python." Short sentences land harder than long comparative clauses.
- Numbers that do work: "9× more false positives" beats "significantly more false positives".
- Named observations: instead of "interestingly", use the observation as the sentence ("Two configs produced identical scores by different paths — Opus read every file once, Sonnet re-read the main module four times.").
- Practical tradeoff claims: "Cost did not predict quality: Opus used 2.3× more tokens and scored lower." These are especially useful when newer, slower, or more expensive configs underperform cheaper ones.
- Mechanistic distinctions: "LLMs can be sensitive to code that looks like a vulnerability; SAST engines are usually built around executable flows and recognized sinks."

## Sentence rhythm

Mix short and long sentences. A paragraph of uniform-length sentences reads as a textbook. A short punchy sentence lands a claim; a longer one explains it.

Example:
> Opus won on every task. The margin was largest on Python (98% vs 80% for Sonnet) and narrowest on JavaScript (89% vs 72%). But the cost delta was the real story: Opus used 2.3× more tokens to get there, and for two of the three fixtures, Sonnet's score-per-dollar was meaningfully higher.

Three sentences: claim, detail, complication. Each earns its place.

## The "would I send this to a peer?" test

Before finalizing any section, read it and ask: *would I send this to an engineer whose technical opinion I respect, without feeling embarrassed?*

If the answer is no, usually one of these is the cause:
- Unsupported claims → add numbers or cut.
- Marketing language → strip it.
- Filler → cut.
- Inconsistent naming → normalize.
- Missing limitations → write them in honestly.

Fix the cause, not just the surface.

## Formatting

- Headings: `#` for title, `##` for main sections, `###` for sub-sections. Don't go deeper than four levels.
- Use bulleted lists for lists of 3+ items. For 2 items, prose is usually better.
- Use tables for leaderboards, per-task breakdowns, and methodology appendices. Don't use tables to format what should be prose.
- Use generated visuals from `article-visuals.md` when they clarify a pattern the table hides. If no chart artifacts exist, prefer clear tables and prose over creating charts in the report writer.
- Code blocks for CLI commands, JSON schemas, and short file snippets. Don't quote long source files inline — link or summarize.

## Pacing and length

Rough budgets (adjust to the variant in use, see `report-structure.md`):
- Blog-post writeup: 1,200–2,000 words total.
- Default report: 2,500–4,000 words total.
- Deep-dive: 4,000–7,000 words total.

If you're over budget, cut in this order:
1. Filler transitions and meta-commentary.
2. Repetition between Summary and Introduction.
3. Appendix detail that doesn't support a body claim.
4. Qualitative Analysis sub-sections ranked 3–4 in strength.
5. Section introductions that re-state what the heading already says.
