#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fallbackRoot = resolve(scriptDirectory, "../../../..");
const fixturesDirectoryName = "fixtures";
const clocArguments = [
  "--json",
  "--exclude-ext=json,md,markdown,yml,yaml,svg",
  "--exclude-lang=Dockerfile",
  "--exclude-dir=.git,node_modules,dist,build,target",
];

function repositoryRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: fallbackRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return fallbackRoot;
  }
}

function display(value, fallback = "—") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value)
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>");
}

function number(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatNumber(value) {
  return number(value).toLocaleString("en-US");
}

function formatList(value) {
  if (!Array.isArray(value) || value.length === 0) return "—";
  return value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return item;
      if (item && typeof item === "object") {
        const name = item.name ?? item.id;
        if (name !== undefined) {
          return item.version ? `${name}@${item.version}` : name;
        }
      }
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .map(display)
    .join(", ");
}

function formatProvenance(metadata) {
  const provenance = metadata?.provenance;
  if (!provenance || typeof provenance !== "object") return "—";

  const parts = [];
  if (provenance.origin !== undefined) parts.push(`origin: ${provenance.origin}`);
  if (provenance.seeded !== undefined) parts.push(`seeded: ${provenance.seeded}`);
  return parts.length > 0 ? parts.map(display).join("<br>") : "—";
}

function readMetadata(fixtureRoot, fixtureName) {
  const metadataPath = join(fixtureRoot, "fixture.json");
  if (!existsSync(metadataPath)) {
    return {
      metadata: null,
      warnings: [`${fixtureName}: fixture.json is missing`],
    };
  }

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    const warnings = [];
    if (metadata.id && metadata.id !== fixtureName) {
      warnings.push(
        `${fixtureName}: fixture.json id is "${metadata.id}", not "${fixtureName}"`,
      );
    }
    return { metadata, warnings };
  } catch (error) {
    return {
      metadata: null,
      warnings: [
        `${fixtureName}: fixture.json could not be parsed (${error.message})`,
      ],
    };
  }
}

function countProject(projectPath) {
  const result = spawnSync("cloc", [...clocArguments, projectPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    return { error: result.error.message };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim() || `exit status ${result.status}`;
    return { error: detail };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    if (!parsed.SUM) throw new Error("cloc JSON did not contain a SUM record");

    const languages = Object.entries(parsed)
      .filter(([language, stats]) => language !== "header" && language !== "SUM")
      .filter(([, stats]) => stats && Number.isFinite(stats.code))
      .map(([language, stats]) => ({
        language,
        code: number(stats.code),
        files: number(stats.nFiles),
      }))
      .sort((a, b) => b.code - a.code || a.language.localeCompare(b.language));

    return {
      files: number(parsed.SUM.nFiles),
      code: number(parsed.SUM.code),
      comments: number(parsed.SUM.comment),
      blanks: number(parsed.SUM.blank),
      languages,
    };
  } catch (error) {
    return { error: `could not parse cloc output (${error.message})` };
  }
}

function languageBreakdown(languages) {
  if (!languages || languages.length === 0) return "—";
  return languages
    .map(({ language, code }) => `${display(language)}: ${formatNumber(code)}`)
    .join("<br>");
}

function selectFixtures(fixturesDirectory, selectors) {
  if (!existsSync(fixturesDirectory)) {
    throw new Error(`fixtures directory not found: ${fixturesDirectory}`);
  }

  const directories = readdirSync(fixturesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(fixturesDirectory, name, "project")))
    .sort((a, b) => a.localeCompare(b));

  if (selectors.length === 0) return directories;

  const available = new Set(directories);
  const uniqueSelectors = [...new Set(selectors)];
  const missing = uniqueSelectors.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(
      `unknown or incomplete fixture(s): ${missing.join(", ")}; expected fixtures/<name>/project`,
    );
  }
  return uniqueSelectors.sort((a, b) => a.localeCompare(b));
}

function report(rows, warnings, root) {
  const successfulRows = rows.filter((row) => !row.count.error);
  const failedRows = rows.filter((row) => row.count.error);
  const languageTotals = new Map();

  for (const row of successfulRows) {
    for (const language of row.count.languages) {
      languageTotals.set(
        language.language,
        number(languageTotals.get(language.language)) + language.code,
      );
    }
  }

  const total = successfulRows.reduce(
    (sum, row) => ({
      files: sum.files + row.count.files,
      code: sum.code + row.count.code,
      comments: sum.comments + row.count.comments,
      blanks: sum.blanks + row.count.blanks,
    }),
    { files: 0, code: 0, comments: 0, blanks: 0 },
  );

  const sortedLanguageTotals = [...languageTotals.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const generatedAt = new Date().toISOString();
  const scope = rows.length === 1 ? "fixture project" : "fixture projects";

  const lines = [
    "# Fixture project statistics",
    "",
    `Generated: ${generatedAt}`,
    `Scope: ${rows.length} ${scope} under \`${fixturesDirectoryName}/\``,
    "",
    "## Project overview",
    "",
    "| Fixture | Name | Kind | Languages | Frameworks | Runtimes | Datastores | Provenance |",
    "|---|---|---|---|---|---|---|---|",
  ];

  for (const row of rows) {
    const metadata = row.metadata;
    lines.push(
      `| ${display(row.name)} | ${display(metadata?.name)} | ${display(metadata?.kind)} | ${formatList(metadata?.languages)} | ${formatList(metadata?.frameworks)} | ${formatList(metadata?.runtimes)} | ${formatList(metadata?.datastores)} | ${formatProvenance(metadata)} |`,
    );
  }

  lines.push(
    "",
    "## Source-code size",
    "",
    "| Fixture | Source files | Code LOC | Comment LOC | Blank LOC | Language code LOC |",
    "|---|---:|---:|---:|---:|---|",
  );

  for (const row of rows) {
    const count = row.count;
    if (count.error) {
      lines.push(`| ${display(row.name)} | — | — | — | — | error |`);
      continue;
    }
    lines.push(
      `| ${display(row.name)} | ${formatNumber(count.files)} | ${formatNumber(count.code)} | ${formatNumber(count.comments)} | ${formatNumber(count.blanks)} | ${languageBreakdown(count.languages)} |`,
    );
  }

  lines.push(
    "",
    "## Totals",
    "",
    "| Projects discovered | Projects counted | Source files | Code LOC | Comment LOC | Blank LOC |",
    "|---:|---:|---:|---:|---:|---:|",
    `| ${formatNumber(rows.length)} | ${formatNumber(successfulRows.length)} | ${formatNumber(total.files)} | ${formatNumber(total.code)} | ${formatNumber(total.comments)} | ${formatNumber(total.blanks)} |`,
    "",
    "| Language | Code LOC |",
    "|---|---:|",
  );

  if (sortedLanguageTotals.length === 0) {
    lines.push("| — | — |");
  } else {
    for (const [language, code] of sortedLanguageTotals) {
      lines.push(`| ${display(language)} | ${formatNumber(code)} |`);
    }
  }

  lines.push(
    "",
    "## Notes",
    "",
    `- Counted only \`${fixturesDirectoryName}/<fixture-name>/project/\`; fixture metadata and answer keys were not counted.`,
    "- `cloc` exclusions: JSON, Markdown, YAML, and SVG extensions; Dockerfiles; `.git`; `node_modules`; `dist`; `build`; and `target`.",
    "- LOC means physical lines reported by `cloc`; code, comments, and blank lines are separate measures.",
    `- Repository root: \`${display(root)}\``,
  );

  for (const warning of warnings) lines.push(`- Warning: ${display(warning)}`);
  for (const row of failedRows) {
    lines.push(`- Count failed for \`${display(row.name)}\`: ${display(row.count.error)}`);
  }
  if (failedRows.length > 0) {
    lines.push(
      "- Totals are partial because one or more selected projects could not be counted.",
    );
  }

  return lines.join("\n");
}

function main() {
  const selectors = process.argv.slice(2).filter((argument) => argument !== "--");
  const root = repositoryRoot();
  const fixturesDirectory = join(root, fixturesDirectoryName);

  const clocProbe = spawnSync("cloc", ["--version"], {
    encoding: "utf8",
  });
  if (clocProbe.error) {
    throw new Error(
      "cloc CLI is required but was not found on PATH; install cloc and retry",
    );
  }

  const fixtureNames = selectFixtures(fixturesDirectory, selectors);
  if (fixtureNames.length === 0) {
    throw new Error("no fixture project directories found under fixtures/");
  }

  const warnings = [];
  const rows = fixtureNames.map((name) => {
    const fixtureRoot = join(fixturesDirectory, name);
    const projectPath = join(fixtureRoot, "project");
    const metadataResult = readMetadata(fixtureRoot, name);
    warnings.push(...metadataResult.warnings);
    return {
      name,
      metadata: metadataResult.metadata,
      count: countProject(projectPath),
    };
  });

  process.stdout.write(report(rows, warnings, root) + "\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
