---
name: benchmark-run
description: Runs security benchmark evaluations from natural language. Translates requests like "run find vulns for js 1 to 3 with opus and snyk" into the correct `tsx src/index.ts` CLI invocation with `--task`, `--config`, and `--category` flags. Use when the user says "run benchmark", "benchmark js find vulns", "evaluate with sonnet", "test js-project-shadowfox with snyk code", "run all find tasks", "dry run the benchmarks", "benchmark llm vulns with opus", or any variation asking to execute the benchmark harness. Use even if the user just says "run it" or "benchmark this" in the context of eval tasks. Do NOT use for adding new fixtures (use benchmark-add-new-fixture), writing reports (use benchmark-report-writer), or adding new categories (use benchmark-add-new-category).
license: MIT
compatibility: Repository snyk-vulnbench (pnpm, TypeScript, Node 24). Requires Claude Code CLI authenticated for model configs, Snyk CLI authenticated for snyk-code config.
metadata:
  author: snyk-vulnbench
  version: 1.0.0
---

# Benchmark Run

# Instructions

Turn a natural-language benchmark request into the exact CLI command that runs it, execute it, and report the outcome. No need to memorize task IDs or dig through `package.json`.

---

### Step 1: Discover available tasks and configs

Read these two sources to build the current inventory:

- **Task IDs** — list `evals/tasks/*.json` filenames. Each filename minus `.json` is the task ID (e.g. `js-project-tigerteam-find-vulns`).
- **Config IDs** — read `evals/run-configs.json`. Each object's `id` field is a config ID.

This step is necessary because tasks and configs change over time — never hard-code the list.

**Done when:** you have a list of valid task IDs and config IDs.

---

### Step 2: Translate the user's request into CLI arguments

Map the user's natural language to `--task`, `--config`, and `--category` flags.

**Task resolution rules:**

| User says | Resolves to |
|-----------|-------------|
| "js find vulns tigerteam" or "js-project-tigerteam find" | `--task js-project-tigerteam-find-vulns` |
| "js find vulns tigerteam, shadowfox, ironclad" | `--task js-project-tigerteam-find-vulns,js-project-shadowfox-find-vulns,js-project-ironclad-find-vulns` |
| "js fix vulns shadowfox" | `--task js-project-shadowfox-fix-vulns` |
| "llm 1 find" or "llm stardust find" | `--task llm-project-stardust-find-vulns` |
| "app keystonebank find and fix" | `--task app-project-keystonebank-find-vulns,app-project-keystonebank-fix-vulns` |
| "python find" | `--task python-project-cobalt-find-vulns` |
| "all find tasks" or "find vulns" | `--category find-vulns` (no `--task` needed) |
| "all fix tasks" | `--category fix-vulns` |
| "everything" or "all" | omit both `--task` and `--category` |

When the user specifies a numeric range like "1 to 3" or "1-3", expand it into the full comma-separated list of matching task IDs. When they say "find and fix", include both the find-vulns and fix-vulns task IDs for each fixture.

**Config resolution rules:**

| User says | Resolves to |
|-----------|-------------|
| "opus" or "opus 4.6" | `--config opus-4-6` |
| "sonnet" or "sonnet 4.6" | `--config sonnet-4-6` |
| "snyk" or "snyk code" | `--config snyk-code` |
| "opus and snyk" | `--config opus-4-6,snyk-code` |
| "all models" or "all configs" | omit `--config` (runs all) |
| (not mentioned) | omit `--config` (runs all) |

Match model names fuzzily — "claude opus", "opus-4-6", "opus 4.6", and "opus" all resolve to `opus-4-6`. If new config IDs appear in `run-configs.json` that you haven't seen before, match by substring.

**Additional flags:**

- "dry run" or "preview" → add `--dry-run`
- "skip preflight" → add `--skip-preflight`

**Done when:** you have the full `tsx src/index.ts [flags]` command string.

---

### Step 3: Confirm the command before executing

Show the user the resolved command and a brief summary of what will run (number of tasks x configs = total runs). Ask for confirmation only if the run is large (> 6 runs) or the request was ambiguous. For clear, small requests, proceed directly.

**Done when:** the user confirms, or the request was unambiguous and small.

---

### Step 4: Execute the benchmark

Run the command from the repository root:

```bash
cd /workspaces/snyk-vulnbench
pnpm tsx src/index.ts [resolved flags]
```

Use `pnpm tsx src/index.ts` directly rather than `pnpm run benchmark` so you can pass arbitrary flags without the `--` separator.

For long benchmark runs (model configs take minutes per task), run the command in the background so you can report progress. Monitor output for errors — if preflight fails, report the failing check and suggest a fix rather than re-running blindly.

**Done when:** the command exits successfully, or you've reported the error with a fix suggestion.

---

### Step 5: Report results

After the benchmark completes:

1. Read the summary table from the command output.
2. Report key metrics: score per task/config, total runs, wall time.
3. Note the results file path (printed at the end of output).

If the user wants a detailed report or writeup, suggest using the `benchmark-report-writer` skill.

**Done when:** the user has the scores and knows where the results file is.

---

## Examples

**User says:** "run find vulns for js 1 to 3 with opus"

Actions:
1. List tasks → find `js-project-tigerteam-find-vulns`, `js-project-shadowfox-find-vulns`, `js-project-ironclad-find-vulns`
2. Resolve config "opus" → `opus-4-6`
3. Run: `pnpm tsx src/index.ts --task js-project-tigerteam-find-vulns,js-project-shadowfox-find-vulns,js-project-ironclad-find-vulns --config opus-4-6`

Result: 3 find-vulns tasks run against Claude Opus 4.6, scores printed and saved to results file.

---

**User says:** "benchmark js-project-shadowfox with sonnet and snyk code"

Actions:
1. User said "js-project-shadowfox" without specifying find or fix → include both: `js-project-shadowfox-find-vulns,js-project-shadowfox-fix-vulns`
2. Resolve configs → `sonnet-4-6,snyk-code`
3. Run: `pnpm tsx src/index.ts --task js-project-shadowfox-find-vulns,js-project-shadowfox-fix-vulns --config sonnet-4-6,snyk-code`

Result: 2 tasks x 2 configs = 4 runs. Sonnet runs both find and fix; Snyk Code runs find only (command configs skip fix-vulns automatically).

---

**User says:** "dry run all find tasks"

Actions:
1. Use category filter instead of listing every task
2. Run: `pnpm tsx src/index.ts --category find-vulns --dry-run`

Result: Prints the task x config matrix without executing anything.

---

**User says:** "run the llm benchmarks with all models"

Actions:
1. List tasks → find `llm-project-stardust-find-vulns`, `llm-project-stardust-fix-vulns`, `llm-project-blackmirror-find-vulns`, `llm-project-blackmirror-fix-vulns`
2. No specific config mentioned → omit `--config` to run all
3. Run: `pnpm tsx src/index.ts --task llm-project-stardust-find-vulns,llm-project-stardust-fix-vulns,llm-project-blackmirror-find-vulns,llm-project-blackmirror-fix-vulns`

Result: 4 tasks x all configs. Scores and results saved.

---

**User says:** "run it" (in context of discussing js-project-purplehaze)

Actions:
1. Infer from conversation context that the user means js-project-purplehaze
2. Include both find and fix: `js-project-purplehaze-find-vulns,js-project-purplehaze-fix-vulns`
3. No config specified → run all
4. Run: `pnpm tsx src/index.ts --task js-project-purplehaze-find-vulns,js-project-purplehaze-fix-vulns`

Result: Benchmark runs for js-project-purplehaze across all configured models and tools.

---

## Troubleshooting

Error: `No matching tasks found. Available: ...`
Cause: The `--task` value doesn't match any task ID in `evals/tasks/`. Likely a typo or stale ID.
Solution: Re-read `evals/tasks/` filenames and match against the user's request again. Show the user the available IDs.

---

Error: `No matching configs found for "...". Available: ...`
Cause: The `--config` value doesn't match any config ID in `evals/run-configs.json`.
Solution: Re-read `evals/run-configs.json` and use the correct `id` values. Show the user available config IDs.

---

Error: `Preflight failed: N check(s) need attention`
Cause: Claude Code CLI or Snyk CLI is not installed or not authenticated.
Solution: Read the preflight output for which check failed. For Claude: run `claude auth login` or set `ANTHROPIC_API_KEY`. For Snyk: run `snyk auth` or `snyk config set api=<TOKEN>`. Alternatively, add `--skip-preflight` if the user wants to bypass checks.

---

Error: `Failed to read vulns.json for fixture "..."`
Cause: A task references a fixture that doesn't have a corresponding `fixtures/<name>.json` ground-truth file.
Solution: This is a fixture setup issue, not a run issue. Suggest using the `benchmark-add-new-fixture` skill to wire up the missing fixture.

---

Error: Command hangs or takes unexpectedly long
Cause: Model-based configs (opus, sonnet) run Claude Code as a subprocess per task. Each task can take 1-5 minutes depending on fixture complexity and model speed.
Solution: This is normal. A 5-task x 2-config matrix can take 10-50 minutes. Use `--dry-run` first to preview, and consider running fewer tasks or configs to iterate faster.
