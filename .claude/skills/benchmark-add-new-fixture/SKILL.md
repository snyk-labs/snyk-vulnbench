---
name: benchmark-add-new-fixture
description: Adds a new vulnerable-code fixture to the Coding Agent Security Benchmark (snyk-vulnbench): ground-truth JSON, eval tasks, Snyk Code SARIF capture, mapRuleId updates, optional new VulnTypes, and verification. Use when adding or onboarding a new directory under fixtures/, wiring benchmark metadata, aligning Snyk ruleId to VulnType, or phrases like "add a new benchmark fixture", "register this app as a vuln fixture", "ground truth for fixtures/foo", "map new Snyk rules", "create eval task for my vulnerable repo". Use even if the user only says "benchmark this codebase" or "add this project as an eval" in this repo. Do NOT use for generic security audits outside this benchmark layout, for publishing benchmark reports (use benchmark-report-writer), or for running a full benchmark matrix without adding fixture files.
license: MIT
compatibility: Repository snyk-vulnbench (pnpm, TypeScript). Requires Snyk CLI authenticated for `snyk code test` when capturing SARIF. Write access under fixtures/, evals/tasks/, src/parsers/snyk-code.ts, src/types.ts, src/scorer.ts, and docs/benchmark-management.md as needed.
metadata:
  author: snyk-vulnbench
  version: 1.0.0
---

# Benchmark Add New Fixture

# Instructions

Drive a new benchmark fixture from an empty or existing `fixtures/<name>/` tree through a complete, scoreable setup: SARIF-backed ground truth, Snyk parser alignment, eval tasks, and verification. The outcome is that `pnpm run benchmark` (once the rest of the task matrix loads) can run find-vulns and fix-vulns against the fixture and `snyk-code` command configs produce findings that match ground truth types.

**Principles (read before executing):**

- Ground truth lives in **`fixtures/<fixture-name>.json`** (sibling of **`fixtures/<fixture-name>/`**), never inside the fixture cwd — the agent must not read the answer key. See `docs/benchmark-management.md` and `docs/benchmark.md` (Snyk / scoring sections).
- Find-vulns scoring matches findings to known vulns **by `VulnType` only**, in a **greedy order**: iterate parsed findings in array order; each finding consumes the **first unmatched** ground-truth row with the same `type`. Therefore **`vulnerabilities[]` order should mirror `snyk code test` `results[]` order** whenever multiple rows share a type (e.g. two `hardcoded-credentials`, two `other` or two of any same type).
- Snyk maps SARIF **`results[].ruleId`** (e.g. `javascript/TooPermissiveCorsHeader`) to benchmark `type` via **`mapRuleId()`** in **`src/parsers/snyk-code.ts`**. Driver metadata in **`runs[0].tool.driver.rules`** (`id`, `name`, `shortDescription.text`, `properties.cwe`) names the vulnerability class — use it to pick or add `VulnType` strings and regex patterns.

Read **`docs/benchmark-management.md`** (Adding a New Eval Task, Ground-Truth JSON, Updating When You Add a New Vulnerability Type, Maintaining Snyk Code ruleId mappings) and **`docs/benchmark.md`** (Command configs and Snyk Code, How Vuln Type Matching Works) before editing if you are unsure of field shapes or scoring behavior.

---

### Step 1: Prepare — fixture identity and paths

1. Confirm the fixture directory name **`<fixture-name>`** (e.g. `app-js-1`) — it must match **`evals/tasks/*.json`** `fixture` field and the sibling file **`fixtures/<fixture-name>.json`**.
2. Confirm vulnerable code lives under **`fixtures/<fixture-name>/`** and that no ground-truth secrets are only in prose you will not encode in JSON.
3. List globally unique **`id`** prefixes for each vulnerability row (e.g. `app1-…`) so they do not collide with other `fixtures/*.json` files.

**Done when:** `<fixture-name>` is fixed and you know the repo root (benchmark project root).

---

### Step 2: Capture SARIF from Snyk Code (source of truth)

Run Snyk from the **benchmark repo root** so paths and `cwd` match how the benchmark invokes the CLI. Write JSON to a **throwaway path** (e.g. `/tmp`) with a unique name so you never commit scan output by mistake.

**Command template** (replace `<fixture-name>`; keep `--include-ignores` only if you intentionally want ignored paths in scope):

```bash
cd /path/to/snyk-vulnbench
snyk code test "fixtures/<fixture-name>/" --include-ignores --json --json-file-output="/tmp/snyk-<fixture-name>-$RANDOM.json"
```

**Extract machine-readable fields without reading megabytes into chat:**

- Distinct **`ruleId`** values: e.g. `jq -r '.runs[0].results[]? | .ruleId' /tmp/....json | sort -u`
- **Per-finding order** (for ground-truth ordering): `ruleId`, primary location `uri`, `startLine` from `results[].locations[0].physicalLocation`.
- For each distinct `ruleId`, open **`runs[0].tool.driver.rules[]`** entry with the same **`id`** as the result’s `ruleIndex` / `ruleId` and note **`shortDescription.text`**, **`name`**, and **`properties.cwe`** when choosing a `VulnType` label.

**Done when:** you have a SARIF JSON file path and a ordered list of findings (`ruleId` + file + line) matching what the benchmark parser will emit.

---

### Step 3: Map Snyk ruleId → `VulnType`

1. For each distinct lowercase **`ruleId`** string, trace through **`mapRuleId()`** in **`src/parsers/snyk-code.ts`**. If no branch matches, the parser yields **`"other"`**, which usually **will not** match specialized ground-truth types (`vulnTypesMatch` is strict).
2. **Existing type, new Snyk id:** extend **`mapRuleId()`** with a regex (and a one-line comment naming the canonical `ruleId`). Order branches so **specific** patterns run before **broad** ones (e.g. `domxss` before `xss`; avoid accidental substring matches like `csrf` inside unrelated tokens — the codebase already orders some rules deliberately).
3. **New vulnerability class:** add a **`VulnType`** literal to **`src/types.ts`**, extend **`normalizeVulnType`** in **`src/scorer.ts`** with human / model aliases, extend **`mapRuleId()`**, and add a row to the **Valid `type` values** table in **`docs/benchmark-management.md`**. Update the find-vulns default prompt example in **`src/types.ts`** if it lists types explicitly.

**Done when:** every `ruleId` you care about maps to the `type` strings you will put in ground truth, or you consciously map to `"other"` with matching ground-truth `"type": "other"` rows.

---

### Step 4: Author `fixtures/<fixture-name>.json`

1. Create **`fixtures/<fixture-name>.json`** with top-level **`description`**, **`vulnerabilities`** array, and **`_note`** pointing at `docs/benchmark-management.md#updating-when-you-add-a-new-vulnerability-type` (copy pattern from an existing `fixtures/*.json`).
2. Each element: **`id`** (globally unique), **`type`** (`VulnType`), **`severity`**, **`file`** (relative to fixture root, POSIX separators), **`line`** (align with SARIF primary `startLine` when possible), **`description`** (human-readable; cite Snyk `ruleId` / CWE when helpful for maintainers).
3. **Sort `vulnerabilities` in the same order as `runs[0].results`** from Step 2 whenever two entries could compete for the same `type` under greedy matching.

**Done when:** JSON validates and loader can read it (`vulnerabilities` is an array of objects with required fields).

---

### Step 5: Add eval tasks

1. Add **`evals/tasks/<fixture-name>-find-vulns.json`** with `id`, `name`, **`category`: `"find-vulns"`**, **`fixture`**: `"<fixture-name>"`, optional **`maxTurns`**.
2. Add **`evals/tasks/<fixture-name>-fix-vulns.json`** similarly with **`category`: `"fix-vulns"`** if the fixture is meant for fix runs (higher `maxTurns` is common for edits).
3. No loader code change — task files are scanned automatically.

**Done when:** both JSON files parse and reference the correct `fixture` string.

---

### Step 6: Verify end-to-end

1. **Loader:** `pnpm run benchmark -- --dry-run` must list the new tasks (if the repo’s full task set currently fails loading, fix unrelated missing `fixtures/*.json` first, or temporarily validate by importing `loadEvalTasks` in a small `tsx` script).
2. **Snyk parity:** Pipe the SARIF file through the same path as the harness: `parseSnykCodeOutput` → build synthetic `FINDINGS_JSON` (see **`src/command-runner.ts`**) → **`scoreFindVulns`** with `knownVulns` loaded from your new JSON. Expect **recall 1.0** and **no false negatives** when ordering and types align.
3. Optionally run **`pnpm run benchmark -- --task <fixture-name>-find-vulns --config snyk-code`** if CLI auth is available.

**Done when:** types and order match Snyk output and documentation is updated for any new `VulnType`.

---

## File checklist (quick reference)

| Artifact | Path |
|----------|------|
| Vulnerable tree | `fixtures/<fixture-name>/` |
| Ground truth | `fixtures/<fixture-name>.json` |
| Find task | `evals/tasks/<fixture-name>-find-vulns.json` |
| Fix task | `evals/tasks/<fixture-name>-fix-vulns.json` |
| Snyk rule → type | `src/parsers/snyk-code.ts` → `mapRuleId()` |
| New type + prompt list | `src/types.ts` → `VulnType` + `EVAL_CATEGORIES.FIND_VULNS` default prompt if needed |
| Agent phrase aliases | `src/scorer.ts` → `normalizeVulnType` |
| Doc table + workflow | `docs/benchmark-management.md` |

---

## Examples

**User says:** "I added `fixtures/payment-api/` — wire it into the benchmark."

**Actions:**

1. Set `<fixture-name>` to `payment-api`; confirm `fixtures/payment-api.json` is missing and create the plan.
2. Run `snyk code test "fixtures/payment-api/" --include-ignores --json --json-file-output="/tmp/snyk-payment-api-$RANDOM.json"`.
3. List `results[]` order and each `ruleId` + uri + line; check `driver.rules` for CWE / short names.
4. Update `mapRuleId` for any new `ruleId` strings; add `VulnType` + scorer aliases + docs table row only if the class is new to the benchmark.
5. Write `fixtures/payment-api.json` with `vulnerabilities` ordered like SARIF `results`.
6. Add `evals/tasks/payment-api-find-vulns.json` and `payment-api-fix-vulns.json`.
7. Verify with `parseSnykCodeOutput` + `scoreFindVulns` (or full dry-run).

**Result:** New fixture is registered, Snyk-aligned, and ready for matrix runs.

---

**User says:** "Snyk reports `javascript/FooBar` but our ground truth says `sql-injection` and recall is zero."

**Actions:**

1. Lowercase rule id: `javascript/foobar`; find whether `mapRuleId` returns `"other"` or wrong type.
2. Add or fix a regex branch in `mapRuleId` (and comment the Snyk id). If `FooBar` is a new class, add `VulnType` and scorer aliases instead of overloading `sql-injection`.
3. Re-run SARIF → parser → scorer check.

**Result:** Snyk findings type-align with ground truth; recall improves.

---

**User says:** "Two XSS findings but only one hits in scoring."

**Actions:**

1. Confirm ground truth has two rows with `type: "xss"` and distinct `id`s.
2. Compare order of those two rows to order of `xss` findings in Snyk `results[]` (greedy pairing is order-based, not line-based).
3. Reorder `vulnerabilities` to match Snyk emission order for stable pairing.

**Result:** Both XSS rows can match without changing the scorer.

---

**User says:** "Add prototype pollution as a first-class type."

**Actions:**

1. Add `"prototype-pollution"` to `VulnType` in `src/types.ts` and the default find-vulns prompt example string.
2. Add `normalizeVulnType` aliases (`prototype pollution`, etc.).
3. Map `javascript/PrototypePollution` in `mapRuleId` to `prototype-pollution`.
4. Document the type in `docs/benchmark-management.md` valid-types table.

**Result:** Ground truth and agents can use a dedicated type instead of `"other"`.

---

**User says:** "Do everything except commit the SARIF file."

**Actions:**

1. Keep SARIF only under `/tmp/...` or `.gitignore`d paths; never add `*-results.json` under `fixtures/` unless the repo explicitly wants checked-in golden SARIF (rare — large and churny).

**Result:** Repository stays lean; ground truth remains the curated `fixtures/<name>.json`.

---

## Troubleshooting

**Error:** `Failed to read vulns.json for fixture "foo"` when running the benchmark.

**Cause:** Missing or misnamed **`fixtures/foo.json`**, or task `fixture` field does not match directory name.

**Solution:** Ensure **`fixtures/<fixture-name>.json`** exists as a **sibling** of **`fixtures/<fixture-name>/`**, and task JSON `fixture` equals the directory basename exactly.

---

**Error:** Snyk recall is low but the CLI clearly lists the issues.

**Cause:** `mapRuleId` returns `"other"` or a `type` that does not match your ground-truth `type` strings; or `vulnerabilities` order does not match Snyk `results` order for duplicate types.

**Solution:** Follow Step 3 and Step 4 ordering rules; verify with `jq` on SARIF and a small `tsx` script calling `parseSnykCodeOutput` + `scoreFindVulns`.

---

**Error:** `Unknown parser "..."` when using a new command config.

**Cause:** `evals/run-configs.json` references a `parser` key not registered in **`src/parsers/index.ts`**.

**Solution:** Implement `(stdout: string) => FindingRecord[]` and register the key — or use `"snyk-code"` for Snyk SARIF stdout.

---

**Error:** Agent findings never match a new type string in ground truth.

**Cause:** Typo in JSON `type`, or value missing from `VulnType` / `normalizeVulnType`.

**Solution:** Align spelling with `src/types.ts`; add aliases for common model phrasings in `normalizeVulnType`.

---

## Optional: iterate with the official skill creator

For a brand-new skill unrelated to this repo, the official Claude **skill creator** plugin (see `skill-creator-extra` Phase 1) drafts and tests SKILL files. This **`benchmark-add-new-fixture`** skill is already tailored to snyk-vulnbench; use the plugin only if you are forking the workflow for another repository or want automated eval loops on the skill text itself.
