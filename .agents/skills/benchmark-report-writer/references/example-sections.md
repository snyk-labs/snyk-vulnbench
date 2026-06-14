# Example Sections

Short before/after examples for the hardest sections to write well: Summary, Results narrative, Qualitative Analysis, and Limitations.

Use these as calibration. Don't copy them verbatim — they're patterns, not templates.

## Summary

### Weak (too vague, no numbers, marketing voice)

> We're excited to announce the results of our latest security benchmark. We evaluated leading AI coding agents across a range of realistic vulnerability-detection tasks and found meaningful differences in performance. The results offer valuable insights into the current state of AI-assisted security review.

### Strong (specific, outcome-led, cites numbers)

> We benchmarked four Claude configurations on three security-review tasks — finding and fixing vulnerabilities in Express, Flask, and Go HTTP fixtures — measuring F1 quality, token spend, and wall time. Headline findings:
>
> - **Opus 4.6 won every task**, averaging 94% F1 vs 77% for Sonnet 4.6.
> - **The cost delta was larger than the quality delta**: Opus used 2.3× more tokens to win, and Sonnet's score-per-dollar was higher on two of three fixtures.
> - **Adding semgrep via MCP closed the gap between Sonnet and Opus** on finding tasks, but made no difference on fixing tasks.

The second version is scannable, anchored to numbers, and prepares the reader for a non-trivial narrative (cheaper model isn't always worse).

## Results narrative

### Weak (restates the table)

> As you can see in the table above, Opus scored 89% on js-find-vulns and Sonnet scored 72%. On python-find-vulns, Opus scored 100% and Sonnet scored 80%. On js-fix-vulns, Sonnet scored 80%.

### Strong (highlights the one thing the reader should take away)

> Opus swept the find tasks but its margin was uneven: 17 points on JavaScript vs. 20 points on Python. Sonnet's only standalone win was cost — it used ~25% fewer tokens on every task, and for the find-vulns tasks specifically, its score-per-token was within 10% of Opus despite the lower absolute score.

The strong version assumes the reader can read the table. The prose's job is to tell them *what pattern to notice*, not to repeat values.

## Qualitative Analysis sub-section

### Weak (observation without supporting detail)

> **Tool use differs across configs**
>
> We noticed that different models used tools in different ways, which had implications for their performance.

### Strong (thesis heading, explanation, number, implication)

> **Sonnet re-reads files that Opus reads once**
>
> On js-fix-vulns, Opus called `Read` four times across the session; Sonnet called it eleven. The extra reads weren't exploratory — Sonnet re-opened `app.js` three separate times during its fix sequence, re-parsing the file after each edit. That pattern accounts for most of Sonnet's token overhead on fix tasks (~40% of `cache-read` tokens came from `app.js`).
>
> For benchmarking consumers, this means model choice affects not just quality but tool-use shape. A latency-sensitive workflow sees the 11-vs-4 ratio directly; a cost-sensitive workflow sees it as cache reads instead.

The strong version has: a thesis in the heading (the reader knows what they're about to learn), a specific number (11 vs 4, 40%), and a "so what" for the reader.

## Limitations

### Weak (boilerplate, admits nothing specific)

> There are several limitations to this work that should be considered when interpreting the results. More research is needed to validate these findings across a broader range of scenarios.

### Strong (names specific limits, frames them honestly)

> This benchmark has four limits a reader should weigh before acting on the results:
>
> 1. **Small fixture set.** Three fixtures (~200 lines each) is enough to surface patterns but not enough to claim statistical significance.
> 2. **Single run per cell.** Each config × task combination was run once. We haven't measured variance — a config that scored 72% on one run could plausibly score 65% or 80% on the next. The scores should be read as approximate, especially where gaps are under 10 points.
> 3. **LLM-as-judge for fix-vulns.** The fix-vulns score comes from Claude Haiku judging each fix. Haiku is cheaper and faster than a larger judge but can miscategorize partial fixes — we noted at least one case where the judge marked a regex-based input check as sufficient when it wasn't.
> 4. **Possible training-data contamination.** The fixtures are intentionally-vulnerable educational code; similar patterns likely appear in the training data of every model tested. A custom fixture set not in public training data would produce harder, more differentiating scores.
>
> We mention these not to hedge the findings but to help the reader calibrate which claims to lean on.

The strong version earns trust. A reader who reads this Limitations section treats the rest of the report as more credible, not less.

## Introduction opening

### Weak (no stakes, no specificity)

> AI coding agents are becoming increasingly capable. Understanding their strengths and weaknesses is important for practical adoption. In this report, we benchmark several configurations.

### Strong (establishes the gap, states the question)

> Coding-agent benchmarks exist for unit-test generation, SWE-bench-style bug fixing, and code completion — but there's no widely-used public benchmark for *security code review*, the task where most engineering teams first meet an AI agent in a high-stakes setting. This report is our attempt to fill that gap: we run four Claude configurations against three intentionally vulnerable applications and ask two questions — can the agent find the vulnerabilities, and can it fix them correctly.

## Introduction close (preview of findings)

### Weak (empty promise)

> Our results show some interesting patterns that we will discuss in detail below.

### Strong (tight preview, reader knows what's coming)

> The short version: Opus wins on quality, Sonnet wins on cost-per-quality, and adding a security-specific MCP tool helps find-tasks more than fix-tasks. The rest of the report unpacks why.
