---
name: benchmark-fixture-statistics
description: >
  Produces a Markdown statistics report for the benchmark's fixture projects by
  combining each fixture's fixture.json metadata with cloc source-code counts.
  Use when the user asks for fixture statistics, project size, lines of code,
  fixture inventory, language breakdowns, or a comparison of benchmark projects.
  Use it even when the user only says "how big are the fixtures?" Do not use it
  for vulnerability scanning, benchmark scoring, or general repository LOC
  counts outside fixtures.
license: MIT
compatibility: >
  Requires the snyk-vulnbench repository, Node.js, a Unix-like shell, and the
  cloc CLI on PATH. No network access or authentication is required.
metadata:
  author: snyk-vulnbench
  version: 1.0.0
---
# Benchmark Fixture Statistics

# Instructions

Generate a reproducible, source-only inventory of the benchmark fixtures. The
repository convention is `fixtures/<fixture-name>/project/`; keep `fixture.json`
and ground-truth files outside the counted directory.

### Step 1: Determine the scope

1. With no fixture names in the request, include every directory under
   `fixtures/` containing a `project/` directory.
2. When the user names one or more fixtures, require exact directory names and
   report only those fixtures. Do not guess partial matches.
3. Resolve the repository root with `git rev-parse --show-toplevel` if the
   current working directory is not the repository root.
4. Stop with a clear error if a requested fixture or its `project/` directory
   does not exist.

**Done when:** the report scope is an explicit, sorted list of fixture names.

### Step 2: Collect fixture metadata

For every selected fixture, read `fixtures/<fixture-name>/fixture.json`.
Use the metadata as the source for the display name, kind, languages,
frameworks, runtimes, datastores, and provenance. Show `—` for an omitted
field, preserve unknown values, and flag missing or malformed metadata in a
Notes section instead of silently inventing values. Do not read or summarize
`findings.json` or `findings-attacker-reachable.json`; they are answer keys,
not project statistics.

**Done when:** every report row has either parsed metadata or an explicit
metadata warning.

### Step 3: Count source code

Verify `cloc` with `command -v cloc` and run the bundled collector:

```bash
node .agents/skills/benchmark-fixture-statistics/scripts/report.mjs
```

For a targeted report, append exact fixture names:

```bash
node .agents/skills/benchmark-fixture-statistics/scripts/report.mjs \
  app-project-coffeeshop python-project-cobalt
```

The collector runs `cloc` separately against each `project/` directory using
the benchmark's standard exclusions: JSON/Markdown/YAML/SVG extensions,
Dockerfiles, `.git`, `node_modules`, `dist`, `build`, and `target`. Preserve
these exclusions so reports remain comparable. Do not count the fixture root.

**Done when:** every selected project has `nFiles`, code, comment, blank, and
per-language code-line totals, or a visible error row.

### Step 4: Return the Markdown report

Return the collector's Markdown output directly so the chat renders it as
tables, not as a JSON dump or a fenced code block. Keep these sections:

1. `Project overview`: one row per fixture with metadata.
2. `Source-code size`: files, code LOC, comment LOC, blank LOC, and the
   language code-line breakdown.
3. `Totals`: aggregate counts and aggregate code LOC by language.
4. `Notes`: exclusions, warnings, and any failed counts.

Mention that `cloc` reports physical lines and that code, comments, and blanks
are separate counts. If a count fails, keep the other rows, explain the error,
and do not label the aggregate complete.

**Done when:** the user receives a readable Markdown report with scope,
metadata, per-project source statistics, totals, and reproducibility notes.

## Examples

User says: "How big are all the benchmark fixtures?"

Actions:
1. Discover every `fixtures/*/project` directory.
2. Read each sibling `fixture.json`.
3. Run the collector and return its overview, source-size, totals, and notes
   tables.

Result: The user receives a repository-wide Markdown inventory of fixture
metadata and source-code size.

User says: "Compare app-project-coffeeshop and python-project-cobalt by lines
of code."

Actions:
1. Resolve both exact fixture names.
2. Count only their `project/` directories with the standard exclusions.
3. Return the two metadata rows, code-size rows, and a scoped total.

Result: The user receives a focused, directly comparable Markdown report.

User says: "Give me fixture stats, but don't let dependencies and build output
inflate the numbers."

Actions:
1. Use the collector's standard exclusions for dependency and generated
   directories.
2. State the exclusions in the Notes section.
3. Explain that the result is a physical-line estimate, not a semantic measure
   of application complexity.

Result: The user receives a reproducible source-only estimate with its counting
policy documented.

User says: "The fixture inventory has one project with no fixture.json."

Actions:
1. Include the project if its source directory exists.
2. Mark missing metadata as `—` and add the exact fixture to Notes.
3. Never infer metadata from source files or answer keys.

Result: The report remains useful while making the metadata gap explicit.

## Troubleshooting

Error: `cloc: command not found`

Cause: The cloc CLI is not installed or is not on `PATH`.

Solution: Report the prerequisite failure and ask the user to install cloc;
do not substitute `wc -l`, `find`, or another counter because that breaks
comparability.

Error: `Unknown fixture` or `project/ directory not found`

Cause: The selector is not an exact directory under `fixtures/`, or the
fixture is incomplete.

Solution: Show the expected form `fixtures/<fixture-name>/project` and ask for
the exact name. Do not scan a parent fixture directory as a fallback.

Error: `fixture.json` cannot be parsed

Cause: The metadata manifest is malformed JSON.

Solution: Keep the project count if `project/` exists, mark metadata as
unavailable, and report the parse error in Notes. Do not use `findings*.json`
as a replacement.

Error: `cloc` exits nonzero for one project

Cause: The project may contain unreadable files, an unsupported path, or a
tool/runtime failure.

Solution: Preserve successful rows, show the failed fixture and stderr in
Notes, and mark totals as partial. Check the project path and rerun cloc for
that fixture after resolving the local failure.

Error: `cloc` prompts for authentication or returns an authentication error

Cause: cloc is a local command and should not require authentication; a shell
alias, wrapper, or unexpected executable is being invoked.

Solution: Verify `command -v cloc` and `cloc --version`. Report the environment
blocker rather than attempting network or credential changes.
