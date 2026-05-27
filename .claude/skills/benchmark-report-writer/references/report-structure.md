# Report Structure Reference

This is the section-by-section template. Start from the default structure below, then apply a variant if the user asked for a specific house style.

## Default structure (hybrid — use unless told otherwise)

This is a blend of the FrontierSWE structure (rigorous, qualitative-heavy) and the Anthropic announcement structure (outcome-forward, confident tone). It fits most coding-agent and security-eval benchmark writeups.

```
Title
  ↓
Summary (TL;DR — 3–5 bullets or 1 short paragraph)
  ↓
Introduction (why this benchmark exists, what gap it fills)
  ↓
Benchmark Design
  ├─ What we measure
  ├─ Tasks and fixtures
  ├─ Scoring methodology
  └─ Models / configurations evaluated
  ↓
Results
  ├─ Headline leaderboard (table)
  ├─ Per-task breakdown (table + optional generated visual)
  └─ Cost / efficiency view (table + optional generated visual, if tokens measured)
  ↓
Qualitative Analysis (2–4 sub-sections — the "what the numbers mean")
  ↓
Limitations
  ↓
Future Work
  ↓
Appendix (methodology detail, full data, reproduction instructions)
```

### Section-by-section guidance

**Title**
- One line, specific. "Benchmarking Claude Opus 4.6 and Sonnet 4.6 on Security Code Review" beats "Benchmark Report: Q2 2026".
- Add a subtitle / one-line claim if there's a strong headline finding.

**Summary (target: 80–150 words)**
- State what was benchmarked, against what, and the headline finding in 3–5 bullets or a short paragraph.
- For public benchmark articles, prefer a concise 1–2 paragraph opening before any section heading when it reads better than bullets. It should lead with exact scores, deltas, variance, speed, or cost tradeoffs.
- No methodology detail here. No charts. No hedging past what the data warrants — but also no oversell.
- The reader who only reads this should leave with an accurate, not flattering, picture.

**Introduction (target: 150–300 words)**
- Establish the gap this benchmark fills. Why do existing benchmarks not answer the question?
- State the core question in plain English ("How much does adding an MCP security tool improve vulnerability-finding quality?").
- When comparing tools, models, or analysis techniques, use neutral positioning. Good framing: "The goal is not to prove that one technique replaces another; it is to measure what happens when X is evaluated as Y against Z reference set."
- Close with a one-sentence preview of what the results show, pointing to the Results section.

**Benchmark Design (target: 300–600 words, plus optional methodology diagrams)**
- Split into clear subsections. Each subsection is one thing; don't mix "what we measure" with "how we score".
- Include the benchmark pipeline diagram only if one exists in the source guide and helps explain the setup. Do not create benchmark result charts in this section.
- Describe fixtures in concrete terms ("a 200-line Express app with 5 intentionally planted vulnerabilities"). Abstract descriptions ("vulnerable code samples") fail to convey the realism or difficulty.
- Describe scoring with a worked example where it helps ("An agent that reports 4 of 5 real vulns and zero false positives scores F1 = 0.89").
- State what defines the reference set, how many runs were executed, how repetitions are averaged, and whether matching is strict or lenient. This is where reader trust is earned.

**Results (target: 400–600 words, table-first with optional generated visuals)**
- Lead with the leaderboard — a markdown table with task × config × headline metric(s).
- If `article-visuals.md` is available, follow with 1–3 visual placeholders that each answer a distinct question. See `visualizations.md` for how to place generated visuals.
- Keep prose between tables and visuals to one paragraph describing what the reader should notice.
- Do not restate every number from the table in prose.
- If the reference-set provider is also a baseline row, explicitly explain what its 100% score means. Example: "Tool X is the reference baseline in this setup, so 100% means it reproduced the Tool X reference set across repeated runs."
- Include at least one practical tradeoff callout when the data supports it: best model vs baseline gap, recall vs precision, score stability, speed, or cost-quality inversion. Prefer exact ratios ("5.7x estimated cost for lower F1") over vague claims ("more expensive").

**Qualitative Analysis (target: 600–1,500 words — the longest section)**
- 2–4 sub-sections, each with a one-sentence thesis as its heading. Examples:
  - "Cost does not predict quality"
  - "Tool-use patterns differ sharply between models"
  - "Most failures cluster in a single vulnerability class"
  - "The judge-LLM disagrees with ground truth in predictable ways"
- Each sub-section: thesis in the heading → 1–2 paragraphs of explanation → a supporting number, table row, or generated visual placeholder → implication for the reader.
- When model reports diverge from a SAST or rule-based reference set, look for the reason. A useful pattern is "vulnerability-shaped code vs executable sink": models may flag code that resembles a vulnerability, while SAST engines often require a recognized source-to-sink flow or executable sink before reporting it.
- This is where the writeup earns its keep. Without qualitative analysis, the report is just a leaderboard.

**Limitations (target: 150–300 words)**
- Name every caveat. Examples: small fixture count, LLM-as-judge variance, possible contamination (fixtures might be in training data), non-determinism across runs, language/framework coverage gaps, cost constraints on number of runs per config.
- Frame honestly — "We ran each config once per task" is fine. "We did not perform statistical significance testing" is fine. Hedging the actual findings is not fine; hedging the methodology is.

**Future Work (target: 100–200 words)**
- 3–5 concrete next steps. Each should be specific enough that a reader could imagine the resulting report.
- Examples: "Expand fixtures to cover Go and Rust", "Add semgrep MCP config to test tool augmentation", "Run each config 5× to quantify variance".

**Appendix (target: 300–800 words)**
- Full methodology detail that didn't belong in the body.
- Full results table if the body showed only aggregates.
- Reproduction instructions (command to re-run, where the fixtures live, how results are structured).
- Raw `jq` queries for readers who want to verify claims themselves.

## Variant: "Announcement" (Anthropic / Cursor style)

Use when the report is a product launch or model release rather than a pure benchmark writeup. Shifts methodology to the appendix and leads with outcomes.

```
Title + date
  ↓
Outcome-forward opening (2–3 paragraphs: what launched, who it's for, availability)
  ↓
Positioning / philosophy (why this approach, how it's different)
  ↓
Customer or partner validation (optional — only if real quotes exist)
  ↓
Benchmark Results (comparison tables plus generated visual placeholders when available)
  ↓
Deeper capability section (qualitative observations, one or two)
  ↓
Responsible development / safety (if applicable)
  ↓
Looking ahead (vision + call to action)
  ↓
Appendix: Methodology (all the eval detail a reader might want)
```

Tone is more confident and less hedged. Methodology is still transparent — it just lives at the bottom. Never fabricate partner quotes.

## Variant: "Deep-dive" (FrontierSWE style)

Use when the writeup is for a research audience and the qualitative analysis is the main draw.

```
Title + authors + date
  ↓
Intro (shorter — ~150 words setting up the question)
  ↓
Benchmark Design (heavier than default — ~400–800 words)
  ↓
Results (short — table + optional generated visual)
  ↓
Qualitative Analysis (the largest section — ~1,500–2,500 words, 4–6 sub-sections)
  ↓
Future Work
  ↓
Acknowledgements
  ↓
Citation block (BibTeX)
```

Tone is academic-adjacent but still accessible. Every claim cited to a number. No superlatives.

## Variant: "Short-form blog" (CursorBench style)

Use when the user wants a tight 800–1,200-word post.

```
Problem framing (~200 words)
  ↓
Our approach (~300 words — the key design decisions only)
  ↓
Results (~300 words — table plus 1–2 generated visuals max)
  ↓
What's next (~100 words)
```

Cut appendix, cut future work to one paragraph, cut qualitative analysis to the single strongest finding. Good for launching a benchmark — not for reporting comprehensive results.

## Choosing a variant

| Signal | Use |
|---|---|
| User says "blog post", "short post", "announcement" | Short-form blog or Announcement |
| User says "like Anthropic's X post" | Announcement |
| User says "like FrontierSWE" or "research writeup" | Deep-dive |
| User says "thorough", "comprehensive", "detailed report" | Default (hybrid) or Deep-dive |
| User says "internal writeup" | Default, trimmed — skip customer validation, keep methodology in body |
| Unclear | Default (hybrid) |
