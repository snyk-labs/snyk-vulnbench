# Can You Trust an LLM to Find the Same Bugs Twice?

We ran 300 vulnerability-finding scans to measure how repeatable agentic LLM security review is on the same code, prompt, and harness. The headline result is not that one scanner "wins" a self-referential leaderboard. It is that LLM security findings are unevenly repeatable: reference-matched findings were stable, but extra model reports varied heavily from run to run.

In plain terms: when Claude reported bugs outside the Snyk Code reference list, those extra reports were often inconsistent. Across 250 model runs, 80 of 161 unique unmatched findings appeared in only one of five identical repetitions, while only 22 appeared in all five. But when Claude matched a reference finding, the behavior was much more stable: 134 of 158 unique reference-matched findings appeared in all five repetitions. That split is the core result of Snyk VulnBench JS 1.0.

The benchmark also shows complementarity. Models consistently found familiar, high-signal exploit shapes, and in one case surfaced a likely Snyk Code product gap. Snyk Code SAST was deterministic and better at systematically enumerating repeated data-flow sinks. Neither result supports replacing one technique with the other. The data supports combining them.

## Why Repeatability Matters

Coding agents are now part of the development loop. They write code, modify pull requests, explain changes, and increasingly perform security review before a human reads the diff. That makes reliability a product question: if the same agent sees the same vulnerable code twice, does it report the same security issues twice?

Traditional SAST tools are built to be deterministic. If the code and rules are unchanged, the output should be unchanged. LLMs are different. They can reason about unfamiliar code, describe risk in useful prose, and sometimes spot issues that a static analyzer misses. But they can also vary across runs, over-report adjacent concerns, or stop after finding one representative example of a repeated pattern.

Snyk VulnBench JS 1.0 was designed to quantify that behavior. The benchmark uses small JavaScript and Express applications so every run is inspectable. The point is not to simulate an entire monorepo. The point is to make model behavior measurable under repeated, controlled conditions.

## Benchmark Design

The benchmark contains 10 JavaScript fixture projects with 44 Snyk Code reference findings. Each fixture is a small Express-based application, ranging from compact single-file snippets to a larger todo app with server routes, database state, uploads, and frontend JavaScript.

We evaluated six configurations:

| Configuration | Type | Repetitions per task |
|---|---:|---:|
| Snyk Code SAST | Command baseline | 5 |
| Claude Opus 4.6 Medium | Model via Claude Code harness | 5 |
| Claude Opus 4.6 High | Model via Claude Code harness | 5 |
| Claude Opus 4.7 Max | Model via Claude Code harness | 5 |
| Claude Sonnet 4.6 Medium | Model via Claude Code harness | 5 |
| Claude Sonnet 4.6 High | Model via Claude Code harness | 5 |

Each configuration ran each task five times: 10 tasks x 6 configurations x 5 repetitions = 300 runs. The model configurations used the same direct audit prompt and returned findings as structured JSON. The model could read the project files, but not the `findings.json` reference file.

Snyk Code defines the reference set for this benchmark. That means its 100% score is not an accuracy claim about all possible vulnerabilities in the projects. It means Snyk Code reproduced its own reference findings deterministically across repeated runs. We use that reference set to measure model agreement, model variance, and where model behavior diverges.

The scorer is intentionally lenient: a model finding is credited if it reports the same vulnerability type as a reference finding. It does not need to match the same file, line, severity, or source-to-sink path. F1 is useful as an agreement metric, but it is not the main story.

## Result 1: Repeatability Varied By Configuration

At the configuration level, repeatability shows up as score variance. Claude Sonnet 4.6 High had the largest headline F1 standard deviation at 3.5 percentage points across repeated runs. Snyk Code SAST had 0.0 percentage-point score standard deviation against its reference set.

<!-- VISUAL: score-variance-by-config -->

*Figure 1: Headline F1 standard deviation across repeated runs. Lower values indicate more repeatable benchmark outcomes under the same prompt and code.*

Across all model configurations, 80 of 161 unique unmatched finding signatures appeared in only one of five repeated runs. That aggregate is the headline, but the more useful view is model-by-model.

<!-- VISUAL: one-run-unmatched-by-model -->

*Figure 2: Share of each model configuration's unique unmatched finding signatures that appeared in only one of five repeated runs. Signature = task + vulnerability type + file + line, grouped by model config.*

The table below provides exact values for the preceding chart, plus the two stability counters that matter most.

| Model configuration | Unique unmatched findings | Seen in 1 of 5 runs | Seen in all 5 runs | Reference-matched findings seen in all 5 |
|---|---:|---:|---:|---:|
| Claude Opus 4.6 Medium | 5 | 0.0% | 60.0% | 100.0% |
| Claude Opus 4.6 High | 6 | 16.7% | 50.0% | 96.2% |
| Claude Opus 4.7 Max | 36 | 47.2% | 16.7% | 74.3% |
| Claude Sonnet 4.6 Medium | 60 | 61.7% | 8.3% | 80.6% |
| Claude Sonnet 4.6 High | 54 | 46.3% | 9.3% | 80.6% |

The instability is not evenly distributed across models. Claude Sonnet 4.6 Medium produced the largest unmatched finding surface, with 60 unique unmatched signatures; 37 of those appeared in only one of five runs. Claude Sonnet 4.6 High and Claude Opus 4.7 Max showed a similar pattern: many extra reports appeared once and did not recur. In contrast, Claude Opus 4.6 Medium with 0.0% on the chart indicates high stability and few one-off findings, with all of its extra reports found in two or more runs but none appeared in only one out of the 5 repeated runs.

The Opus 4.6 configurations behaved differently. They produced far fewer unmatched findings, and their extra reports were more stable. That does not make every extra report correct, but it changes the operational interpretation: fewer surprise findings, fewer one-off claims, and less triage churn.

The chart below highlights how most non-Opus-4.6 configs struggled with stability in their extra (unmatched) findings across repeated runs. Both Claude Sonnet 4.6 Medium and High exhibited poor repeatability, with only 8.3% and 9.3% of unmatched findings persisting across all five runs. Claude Opus 4.7 Max also fared poorly, with just 16.7% stability. In contrast, Opus 4.6 Medium and High demonstrated much higher stability in their unmatched findings (60.0% and 50.0% respectively), underlining the less-predictable, noisier nature of unmatched findings from the Sonnet and newer Claude Opus 4.7 Max configuration.

<!-- VISUAL: stable-unmatched-by-model -->

*Figure 3: Share of unique unmatched finding signatures that appeared in all five repeated runs for each model configuration.*

The matched side tells a different story. When a model found a Snyk Code reference finding, it usually found it repeatedly. Claude Opus 4.6 Medium matched 25 unique reference findings and repeated all 25 across five runs. Claude Opus 4.6 High repeated 25 of 26. Even the noisier Sonnet configurations repeated 29 of 36 reference-matched findings.

<!-- VISUAL: stable-matched-by-model -->

*Figure 4: Share of unique Snyk Code reference findings matched in all five repeated runs for each model configuration.*

This is the main repeatability finding: model agreement with known reference issues was much more stable than the surrounding set of extra reports. In a real developer workflow, those extra reports still matter. They are the findings that create new triage work and change from run to run.

The aggregate distribution shows the operational shape of that problem.

<!-- VISUAL: unmatched-finding-repeatability -->

*Figure 5: Distribution of unique unmatched model findings by how often the same finding signature appeared across five repetitions of the same task and model config. Signature = task + config + vulnerability type + file + line.*

The table shows how often model findings matched reference (Snyk) findings across repeated runs. The large "5 of 5 runs" percentage (84.8%) means when a model spotted a known vulnerability, it almost always did so reliably every time. The small single-digit percentages (e.g., 1/5, 2/5 runs) show that inconsistent, flaky detection of reference issues was rare (<6%). So: model-reported "real" vulns are usually reliable, while the noisy, inconsistent findings are mostly in extra (non-reference) reports. The impact: LLMS consistently catch true positives but are less repeatable in their "extra" findings.

| Repetition frequency | Unique unmatched findings | Share |
|---|---:|---:|
| 1 of 5 runs | 80 | 49.7% |
| 2 of 5 runs | 24 | 14.9% |
| 3 of 5 runs | 23 | 14.3% |
| 4 of 5 runs | 12 | 7.5% |
| 5 of 5 runs | 22 | 13.7% |

Nearly half of unique unmatched model findings appeared in only one of five identical repetitions. That is a practical reliability problem: a developer could get a materially different review queue depending on which run happened to execute.

## Result 2: The Tools Failed Differently

The most useful interpretation is not "LLM versus SAST." It is "LLM plus SAST catches different failure modes."

The clearest way to see this is by vulnerability class. The heatmap below shows mean recall against the Snyk Code reference set by vulnerability type and configuration. Snyk Code appears as 100% because it defines and reproduces the reference set. The model rows show where agentic review agrees with that reference set and where it falls short.

<!-- VISUAL: reference-coverage-by-type-and-config -->

*Figure 6: Mean recall against the Snyk Code reference set by vulnerability type and configuration. Snyk Code is shown as deterministic reference reproduction; model rows show where agentic review agrees or falls short by class.*

The model configurations were strongest on familiar, high-signal exploit shapes: command injection, code injection, hardcoded credentials, SQL injection, SSRF, open redirect, prototype pollution, and ReDoS were often found cleanly. They were weaker on resource-limit findings, improper sanitization, type validation, insecure transport, framework information exposure, and repeated path traversal flows.

That pattern is visible in `js-project-tigerteam`, where every model configuration consistently found the hardcoded database password, reflected XSS, path traversal, and command injection across all 25 model repetitions.

```js
app.get("/greet", (req, res) => {
  const name = req.query.name;
  res.send(`<html><body><h1>Hello, ${name}!</h1></body></html>`);
});

app.get("/file", (req, res) => {
  const filename = req.query.filename;
  const basePath = "/var/app/public/";
  fs.readFile(basePath + filename, "utf8", (err, data) => {
    if (err) return res.status(404).send("Not found");
    res.send(data);
  });
});

app.get("/ping", (req, res) => {
  const host = req.query.host;
  exec("ping -c 1 " + host, (err, stdout, stderr) => {
    if (err) return res.status(500).send("Error");
    res.send(`<pre>${stdout}</pre>`);
  });
});
```

But the same fixture included a SQL-shaped mock helper:

```js
function dbQuery(sql) {
  console.log("Query:", sql);
  return [];
}

app.get("/users", (req, res) => {
  const username = req.query.username;
  const sql = "SELECT * FROM users WHERE username = '" + username + "'";
  const results = dbQuery(sql);
  res.json(results);
});
```

Models reported SQL injection in 25 of 25 `js-project-tigerteam` model runs. In this fixture, Snyk Code was right not to report it: `dbQuery()` logs the string and returns an empty array. There is no executable SQL sink. This is the kind of case where an LLM can mistake vulnerability-shaped code for an exploitable vulnerability.

`js-project-nightowl` showed the opposite lesson. All 25 model runs reported SQL injection outside the Snyk Code reference set, and this time the model signal is likely valuable:

```js
deleteTodo: (id) => db.prepare("DELETE FROM todos WHERE id = " + id).all(),
```

That finding was counted as unmatched because it was not in the Snyk Code reference set. It should not be dismissed as hallucination. It is likely a real product gap to investigate. The benchmark is stronger, not weaker, because it exposed that case.

<!-- VISUAL: extra-reports-by-type-and-model -->

*Figure 7: Average unmatched reports per model run by vulnerability type and model configuration. These include model false positives, adjacent review comments, and likely product-gap candidates outside the Snyk Code reference set.*

This second heatmap shows the other side of complementarity: extra model reports are not one homogeneous category. Some are likely false positives, like the non-executable SQL-shaped mock helper in `js-project-tigerteam`. Some are adjacent security review comments that are out of scope for the reference set. Some, like the SQL injection report in `js-project-nightowl`, are likely valid findings that should feed back into Snyk Code coverage.

The complementarity also runs in the other direction. `js-project-nightowl` is the most app-like fixture in JS 1.0: `server.js` is 198 lines, with `db.js` and `public/app.js` adding another 183 lines of JavaScript. It has routing, uploads, attachment deletion, downloads, and database state. Claude Opus 4.6 High was perfectly stable on this fixture, but stable at only 40.0% F1. Across five repetitions it missed every path-traversal reference finding and two of three resource-limit finding opportunities.

<!-- VISUAL: larger-fixture-score-by-config -->

*Figure 8: Mean benchmark score for the larger multi-file fixture. Error bars show standard deviation across repeated runs.*

The missed pattern spanned repeated attachment flows:

```js
if (req.file) {
  if (existing.attachment_stored_name) {
    fs.unlink(path.join(UPLOADS_DIR, existing.attachment_stored_name), () => {});
  }
  updates.push("attachment_original_name = ?", "attachment_stored_name = ?");
  values.push(req.file.originalname, req.file.filename);
} else if (req.body.removeAttachment === true || req.body.removeAttachment === "true") {
  if (existing.attachment_stored_name) {
    fs.unlink(path.join(UPLOADS_DIR, existing.attachment_stored_name), () => {});
  }
}
```

The model found some representative issues, then failed to enumerate repeated vulnerable sinks. That is exactly where deterministic data-flow analysis is valuable. SAST coverage and model review are not duplicates of each other; they are different instruments with different blind spots.

## Result 3: Cost Did Not Predict Quality

Claude Opus 4.7 Max was the most expensive model configuration in this run, but not the best performing one. It averaged 95,969 tokens and $0.3559 per model session. Claude Opus 4.6 Medium averaged 51,574 tokens and $0.0628 per model session. Opus 4.7 Max therefore cost 5.67x more and used 1.86x more tokens, while scoring lower: 68.8% F1 versus 75.4% for Opus 4.6 Medium.

<!-- VISUAL: score-vs-cost-model-callouts -->

*Figure 9: Model-only cost/quality tradeoff. Better points move toward the top-left: higher F1 score at lower estimated model-session cost.*

The absolute dollar amounts are small because the fixtures are small. The scaling question is not. Real security checks run during coding-agent sessions, commits, pull requests, and CI jobs across repositories that are orders of magnitude larger than these snippets. More expensive inference is not automatically better security coverage.

## Agreement Scores, For Context

F1 is still useful, as long as it is described precisely: it measures agreement with the Snyk Code reference set. On that metric, Snyk Code SAST reproduced its reference set with 100.0% F1 and 0.0 percentage-point score standard deviation. The best model configuration was Claude Opus 4.6 Medium at 75.4% F1, 68.0% recall, and 91.5% precision.

| Configuration | F1 | F1 std. dev. | Recall | Precision | Avg. duration | Avg. tokens | Est. cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Snyk Code SAST | 100.0% | 0.0 pp | 100.0% | 100.0% | 14.8s | 0 | N/A |
| Claude Opus 4.6 Medium | 75.4% | 0.2 pp | 68.0% | 91.5% | 27.3s | 51,574 | $0.0628 |
| Claude Opus 4.6 High | 75.2% | 0.3 pp | 68.2% | 89.8% | 53.8s | 66,929 | $0.1249 |
| Claude Opus 4.7 Max | 68.8% | 2.2 pp | 71.4% | 69.6% | 37.4s | 95,969 | $0.3559 |
| Claude Sonnet 4.6 Medium | 67.4% | 0.9 pp | 80.9% | 62.6% | 59.3s | 56,992 | $0.0860 |
| Claude Sonnet 4.6 High | 64.9% | 3.5 pp | 81.3% | 58.6% | 94.8s | 74,240 | $0.1322 |

This table should not be read as "Snyk proved Snyk is 100% accurate." It should be read as: Snyk Code produced a deterministic reference set; models partially agreed with it; and the differences reveal repeatability, cost, and coverage tradeoffs worth measuring.

## Takeaways and Next Steps

The reference set comes from Snyk Code. That is transparent and reproducible, but circular if treated as a universal truth set. This report avoids that claim. The benchmark measures model agreement with Snyk Code findings and uses divergences to study repeatability and complementarity.

The scorer is generous. It matches by vulnerability type, not exact file, line, severity, or source-to-sink identity. A stricter scorer would likely reduce model agreement scores and expose more duplicate-flow mistakes.

The fixtures are small JavaScript and Express applications. They are useful for controlled measurement, but they do not cover large monorepos, framework-heavy TypeScript applications, multi-service architectures, or business-logic vulnerabilities. `js-project-nightowl` already shows that app-like structure changes model behavior.

The recurrence analysis uses normalized finding signatures. For the model-by-model unmatched charts, the signature is task + vulnerability type + file + line, grouped separately for each model configuration. Different normalization choices change the exact percentages, which is why the signature is part of the chart handoff and reproducibility notes.

### What Comes Next

The next Snyk VulnBench release should move beyond small self-contained snippets. We plan to add more full-fledged application structures, LLM-sourced vulnerabilities, business-logic and BOLA classes, and an independent ground truth source such as BaxBench-style reference data.

We should also separate benchmark tracks. One track can continue to measure agreement with Snyk Code so we can compare model behavior against a deterministic SAST reference. Another should use independent, externally reviewable ground truth so the headline results are not tied to Snyk's own findings.

Finally, future reports should evaluate combined workflows: model-only review, SAST-only analysis, and LLM review augmented with SAST context. The JS 1.0 data already points in that direction. Models and SAST do not fail the same way. That is the reason to combine them.
