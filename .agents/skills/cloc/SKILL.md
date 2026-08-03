---
name: cloc
description: >
  Estimates source-code size with cloc using the repository's standard exclusions.
  Use when the user asks to count lines of code, compare project sizes, measure a
  fixture, or run cloc on a directory. Accept either a filesystem directory or a
  fixture name such as "app-project-keystonebank". Do NOT use for vulnerability
  scanning, code-quality analysis, or exact language-specific parsing.
license: MIT
compatibility: >
  Requires the cloc CLI and a Unix-like shell. In snyk-vulnbench, fixture names
  resolve to fixtures/<name>/project.
metadata:
  author: snyk-vulnbench
  version: 1.0.0
---

# cloc

# Instructions

Estimate project size with `cloc` and report the result without modifying the
project. Use the standard exclusions below so dependency folders, generated
artifacts, documentation, configuration, and common metadata do not inflate the
estimate.

### Step 1: Resolve the directory

Accept one directory argument from the user's request.

1. If the argument is an existing directory, use it.
2. If the existing directory contains a direct `project/` child and looks like a
   fixture root, use that child so `findings.json` and fixture-only assets are
   not counted.
3. Otherwise, if the argument is a fixture name, resolve it from the repository
   root as `fixtures/<argument>/project`.
4. If neither path exists, stop and ask the user for a valid directory or the
   exact fixture name. Do not guess from partial matches.

When the request names a fixture but the current directory is not the repository
root, determine the repository root with `git rev-parse --show-toplevel` before
resolving `fixtures/`.

**Done when:** you have one existing source directory and can report its
resolved path.

### Step 2: Verify prerequisites

Check that `cloc` is available with `command -v cloc`. If it is missing, report
that clearly and let the user install it; do not install packages automatically.

### Step 3: Run the standard count

Run this command recursively against the resolved directory. Preserve the
exclusions unless the user explicitly asks to change them:

```bash
cloc \
  --exclude-ext=json,md,markdown,yml,yaml,svg \
  --exclude-lang=Dockerfile \
  --exclude-dir=.git,node_modules,dist,build,target \
  "<resolved-directory>"
```

Quote the directory path so names containing spaces work. Do not add
`--include-lang` unless the user explicitly asks for only particular languages.
Without that flag, `cloc` reports every recognized language remaining after the
standard exclusions.

**Done when:** `cloc` exits successfully and produces its language summary.

### Step 4: Report the estimate

Report:

1. The resolved directory that was counted.
2. The language breakdown from `cloc`.
3. The total code, comment, and blank-line counts.
4. The standard exclusions used.

Explain that the count is a physical-line estimate: comments and formatting
remain part of the reported totals, while excluded files and directories are
not counted.

**Done when:** the user has the count and enough context to reproduce it.

## Examples

User says: "cloc app-project-keystonebank"

Actions:
1. Resolve the fixture name to `fixtures/app-project-keystonebank/project`.
2. Run the standard recursive `cloc` command against that directory.
3. Report the language table, totals, and exclusions.

Result: The user receives a source-only line-count estimate for the Keystonebank
fixture.

User says: "How many lines are in ./services/payment?"

Actions:
1. Confirm `./services/payment` exists and use it directly.
2. Run the standard command with the path quoted.
3. Report the `cloc` summary.

Result: The user receives a recursive estimate for the requested directory.

User says: "Count the JS project tigerteam"

Actions:
1. Resolve `js-project-tigerteam` to `fixtures/js-project-tigerteam/project`.
2. Run the standard command without restricting languages unless the user asks
   for JavaScript only.
3. Report the result and note that JSON, Markdown, YAML, SVG, Dockerfiles,
   dependencies, and generated directories were excluded.

Result: The user receives a repeatable count for the fixture's source tree.

## Troubleshooting

Error: `cloc: command not found`

Cause: The cloc CLI is not installed or is not on `PATH`.

Solution: Tell the user to install cloc and retry. Do not silently substitute a
different counting method.

Error: `No such file or directory` or the fixture cannot be resolved

Cause: The supplied path does not exist, or the fixture name does not match an
exact directory under `fixtures/`.

Solution: Show the expected form `fixtures/<name>/project` and ask for the exact
path or fixture name.

Error: The count includes unexpected files

Cause: The command was run against a fixture root rather than its `project/`
child, or the files are not covered by the standard exclusions.

Solution: Re-resolve fixture roots to their `project/` child. If the user wants
additional exclusions, add them explicitly and state the change in the report.

Error: The user expects only JavaScript or Java

Cause: The standard command counts all recognized languages, not only one
language family.

Solution: Keep the standard command for the general estimate. For an explicitly
language-scoped request, add the appropriate `--include-lang` value and mention
that the result is scoped.
