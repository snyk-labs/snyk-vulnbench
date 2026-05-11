---
name: benchmark-add-new-category
description: >
  Adds a new eval category to the Coding Agent Security Benchmark so tasks can be
  grouped and filtered independently via --category. Updates the EVAL_CATEGORIES
  registry, scoring dispatch, task JSON files, documentation, and verifies end-to-end
  with a dry-run. Use when the user says "add a new category", "create a category
  for X tasks", "move these tasks to their own category", "I want --category foo to
  work", or "separate the LLM tasks into their own group". Use even if the user just
  says "give these tasks their own category" without naming this skill. Do NOT use
  for adding fixtures (use benchmark-add-new-fixture), adding run configs, or running
  benchmarks.
license: MIT
compatibility: >
  Repository snyk-vulnbench (pnpm, TypeScript, tsx). Write access to src/types.ts,
  src/index.ts, evals/tasks/*.json, and docs/benchmark.md.
metadata:
  author: snyk-vulnbench
  version: 1.0.0
---

# Benchmark Add New Category

# Instructions

Add a new eval category so a set of tasks can be filtered with `--category <id>`
and scored with the appropriate pipeline. The outcome is that the new category
appears in dry-run output, tasks using it load and score correctly, and docs
reflect the change.

Categories determine three things: (1) how tasks are grouped for CLI filtering,
(2) what system/user prompts the agent receives, and (3) which scoring pipeline
runs (F1 find-vulns or LLM-judge fix-vulns). Adding a find-* category reuses the
existing F1 scorer; adding a fix-* category reuses the LLM judge scorer.

---

### Step 1: Gather requirements

Confirm with the user:

1. **Category ID** — kebab-case string used in `--category` flag (e.g. `llm-find-vulns`).
2. **Category constant name** — UPPER_SNAKE for the `EVAL_CATEGORIES` key (e.g. `LLM_FIND_VULNS`).
3. **Scoring type** — does this category use find-vulns scoring (F1 precision/recall) or fix-vulns scoring (LLM judge)? Most new categories are find-vulns variants.
4. **Which existing tasks** should move to this category (task JSON files to update).
5. **Prompt customization** — any special emphasis for the system prompt (e.g. "focus on LLM-specific risks") or whether the default find-vulns/fix-vulns prompt is fine.

**Done when:** you have the category ID, scoring type, affected tasks, and prompt direction.

---

### Step 2: Add the category to EVAL_CATEGORIES

Edit `src/types.ts`. Add a new entry to the `EVAL_CATEGORIES` object before the closing `} as const satisfies Record<string, EvalCategory>`. Each entry needs:

- `id` — the CLI-facing category ID string
- `name` — human-readable name
- `description` — one-sentence description
- `defaultSystemPrompt` — the system prompt agents receive (must include the `FINDINGS_JSON` output format block for find-* categories)
- `defaultPrompt` — the user message sent to the agent

For find-* categories, copy the `FINDINGS_JSON` format block from `FIND_VULNS` verbatim — only customize the introductory text and `defaultPrompt`. The JSON schema must stay identical so the scorer can parse it.

`EvalCategoryId` is a derived type that expands automatically — no manual update needed.

**Done when:** `src/types.ts` compiles (`npx tsc --noEmit`).

---

### Step 3: Update the scoring dispatch in src/index.ts

The scoring dispatch at ~line 99 of `src/index.ts` determines whether to call `scoreFindVulns` or `scoreFixVulns`. It uses an explicit check:

```typescript
if (task.category.id === EVAL_CATEGORIES.FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.LLM_FIND_VULNS.id || task.category.id === EVAL_CATEGORIES.APP_FIND_VULNS.id) {
```

Add your new category's constant to this condition:

- If it's a **find-* category**: append `|| task.category.id === EVAL_CATEGORIES.YOUR_CONST.id` to the find-vulns branch.
- If it's a **fix-* category**: the `else` branch already handles fix-vulns scoring, but you may also need to add it to the temp-copy check (~line 76) that gates on `EVAL_CATEGORIES.FIX_VULNS.id`.

**Done when:** `npx tsc --noEmit` passes.

---

### Step 4: Update task JSON files

For each task that should belong to the new category, edit its `evals/tasks/<task-id>.json` and change the `"category"` field from its old value to the new category ID.

**Done when:** all target task files reference the new category ID.

---

### Step 5: Update documentation

Edit `docs/benchmark.md`:

1. **Eval Categories section** (~line 172) — add a row to the Category Quick Reference table and update the Category-to-Task mapping tree.
2. **Running a Specific Combination** section (~line 1120) — add a CLI example for the new category.

**Done when:** docs reflect the new category in both the reference table and CLI examples.

---

### Step 6: Verify end-to-end

1. Run `npx tsc --noEmit` to confirm no type errors.
2. Run `npx tsx src/index.ts --category <new-id> --dry-run` to confirm:
   - The new category ID is accepted (no "Unknown category" error).
   - Only the intended tasks appear in the output.
   - Tasks show `[<new-id>]` next to their name.
3. Run `npx tsx src/index.ts --dry-run` (no filter) to confirm nothing else broke.

**Done when:** dry-run shows the correct tasks under the new category and no loader errors occur.

---

## File checklist

| Artifact | Path | Change |
|----------|------|--------|
| Category registry | `src/types.ts` → `EVAL_CATEGORIES` | Add new entry |
| Scoring dispatch | `src/index.ts` → `runEval()` | Add category to find or fix branch |
| Task descriptors | `evals/tasks/<task>-*.json` | Update `"category"` field |
| Benchmark docs | `docs/benchmark.md` | Update table, tree, CLI examples |

---

## Examples

User says: "I want a separate category for the Python tasks called python-find-vulns."

Actions:
1. Confirm: ID `python-find-vulns`, constant `PYTHON_FIND_VULNS`, find-vulns scoring, move `python-find-vulns` task.
2. Add `PYTHON_FIND_VULNS` entry to `EVAL_CATEGORIES` in `src/types.ts` with Python-focused prompt text.
3. Add `EVAL_CATEGORIES.PYTHON_FIND_VULNS.id` to the find-vulns scoring condition in `src/index.ts`.
4. Change `evals/tasks/python-find-vulns.json` category from `"find-vulns"` to `"python-find-vulns"`.
5. Update `docs/benchmark.md` category table and CLI examples.
6. Verify: `npx tsx src/index.ts --category python-find-vulns --dry-run` shows only the Python task.

Result: `--category python-find-vulns` filters to Python-only tasks; scoring works; docs are current.

---

User says: "Move the app-js tasks to their own find category."

Actions:
1. Confirm: ID `app-find-vulns`, constant `APP_FIND_VULNS`, find-vulns scoring, move `app-js-1-find-vulns`.
2. Add entry to `EVAL_CATEGORIES`, update scoring dispatch, change task JSON, update docs.
3. Verify with dry-run.

Result: `--category app-find-vulns` isolates the full-app tasks from the snippet-level JS tasks.

---

User says: "Create a fix category specifically for LLM apps."

Actions:
1. Confirm: ID `llm-fix-vulns`, constant `LLM_FIX_VULNS`, fix-vulns scoring, move `llm-vulns-1-fix-vulns` and `llm-vulns-2-fix-vulns`.
2. Add entry to `EVAL_CATEGORIES` with fix-oriented prompts.
3. Add the new category to the temp-copy condition in `src/index.ts` (line ~76) and confirm it falls into the fix-vulns scoring else-branch.
4. Update task JSONs and docs.
5. Verify with dry-run.

Result: LLM fix tasks run independently with `--category llm-fix-vulns`.

---

User says: "Can I just add a category without moving any existing tasks?"

Actions:
1. Add the category entry to `src/types.ts` and the scoring dispatch in `src/index.ts`.
2. Update docs with the new category (empty task list for now).
3. Verify it compiles and dry-run accepts the category flag (shows 0 tasks, exits with "No matching tasks found").
4. Tell the user: new tasks can reference this category in their JSON going forward.

Result: Category is registered and ready; tasks can opt in later.

---

## Troubleshooting

Error: `Unknown category "foo". Available: find-vulns, llm-find-vulns, ...`

Cause: The category ID in the task JSON or CLI flag does not match any `id` in `EVAL_CATEGORIES`.

Solution: Verify spelling matches exactly between `src/types.ts` entry `id` field and the task JSON `"category"` value. Category IDs are case-sensitive kebab-case.

---

Error: Tasks using the new category score 0 with no findings parsed.

Cause: The new category was not added to the find-vulns scoring condition in `src/index.ts`, so it falls into the fix-vulns `else` branch which expects edited files rather than JSON output.

Solution: Add the category to the explicit find-vulns condition: `task.category.id === EVAL_CATEGORIES.YOUR_CONST.id`.

---

Error: `npx tsc --noEmit` fails after adding the category.

Cause: The new entry is missing a required `EvalCategory` field (`id`, `name`, `description`, `defaultSystemPrompt`, or `defaultPrompt`), or the template literal has a syntax error.

Solution: Compare your entry shape against an existing category entry. All five fields are required by the `satisfies Record<string, EvalCategory>` constraint.

---

Error: Dry-run shows 0 tasks for the new category.

Cause: No task JSON files have `"category": "<new-id>"` yet — either the task files were not updated or the ID has a typo.

Solution: Check `evals/tasks/*.json` for the category string; it must match the `id` field in `EVAL_CATEGORIES` exactly.
