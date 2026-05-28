# Snyk VulnBench JS 1.0: Coding Agents vs. Snyk Code SAST

Snyk VulnBench JS 1.0 measures how well agentic LLM security review agrees with Snyk Code's JavaScript SAST findings on small Express applications. Across 10 fixtures, 44 Snyk Code reference findings, and 300 total runs, Snyk Code SAST was deterministic and complete against its own reference set: 100.0% F1, 100.0% recall, and 100.0% precision. The best model configuration, Claude Opus 4.6 Medium, reached 75.4% F1, 68.0% recall, and 91.5% precision. That is a strong result for a general-purpose coding agent, but still 24.6 percentage points behind the Snyk Code baseline.

The model results also show why repeated runs matter. Claude Sonnet 4.6 High had the highest model recall at 81.3%, but only 58.6% precision and the largest headline score variance at 3.5 percentage points. Claude Opus 4.7 Max used the most tokens and had the highest estimated model-session cost, but scored lower than both Opus 4.6 configurations. In this benchmark, the best quality, cost, speed, and stability tradeoff among model runs came from Claude Opus 4.6 Medium; the overall tradeoff winner remained Snyk Code SAST.

## Why We Built This

Coding agents are increasingly asked to review code as they write it. That changes the security question from "can a tool scan this repository?" to "can an agent reliably identify the vulnerabilities it is about to introduce, modify, or approve?" General-purpose LLMs are useful because they can read unfamiliar code, follow instructions, and explain their reasoning. Security scanning engines are useful because they are deterministic, specialized, and designed to recognize vulnerable source-to-sink flows at scale.

Snyk VulnBench compares those two styles of analysis on the same code. The goal is not to prove that one technique can replace the other. It is to measure what happens when agentic LLM review is evaluated as a vulnerability-finding system and compared against a Snyk Code SAST reference set.

For JS 1.0, the benchmark focuses on compact JavaScript and Express applications. The fixtures are intentionally small, but they contain realistic vulnerability shapes: command injection, path traversal, reflected XSS, hardcoded credentials, unsafe dynamic code execution, resource-limit issues, framework information exposure, open redirects, and SQL-like data-flow cases. Some fixtures are a single `app.js`; others include a small database module and frontend JavaScript.

## Benchmark Design

Snyk VulnBench JS 1.0 contains 10 JavaScript fixture projects with 44 Snyk Code reference findings. Each fixture lives under `fixtures/` and exposes only the application project directory to the model during evaluation. The `findings.json` file, which contains the reference findings, sits outside the model's working context.

The evaluated configurations were:

| Configuration | Type | Repetitions per task |
|---|---:|---:|
| Snyk Code SAST | Command baseline | 5 |
| Claude Opus 4.6 Medium | Model via Claude Code harness | 5 |
| Claude Opus 4.6 High | Model via Claude Code harness | 5 |
| Claude Opus 4.7 Max | Model via Claude Code harness | 5 |
| Claude Sonnet 4.6 Medium | Model via Claude Code harness | 5 |
| Claude Sonnet 4.6 High | Model via Claude Code harness | 5 |

Each of the 10 tasks was run five times for each configuration. That produced 250 model runs and 50 Snyk Code SAST baseline runs, for 300 total benchmark runs.

The model prompt was intentionally straightforward: the model was told to act as a security expert, audit every file, and return findings as a JSON array with vulnerability type, file, line, severity, and description. The benchmark did not include vulnerability hints in comments, file names, or code structure.

Scoring uses precision, recall, and F1:

| Metric | Meaning |
|---|---|
| Recall | How many Snyk Code reference findings the configuration found |
| Precision | How many reported findings matched the Snyk Code reference set |
| F1 | The harmonic mean of precision and recall |

The matching rule is intentionally lenient. A model finding is credited when it reports the same vulnerability type as a reference finding. It does not need to match the same line number, file name, or severity. An agent that reports 4 findings, where 3 match the reference set and 1 is extra, with 1 reference finding missed, has precision 75.0%, recall 75.0%, and F1 75.0%.

That design makes the benchmark generous to models. It also means the results should be read as agreement with the Snyk Code reference set, not as a complete claim about every possible security issue in each project.

## Results

<!-- VISUAL: headline-score -->

*Figure 1: Macro-averaged benchmark score across all fixtures. Error bars show standard deviation across repeated runs.*

| Configuration | F1 | F1 std. dev. | Recall | Precision | Avg. duration | Avg. tokens | Est. cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Snyk Code SAST | 100.0% | 0.0 pp | 100.0% | 100.0% | 14.8s | 0 | N/A |
| Claude Opus 4.6 Medium | 75.4% | 0.2 pp | 68.0% | 91.5% | 27.3s | 51,574 | $0.0628 |
| Claude Opus 4.6 High | 75.2% | 0.3 pp | 68.2% | 89.8% | 53.8s | 66,929 | $0.1249 |
| Claude Opus 4.7 Max | 68.8% | 2.2 pp | 71.4% | 69.6% | 37.4s | 95,969 | $0.3559 |
| Claude Sonnet 4.6 Medium | 67.4% | 0.9 pp | 80.9% | 62.6% | 59.3s | 56,992 | $0.0860 |
| Claude Sonnet 4.6 High | 64.9% | 3.5 pp | 81.3% | 58.6% | 94.8s | 74,240 | $0.1322 |

Snyk Code SAST is the reference baseline in this setup, so its 100.0% score means it reproduced the Snyk Code reference set on every repeated run. The model configurations were meaningfully behind that baseline. The top two model runs were Claude Opus 4.6 Medium at 75.4% F1 and Claude Opus 4.6 High at 75.2% F1. Sonnet configurations found more reference vulnerability types on average, but did so with substantially more false positives.

<!-- VISUAL: headline-recall-precision -->

*Figure 2: Macro-averaged recall and precision for find-vulns tasks.*

The precision-recall split is the clearest model behavior difference. Claude Opus 4.6 Medium was the cleanest model configuration, with 91.5% precision, but it found only 68.0% of the reference findings. Claude Sonnet 4.6 High found 81.3% of the reference findings, the best model recall in the run, but precision fell to 58.6%.

<!-- VISUAL: headline-score-vs-cost -->

*Figure 3: Model-only cost/quality tradeoff. Better points move toward the top-left: higher score at lower estimated session cost.*

Cost did not predict quality. Claude Opus 4.7 Max averaged 95,969 tokens and $0.3559 per model session, about 1.86x the tokens and 5.67x the estimated cost of Claude Opus 4.6 Medium. It scored 68.8% F1, below Opus 4.6 Medium's 75.4%.

<!-- VISUAL: headline-score-vs-duration -->

*Figure 4: Speed/quality tradeoff across model and command configs. Better points move toward the top-left: higher score in less wall-clock time.*

Snyk Code SAST was also the fastest configuration at 14.8 seconds on average. The nearest model configuration was Claude Opus 4.6 Medium at 27.3 seconds, about 1.85x slower. Claude Sonnet 4.6 High averaged 94.8 seconds and had the largest session-duration standard deviation, 12.3 seconds.

<!-- VISUAL: headline-score-stability -->

*Figure 5: Quality and repeated-run stability. Better points move toward the top-left: higher score with lower score standard deviation.*

Repeated runs exposed a practical reliability gap. Snyk Code SAST had 0.0 percentage-point score standard deviation. Opus 4.6 Medium and High were also stable at the headline level, with 0.2 and 0.3 percentage-point standard deviation. Sonnet 4.6 High varied more: 3.5 percentage points at the headline level, with much wider variation on individual fixtures.

## What The Numbers Mean

### Models Often Found The Obvious Vulnerability Shape

The `js-project-tigerteam-find-vulns` fixture is a compact 57-line Express application with hardcoded credentials, reflected XSS, path traversal, command injection, information exposure, and two resource-limit findings in the Snyk Code reference set.

All model configurations consistently found the high-signal application flaws: the hardcoded database password, reflected XSS in `/greet`, path traversal in `/file`, and command injection in `/ping`. Across 25 model repetitions, those four finding types appeared as true positives every time.

From `fixtures/js-project-tigerteam/project/app.js`:

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

The misses were less exploit-shaped. The Express `X-Powered-By` information exposure was found in only 5 of 25 model repetitions. One resource-limit finding was found in 4 of 25 repetitions, and the second was missed in all 25 model repetitions.

The same fixture also shows a scoring nuance. Every model repeatedly reported SQL injection in the `/users` endpoint:

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

In this fixture, Snyk Code was right not to report SQL injection: `dbQuery()` is a mock helper that logs the string and returns an empty array. The query string is never sent to a database or another executable SQL sink. The models still reported SQL injection in all 25 model repetitions across the five model configurations, while Snyk Code reported zero SQL injection findings across its five baseline repetitions. That single decoy pattern accounted for 25 of 48 model false positives on Tigerteam.

That distinction matters. The models failed by treating vulnerability-shaped code as an exploitable vulnerability without confirming the sink. SAST engines are usually built around executable flows and recognized sinks, which is exactly the distinction this fixture was designed to test.

<!-- VISUAL: tigerteam-precision-slope -->

*Figure 6: False-positive profile on Tigerteam. Better points move toward the bottom-left: fewer false positives from the non-executable SQL pattern and fewer other false positives per run.*

### Recall And Noise Can Move In Opposite Directions

The `js-project-copperline-find-vulns` fixture shows a model behavior that looks good if recall is the only metric and much weaker when precision is included. Both Sonnet configurations found all three Snyk Code reference findings in every repetition: 100.0% recall, 0 false negatives. But Claude Sonnet 4.6 High produced 17 false positives across five repetitions, and Claude Sonnet 4.6 Medium produced 12.

Claude Sonnet 4.6 High averaged 66.7% F1 on Copperline despite perfect recall, because precision was only 51.6%. Its per-run score ranged from 46.2% to 85.7% on the same code and same prompt.

The main endpoint is short:

```js
function runInstaller(command, options) {
  return cp.spawn(shell(), ["-c", command], options);
}

app.post("/plugins/install", (req, res) => {
  const packageName = req.body.package || "@warehouse/scanner-bridge";
  const command = `npm install ${packageName} --prefix ${pluginRoot}`;
  const child = runInstaller(command, { cwd: __dirname });
  let output = "";

  child.on("close", (code) => {
    res.status(code === 0 ? 200 : 500).json({ package: packageName, code, output });
  });
});
```

The command injection finding is real against the reference set. The extra reports were mostly adjacent concerns: missing authentication or authorization, information exposure from returning command output, CSRF, and weak package-name validation. Some of those could be valid review comments in a production design review, but they were not part of the Snyk Code reference set for this fixture.

This is one of the core tradeoffs in agentic security review. A model can be expansive and useful as a brainstorming partner, but that same behavior creates triage cost when the output is treated as vulnerability scanner output.

### Source-To-Sink Boundaries Remain Hard

Several model false positives were not entirely new vulnerability claims. They were duplicate descriptions of the same underlying data flow.

In Copperline, one run reported command injection both at the shell execution helper and at the string construction site. Those two locations are part of the same source-to-sink path: `req.body.package` flows into `command`, and `command` flows into `cp.spawn("sh", ["-c", command])`. The scorer credited one command injection and counted the duplicate as an extra report.

The same behavior appeared in `js-project-ironclad-find-vulns`, where `app.js` forwards an untrusted query parameter into `userMode.js`:

```js
app.get("/users", (req, res) => {
  let userProvidedValue = req.query.id;

  fetchUserById(knex, userProvidedValue)
    .then((result) => {
      res.json(result.rows);
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});
```

The sink is in the imported helper:

```js
function fetchUserById(knex, userProvidedValue) {
  return knex.raw(`SELECT * FROM users WHERE id = ${userProvidedValue}`);
}
```

Claude Opus 4.6 Medium and Claude Opus 4.6 High both scored 100.0% on Ironclad across all five repetitions, with 100.0% precision and recall. But the broader pattern still matters because Opus 4.7 Max duplicated SQL injection in one repetition by reporting the sink in `userMode.js` and the forwarding call in `app.js` as separate findings. Sonnet 4.6 High also found all three reference findings every time, but its F1 moved from 85.7% down to 66.7% as it introduced different false positives.

Agents can follow cross-file flows. The harder problem is consistently deciding where one vulnerability ends and the next begins.

### Subtle Sanitization Findings Are Easy To Miss

The `js-project-goldleaf-find-vulns` fixture contains an obvious dynamic-code execution pattern:

```js
function buildPreview(key) {
  const obj = {};
  const assignment = `obj[${JSON.stringify(key)}]=42`;

  eval(assignment);
  return obj;
}
```

Every Opus 4.7 Max run found the direct code-injection issue. But Opus 4.7 Max missed the improper-code-sanitization reference finding in every run. Its recall stayed fixed at 50.0%; the score variance came from false-positive noise, not from alternating between finding and missing the subtle issue.

The contrast with Opus 4.6 is useful. Claude Opus 4.6 Medium and High both scored 66.7% on Goldleaf with 0.0 percentage-point score standard deviation, 50.0% recall, and 100.0% precision. Opus 4.7 Max averaged 50.7% F1 with 60.0% precision and $0.3248 estimated cost on this task. It cost more and produced more noise without improving recall.

This fixture is small enough that "read every line" is not the limiting factor. The gap is semantic. The model recognized `eval()` as dangerous, but did not consistently classify the attempted sanitization pattern as its own issue.

### Larger App-Like Surfaces Created A Recall Cliff

The hardest qualitative case was `js-project-nightowl-find-vulns`. It is meaningfully larger than the single-file snippets: `server.js` is 198 lines, with `db.js` and `public/app.js` adding another 183 lines of JavaScript. It has routing, upload handling, database state, attachment deletion, and download behavior.

Snyk Code SAST reported seven reference findings. The best model aggregate was Claude Opus 4.6 High at only 40.0% F1, with 28.6% recall and 66.7% precision. Claude Opus 4.7 Max averaged 30.7% F1, with 34.3% recall and 28.1% precision.

The missed findings were systematic, not random. Claude Opus 4.6 High had exactly 2 true positives, 1 false positive, and 5 false negatives in every repetition. It missed two of three resource-limit findings and all three path-traversal findings each time.

The vulnerable pattern spans repeated attachment flows:

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

And again in delete and download paths:

```js
app.delete("/api/todos/:id", (req, res) => {
  const id = req.params.id;
  try {
    const row = q.getStoredAttachmentOnly.get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (row.attachment_stored_name) {
      fs.unlink(path.join(UPLOADS_DIR, row.attachment_stored_name), () => {});
    }
```

```js
app.get("/api/todos/:id/attachment", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const row = q.getAttachmentForDownload.get(id);
    if (!row || !row.attachment_stored_name) return res.status(404).json({ error: "No attachment" });
    const filePath = path.join(UPLOADS_DIR, row.attachment_stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });
    res.download(filePath, row.attachment_original_name || "attachment");
```

The models tended to find one representative problem and stop, or to pivot into adjacent concerns. Opus 4.7 Max found one additional reference issue in one repetition, but added much more noise: SQL injection, CSRF, IDOR, type-validation, upload validation, insecure transport, dependency concerns, and filename sanitization.

Nightowl is the clearest warning in this benchmark. On larger app-like surfaces, model review did not just add false positives. It failed to systematically enumerate repeated vulnerable sinks.

One caveat is worth calling out. Claude Opus 4.6 High repeatedly reported SQL injection in Nightowl's `deleteTodo` helper:

```js
deleteTodo: (id) => db.prepare("DELETE FROM todos WHERE id = " + id).all(),
```

This was counted as a false positive because it was not part of the Snyk Code reference set. It is likely a real finding and should be treated as a product gap to investigate, not as proof that the model was simply wrong. This is why the benchmark reports agreement with the Snyk Code reference set rather than claiming the reference set is exhaustive.

## Operational Implications

The benchmark points to a practical division of labor.

Snyk Code SAST behaved like a deterministic scanner. It was fastest, had zero score variance, and exactly reproduced the reference set across repeated runs. That matters for CI, pull request checks, and agent workflows where the same code should produce the same security signal every time.

The LLM configurations behaved more like security reviewers. They often found familiar exploit shapes, sometimes surfaced plausible issues outside the reference set, and produced natural-language descriptions. But they also missed less obvious classes, duplicated source-to-sink paths, and varied across repetitions. In automation, those properties translate into missed findings, triage overhead, and non-deterministic developer experience.

Token and cost numbers also matter less in the small and more at scale. The mean model-session cost in this benchmark is low in absolute dollars, but the fixtures are tiny. Real use cases ask security checks to run during coding-agent sessions, commits, pushes, and pull requests across repositories that are orders of magnitude larger than a 50-line Express file. A configuration that is 5.67x more expensive without better F1 is hard to justify as the default security control.

## Limitations

This benchmark uses Snyk Code findings as the reference set. That makes the comparison transparent, but it also means the benchmark measures agreement with Snyk Code, not complete vulnerability truth. In at least one case, a model-reported SQL injection in Nightowl appears likely valid even though it was counted as a false positive.

The scorer is lenient by design. It matches by vulnerability type only and does not require exact file, line, severity, or source-to-sink path. A stricter scorer would likely reduce model scores, especially where models reported the right class but the wrong location or merged and duplicated flows inconsistently.

The fixtures are intentionally small JavaScript and Express applications. They cover useful vulnerability shapes, but they do not represent large monorepos, framework-heavy applications, TypeScript-specific patterns, or other languages. The results should not be generalized beyond this benchmark without more data.

Finally, the model configurations were run through one agent harness and one prompt. Different tools, prompts, MCP integrations, or output schemas could change the result. The repeated-run variance in this report is a feature of the tested setup, not a universal constant for every possible agent workflow.

## What Comes Next

The next versions of Snyk VulnBench should expand in three directions.

First, the benchmark should add larger application fixtures where complete enumeration matters more than recognizing a single representative pattern. Nightowl shows that this is where agentic review can fall off quickly.

Second, the scorer should add stricter optional modes: exact finding identity, file and line proximity, source-to-sink path deduplication, and severity agreement. The current type-only scorer is useful for a generous first pass, but it hides important differences between "same class" and "same vulnerability."

Third, the benchmark should evaluate assisted agent configurations that combine LLM reasoning with specialized SAST output. The results here do not argue against agents. They argue that reliable security review needs deterministic analysis in the loop, especially when the output is used in CI or as an automated coding-agent guardrail.

## Appendix: Reproducibility Notes

The structured results for this article are in `reports/vulnbench-js-1.0/benchmark-2026-05-20T23-06-29-348Z.jsonl`. The generated chart handoff files are `reports/vulnbench-js-1.0/article-visuals.md` and `reports/vulnbench-js-1.0/chart-manifest.json`.

The model system prompt required findings to end with a `FINDINGS_JSON:` block:

```plaintext
You are a security expert performing a code audit.
Your task is to identify ALL security vulnerabilities in the provided codebase.
```

The user prompt was:

```plaintext
Audit all files in this directory for security vulnerabilities. Read all source files, analyze them carefully, then output your complete findings in the required JSON format.
```

The key aggregate rows are the JSONL records with `"_type":"config-aggregate"`. Per-fixture rows use `"_type":"task-aggregate"`, and individual repetitions use `"_type":"run"`.
