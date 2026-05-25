We are now going to author the final benchmarking article. See below sections for benchmark setup, guidelines, context. Additionally see the references section for code samples from the benchmark execution as relevant talking points to include in the article in support of claims and transparency about model evaluations.

## Benchmark goal



## Benchmark setup

The benchmark setup:
- The benchmark is a set of 10 small JavaScript source code snippets based on Express 4 application framework.
- The focus of the benchmark was to evaluate the ability of the models to find vulnerabilities in the source code snippets.
- The source code snippets Lines of Code (LOC) are between 20 to 300 lines of code.
- The projects are located in the `fixtures/` directory.
- The projects are named `js-project-<name>-find-vulns`.
- The projects are written in JavaScript.
- The projects are vulnerable to a varying set of vulnerabilities.
- The vulnerabilities are located in the `findings.json` file in the project directory for each project fixture (but outside of the context provided to the model during evaluation).
- There are no indications of the vulnerabilities in the source code snippets, not via comments, nor via code structure, nor via naming conventions.
- Projects are mostly self-contained within a single `app.js` file and some projects have included static HTML files via Template Engines or plain HTML and JavaScript files, mostly contained in an `index.html` and a `app.js` file.

## Guidelines

Guidance:
- The benchmark evaluated Sonnet 4.6, Opus 4.6, and Opus 4.7. Sonnet 4.6 and Opus 4.6 included runs with both `medium` and `high` effort levels. Opus 4.7 included runs with the `max` effort level.
- The benchmark executed with 5 repetitions per each configuration of model+reasoning.
- The benchmark included a straight-forward prompt guidance for the models (I will provide it in the references below)
- The benchmark evaluated said models within the Claude Code harness using the Claude Agent SDK.
- The ground truth dataset for the findings in which the models were compared against is provided by Snyk Code detection results. As such, and in full transparency, we treat Snyk Code reported vulnerabilities as the actuals and the baseline for the scope of True Positive (TP) and True Negatives (TN). In this sense, this benchmark compares how well the models do in finding the same vulnerabilities that Snyk Code reports on.
- Even though I have provided for you talking points below, they shouldn't be use verbatim nor turn into an opinion article but rather help you with overall direction and interpretation of the data.

## Context

Benchmark resources and context to pull the data from for the article write-up:
- The full benchmarking results file is in JSONL format in the `reports/vulnbench-js-1.0/` directory. This is the structured JSON data.
    - Inside the structured JSONL file, you will find the headline numbers for the report in JSON lines with this object key/value: `"_type":"config-aggregate"`.
- The static HTML report is in the `reports/vulnbench-js-1.0/benchmark-report.html` file. This is the visual representation of the data, so we can embed and integrate visuals into the written article.

## Talking points 

### General proposal for talking points in the article

- Non-deterministic aspect of LLMs and coding agents - the benchmark ran with 5 repetitions and we keep a log of standard deviation represented by error bars in the visual charts. This is helpful to make the point so that even if there was a run that the model scored 100%, there is potentially another run where it scored lower. If that is the case, then it makes a good argument that the non-deterministic aspect of LLMs (even with an advance harness as that of Claude Code) introduces unexepcted variance that may miss reporting on real vulnerabilities.
- Wall time execution - speed of execution. Does this slow down developers, agents and CIs? how does it compare against Snyk Code?
- Token spend and cost - where-as average run cost in this benchmark may be low, how does this scale with real code-bases that are far greater than a single file of 50 LOC? how does it scale when analysis needs to be performed on every coding agent session, every commit, push and PR opened in the repository?

### Specific call-outs related to the above, from the charts data

Note: double check all of my claims here that they are supported in the dataset!

- For headline scores: all models seem to do at least 25% worse compared to Snyk Code's baseline findings
- For headline scores: Claude Sonnet 4.6 high in particular shows high variance in error rates across repeated runs (with a 7% deviation) as well as highest deviation for session duration
- For headline scores: Claude Opus 4.7 max is score is 30% off of Snyk Code SAST with relatively high variance, up to 34% worse. Notable for Opus 4.7 Max is total consumption is highest at almost 2x Opus 4.6, and similarly cost is highest for this model at 465% more expensive than Claude Opus 4.6 on medium reasoning despite Opus 4.6 on medium reasoning achieving a higher F1 score of 75.4% compared to Opus 4.7 Max at 68.8%
- For headline scores: Claude Opus 4.6 medium considerably scores better in precision (low noise, low positive rate) at 91.5% compared to Opus 4.7 Max at only 69.6%
- For headline scores: Opus 4.6 medium demonstrates the best value in terms of scores vs cost, followed by Opus 4.6 high
- For headline scores: for speed of execution, Snyk Code scans the fasted at less than 15 seconds on average runs. the next closest agentic LLM-based scan is almost two times slower at 27.3 seconds
- For headline scores: for score stability which demonstrates consistent results and deterministic behavior, Snyk Code which is based on SymbolicAI engine delivers 100% consistent results. 

### Specific insights from task evals and the tested code

The following are insights that can be drawn based on sampled data from the eval results of various configuration with regards to specific code patterns in tasks.

#### All vulnerabilities reported but at the cost of high noise

For one of the tasks, `js-project-copperline-find-vulns`, both Sonnet configs had 0 FN in every repetition. Recall was 1.0 throughout. Consistently through-out all repetitions the model found all the same findings that Snyk Code reported on, but also reported many other FPs demonstrated with a precision as low as 51.6%.

From this eval:

- Claude Sonnet 4.6 High had an aggregate of 17 FPs total across 5 reps (mataining 0 FNs). Sampling from the repetaitions:
    - Rep 1: 4 FPs: missing auth/authz, information exposure from returned command output, weak package type/name validation, CSRF.
    - Rep 2: 2 FPs: information exposure, missing auth/authz.
    - Rep 3: 3 FPs: missing auth/authz, information exposure, CSRF.
- Claude Sonnet 4.6 Medium had an aggregate of 12 FPs total across 5 reps with similar called out FPs.

For example, the missing auth/authz issue was reported for the following endpoint missing authentication or authorization checks:

```js
app.post("/plugins/install", (req, res) => {
  const packageName = req.body.package || "@warehouse/scanner-bridge";
  const command = `npm install ${packageName} --prefix ${pluginRoot}`;
  const child = runInstaller(command, { cwd: __dirname });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.on("close", (code) => {
    res.status(code === 0 ? 200 : 500).json({ package: packageName, code, output });
  });
});
```

That same API endpoint had drawn other FPs from Claude Sonnet 4.6 such as missing CSRF and type validation.

The main insight here is that both configs consistently found all ground-truth issues, but repeatedly over-reported auth/authz, information exposure, and CSRF as extra vulnerabilities.

#### Gap in drawing conclusions from source-to-sink program call flow

For the task `js-project-copperline-find-vulns`, the API endpoint had drawn extra noise from Claude Sonnet 4.6: one of the repetitions from the model execution reported a command injection in two different parts of the code in `app.js`: first on app.js:17 for the `cp.spawn()` and secondly on app.js:22 for the `npm install` definition of the `command` variable:

```js
function runInstaller(command, options) {
  return cp.spawn(shell(), ["-c", command], options);
}

app.post("/plugins/install", (req, res) => {
  const packageName = req.body.package || "@warehouse/scanner-bridge";
  const command = `npm install ${packageName} --prefix ${pluginRoot}`;
```

Our scorer only credited one of these reports as valid, and considered the second one as FP. This directly demonstrates the challenge of coding agents and the models to draw a clear line of source-to-sink call path for the program's code. The two lines of code called out by Claude Sonnet 4.6 aren't distinct, they're one and the same, and should be reported as one issue, not two separate vulnerabilities.

#### Limitation in detecting subtle code sanitization flaws

When analyzing the task `js-project-goldleaf-find-vulns`, we found that Opus 4.7 Max found the direct code-injection issue in every run, but missed the improper-code-sanitization finding in every run. The score variance is driven by FP noise, not by alternating recall.

The code snippet for this small JavaScript application shows a clear security bad practice with the invocation of `eval()` that is sourced from user input. However, this isn't the only security bad practice in this code snippet, albeit concise as it is. In app.js:10 of the full `app.js` source code there's a call to `JSON.stringify()` that is used in aim to serialize and sanitize the data to a string-like type. While it may be relatively benign in backend Node.js code, this exact same pattern for client-side code running in the browser will result in a Cross-site Scripting vulnerability.

```js
function buildPreview(key) {
  const obj = {};
  const assignment = `obj[${JSON.stringify(key)}]=42`;

  eval(assignment);
  return obj;
}

app.post("/reports/preview", (req, res) => {
  const metricKey = req.body.metricKey || "monthlyTurnover";
  const preview = buildPreview(metricKey);

  res.json({ source: "saved-report", preview });
});
```

When Claude Opus 4.7 Max analyzed the code, twice out of the 5 repetitions precision was 100%, effectively reporting the true code-injection vulnerability, but at the same time missing out on an insecure code pattern.

The repeated FP pattern is also stable: improper-type-validation around `req.body.metricKey`, and allocation-of-resources-without-limits-or-throttling around rate limiting during request handling. Particularly interesting that the FP Claude Opus 4.7 reported was stable through-out 3 of the 5 repetitions and lends to the assumptions Claude Opus 4.7 Max makes about how the application is deployed.

Compared with other configs on this task, Claude Opus 4.7 Max is also not especially compelling: Opus 4.6 High and Medium both score 66.7% with 0pp score std dev, same 50% recall, and 100% precision. Opus 4.7 Max costs more on this task ($0.3248 mean aggregate cost) while scoring lower (50.7%) because it adds FPs in 3 of 5 runs.

#### Cross-file SQL Injection and non-determinism in model vulnerability findings

The task `js-project-ironclad-find-vulns` while being a short snippet of code, just 30 lines of code in `app.js` introduced a different pattern from some other tasks: it requires another source file and the vulnerability is a cross-file source-to-sink SQL injection vulnerability depicted in the following `userMode.js` source code:

```js
function fetchUserById(knex, userProvidedValue) {
  return knex.raw(`SELECT * FROM users WHERE id = ${userProvidedValue}`);
}
```

Claude Opus 4.6 High and Claude Opus 4.6 Medium both scored 100% across all 5 repetitions, with 0pp score std dev, 100% recall, and 100% precision. Opus 4.6 Medium is especially notable because it got the same perfect score as Opus 4.6 High while being faster and cheaper on this task.

But there is an important nuance: this is a perfect benchmark score, not necessarily a perfect semantic/line-level match. The ground truth information exposure is in the Express framework disclosure via missing `app.disable("x-powered-by")`. The scorer currently matches find-vulns by vulnerability type, so Opus 4.6’s information-exposure report was credited against the X-Powered-By ground truth even though the model usually reported `err.message` disclosure at app.js:25

```js
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
```

For Claude Opus 4.7 Max, some of the FPs were also interesting to look at:

- `improper-type-validation` in reps 2 and 3: it reported that `req.query.id` was not validated before the SQL layer. This is adjacent to the SQL injection, but the benchmark ground truth treats the vulnerability as SQL injection, not a separate type-validation issue.
- Duplicate `sql-injection` in rep 5: it reported the sink in `userMode.js` and also the forwarding call in `app.js` as separate SQL injection findings. This is a similar beahvior we've seen already in another insight call-out that demonstrates the coding agents harness and the model aren't performing a source-to-sink call path.

In addition, model results were not stable across repeated runs. On the same `js-project-ironclad-find-vulns` task, Claude Sonnet 4.6 High found all three baseline vulnerabilities in every repetition, but its precision varied as it introduced different false positives. As a result, its F1 score moved from 85.7% in one run down to 66.7% in another on the exact same code and prompt. This illustrates a practical reliability issue with agentic LLM security review: even when recall stays high, non-deterministic extra findings can materially change the result quality from run to run.

#### Larger app surface reveals a recall cliff

The task `js-project-nightowl-find-vulns` is meaningfully different from the earlier tiny snippets. The server alone is `198` LOC, plus `db.js` and `public/app.js` at another `151` LOC of frontend JavaScript. It has routes, upload handling, database state, attachment deletion, and download behavior.

Nightowl shows a different failure mode from the smaller fixtures: the models did not merely add noise, they failed to systematically enumerate repeated vulnerable sinks across a larger application flow. Claude Opus 4.6 High was perfectly stable across five repetitions, but stable at only `40.0%` F1, missing every path-traversal finding and two of three resource-limit findings each time. Claude Opus 4.7 Max occasionally found more, but only by introducing substantial false-positive noise, ending at `30.7%` aggregate F1. This suggests that as the codebase becomes more app-like, agentic LLM review can collapse from "finding the pattern" to "finding one example of the pattern."

That larger shape correlates with a major model recall drop. The best model aggregate was only **Claude Opus 4.6 High at 40.0% F1**, while **Claude Opus 4.7 Max averaged 30.7% F1**. Snyk Code SAST remained at `100%` per baseline ground truth setup.

The key missed pattern is not random: models repeatedly found `X-Powered-By` and one resource-limit issue, but missed most of the repeated filesystem path traversal findings.

As for the baseline - Snyk systematically enumerated repeated sink instances: three resource-limit findings and three path-traversal findings across update/delete/download attachment flows. The models tended to identify one representative issue and then stop, or pivot into adjacent concerns.

##### Missed findings: Opus 4.6 High vs Opus 4.7 Max

Claude Opus 4.6 High was stable, but stably incomplete: every repetition had `2 TP`, `1 FP`, and `5 FN`.

It missed these in all 5 reps:

- `js-alloc-without-limits-4b`
- `js-alloc-without-limits-4c`
- `js-path-traversal-4a`
- `js-path-traversal-4b`
- `js-path-traversal-4c`

Claude Opus 4.7 Max was noisier. Reps 1-4 missed the same 5 findings as Opus 4.6 High. Rep 5 improved recall and found one additional resource-limit issue plus one path traversal issue, but still missed:

- `js-alloc-without-limits-4c`
- `js-path-traversal-4b`
- `js-path-traversal-4c`

The relevant code is spread across multiple route paths:

```136:147:fixtures/js-project-nightowl/project/server.js
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
```

and also:

```166:174:fixtures/js-project-nightowl/project/server.js
app.delete("/api/todos/:id", (req, res) => {
  const id = req.params.id;
  try {
    const row = q.getStoredAttachmentOnly.get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (row.attachment_stored_name) {
      fs.unlink(path.join(UPLOADS_DIR, row.attachment_stored_name), () => {});
    }
```

It is important to note that Opus 4.6 High had one repeated FP: SQL injection in `deleteTodo`:

```34:35:fixtures/js-project-nightowl/project/server.js
  deleteTodo: (id) => db.prepare("DELETE FROM todos WHERE id = " + id).all(),
  getAttachmentForDownload: db.prepare(`
```

Against the benchmark baseline, this is an FP because Snyk Code did not include SQL injection in the ground truth, however, this is likely a true positive and will be addressed as product gap enhancement.

Opus 4.7 Max added much more noise and reported a surplus of potential vulnerability findings: SQL injection, CSRF, IDOR, type-validation, upload validation, insecure transport, dependency concerns, and filename sanitization. That explains why its recall was slightly better than Opus 4.6 High, but its F1 was worse overall.

#### Models followed the SQL-shaped decoy instead of the executable sink

The `js-project-tigerteam-find-vulns` task is a compact Express application at only 57 lines of code, but it contains a broad mix of vulnerability classes: hardcoded credentials, reflected XSS, path traversal, command injection, framework information exposure, and two allocation-of-resources-without-limits findings. Compared to the more app-like `nightowl` fixture, this is a simpler target, and the model behavior reflects that: every model found the "obvious" high-signal application flaws consistently, but still failed to match Snyk Code SAST's full baseline.

Across all model runs, the models consistently found the hardcoded database password, the reflected XSS in `/greet`, the path traversal in `/file`, and the command injection in `/ping`. Those four findings appeared as true positives in all 25 model repetitions (5 different models x 5 repetitions). The code paths are straightforward source-to-sink examples:

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

The gap was in the less "exploit-shaped" findings. The `X-Powered-By` information exposure was only found in 5 out of 25 model repetitions, the first resource-limit finding was found in only 4 out of 25 repetitions, and the second resource-limit finding was missed in every model repetition. In other fixtures where these weren't in the ground truth baseline, models still reported these type of vulnerabilities, effectively making them "in scope" to the type of security issues that models will report on.

There is also an important scoring nuance. Every model configuration repeatedly reported SQL injection in the `/users` endpoint:

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

Under the benchmark, this is counted as a false positive because Snyk Code SAST does not include SQL injection in the ground truth. That is likely because `dbQuery()` is a mock helper that logs and returns an empty array rather than calling a real SQL execution sink. This is a useful distinction to call out: the models inferred a plausible SQL injection from the string construction pattern, while Snyk appears to require a recognized executable sink before reporting it.

The main insight from Tigerteam is that LLM-based review can be very good at spotting familiar, high-salience vulnerability shapes, especially direct XSS, path traversal, command injection, and hardcoded secrets. But even in a tiny file, the models under-reported framework configuration and resource-exhaustion findings that Snyk Code captured consistently and overreported non-existent security issues.

