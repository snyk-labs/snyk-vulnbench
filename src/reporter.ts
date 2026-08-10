import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { styleText } from "node:util";
import type { EvalResult, FindVulnsDetails, FixVulnsDetails, ThinkingConfig, AggregatedTaskResult, AggregatedConfigResult } from "./types.js";

// ─── Style Helpers ────────────────────────────────────────────────────────────

type Format = Parameters<typeof styleText>[0];

function s(fmt: Format, text: string): string {
  return styleText(fmt, text);
}

function scoreColor(score: number): Format {
  if (score >= 0.9) return "green";
  if (score >= 0.7) return "yellow";
  return "red";
}

function coloredScore(score: number, label?: string): string {
  const pct = `${(score * 100).toFixed(0)}%`;
  const text = label ? `${pct}  ${label}` : pct;
  return s(scoreColor(score), text);
}

function scoreWithStdDev(score: number, stdDev: number, includeStdDev: boolean): string {
  const pct = `${(score * 100).toFixed(0)}%`;
  if (!includeStdDev) return pct;
  return `${pct} ±${(stdDev * 100).toFixed(0)}pp`;
}

function durationWithStdDev(ms: number, stdDevMs: number, includeStdDev: boolean): string {
  const seconds = `${(ms / 1000).toFixed(1)}s`;
  if (!includeStdDev) return seconds;
  return `${seconds} ±${(stdDevMs / 1000).toFixed(1)}s`;
}

const LABEL_WIDTH = 12;

function metricLine(label: string, value: string, indent = "    "): string {
  return `${indent}${s("dim", label.padEnd(LABEL_WIDTH))}${s("dim", ":")}  ${value}`;
}

function formatThinking(thinking: ThinkingConfig | null): string {
  if (!thinking) return "n/a";
  if (thinking.type === "adaptive") return "adaptive";
  if (thinking.type === "disabled") return "disabled";
  return thinking.budgetTokens ? `enabled (${thinking.budgetTokens.toLocaleString()} tokens)` : "enabled";
}

// ─── Config Group Header ──────────────────────────────────────────────────────

export function printConfigHeader(configName: string, configIndex: number, totalConfigs: number): void {
  const tag = `Config: ${configName} [${configIndex}/${totalConfigs}]`;
  const rule = "━".repeat(Math.max(0, 70 - tag.length - 6));
  console.log(`\n${s(["bold", "cyan"], `━━━ ${tag} ${rule}`)}`);
}

// ─── Run Progress Header ──────────────────────────────────────────────────────

export function printRunProgress(taskName: string, runIndex: number, totalRuns: number): void {
  console.log(`\n  ${s("bold", `▸ [${runIndex}/${totalRuns}]`)} ${s("bold", taskName)}`);
}

// ─── Per-Run Result Block ─────────────────────────────────────────────────────

export function printResult(result: EvalResult): void {
  const m = result.metrics;
  const durationSec = (m.sessionDurationMs / 1000).toFixed(1);

  if (result.error) {
    console.log(metricLine("Score", s("red", "ERROR")));
    console.log(metricLine("Error", s("red", result.error)));
    console.log(metricLine("Time", `${durationSec}s`));
    return;
  }

  const isFindVulns = "recall" in result.details;
  const scoreLabel = isFindVulns ? "Score (F1)" : "Score";
  console.log(metricLine(scoreLabel, coloredScore(result.score)));

  if (result.effort) {
    const thinkingLabel = formatThinking(result.thinking);
    console.log(metricLine("Effort", `${result.effort}  ${s("dim", `(thinking: ${thinkingLabel})`)}`));
  }

  if (isFindVulns) {
    const d = result.details as FindVulnsDetails;
    const totalKnown = d.truePositives.length + d.falseNegatives.length;
    console.log(metricLine("Recall", coloredScore(d.recall, `(${d.truePositives.length}/${totalKnown} known vulns found)`)));
    console.log(metricLine("Precision", coloredScore(d.precision, `(${d.falsePositives.length} false positives)`)));
    const missedValue = d.falseNegatives.length > 0
      ? s("red", d.falseNegatives.map((v) => v.id).join(", "))
      : s("green", "none");
    console.log(metricLine("Missed", missedValue));
  } else {
    const d = result.details as FixVulnsDetails;
    console.log(metricLine("Fixed", `${d.vulnsFixed}/${d.vulnsAttempted} vulnerabilities`));
    console.log(metricLine("Notes", d.judgeNotes));
  }

  console.log(metricLine("Time", `${durationSec}s`));
  console.log(metricLine("Turns", String(m.totalTurns)));
  console.log(metricLine("Files", String(m.filesScanned.length)));

  const totalTokens = m.totalLogicalInputTokens + m.totalOutputTokens;
  if (totalTokens > 0) {
    console.log(metricLine(
      "Tokens",
      `${totalTokens.toLocaleString()} total  (in: ${m.totalLogicalInputTokens.toLocaleString()}  out: ${m.totalOutputTokens.toLocaleString()})`,
    ));
    if (m.totalCacheReadTokens > 0 || m.totalCacheCreationTokens > 0) {
      console.log(metricLine(
        "Cache",
        s("dim", `${m.totalCacheReadTokens.toLocaleString()} read + ${m.totalCacheCreationTokens.toLocaleString()} written  (${m.totalInputTokens.toLocaleString()} uncached)`),
      ));
    }
  } else {
    console.log(metricLine("Tokens", "0"));
  }

  if (m.totalCostUsd != null) {
    console.log(metricLine("Cost", `$${m.totalCostUsd.toFixed(4)}`));
  }

  const topTools = Object.entries(m.toolStats).sort((a, b) => b[1].count - a[1].count);
  if (topTools.length > 0) {
    const lines = topTools.map(([tool, stats]) => {
      const avgMs = (stats.totalDurationMs / stats.count).toFixed(0);
      return s("dim", `${tool} ${stats.count}x avg ${avgMs}ms ~${stats.totalInputTokensEst.toLocaleString()} in / ~${stats.totalOutputTokensEst.toLocaleString()} out`);
    });
    console.log(metricLine("Tools", lines[0]));
    const continuation = " ".repeat(4 + LABEL_WIDTH + 1 + 2);
    for (let i = 1; i < lines.length; i++) {
      console.log(`${continuation}${lines[i]}`);
    }
  }
}

// ─── Save Results ─────────────────────────────────────────────────────────────

export function saveResults(
  results: EvalResult[],
  outputDir: string,
  taskAggregates: AggregatedTaskResult[],
  configAggregates: AggregatedConfigResult[],
): string {
  mkdirSync(outputDir, { recursive: true });
  const filename = `benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const filepath = join(outputDir, filename);

  for (const result of results) {
    appendFileSync(filepath, JSON.stringify({ _type: "run", ...result }) + "\n");
  }
  for (const agg of taskAggregates) {
    appendFileSync(filepath, JSON.stringify({ _type: "task-aggregate", ...agg }) + "\n");
  }
  for (const agg of configAggregates) {
    appendFileSync(filepath, JSON.stringify({ _type: "config-aggregate", ...agg }) + "\n");
  }

  return filepath;
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function formatTable(header: string[], rows: string[][], leftAlignCols: Set<number>, scoreColIndex: number): void {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const fmtRow = (row: string[], colorize = false) =>
    "  " + row.map((cell, i) => {
      const padded = leftAlignCols.has(i) ? cell.padEnd(widths[i]) : cell.padStart(widths[i]);
      if (!colorize) return padded;
      if (i === scoreColIndex && cell !== "ERROR" && cell !== "-") {
        const score = parseFloat(cell) / 100;
        return s(scoreColor(score), padded);
      }
      if (cell === "ERROR") return s("red", padded);
      return padded;
    }).join("  ");

  console.log();
  console.log(fmtRow(header));
  console.log("  " + widths.map((w) => "─".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(fmtRow(row, true));
  }
}

export function printSummaryTable(
  results: EvalResult[],
  taskAggregates: AggregatedTaskResult[],
  configAggregates: AggregatedConfigResult[],
): void {
  if (results.length === 0) return;

  const hasReps = results[0].totalRepetitions > 1;
  const hasMultipleTasks = new Set(results.map((r) => r.taskId)).size > 1;

  const rule = "═".repeat(70);
  console.log(`\n${s(["bold", "cyan"], rule)}`);
  console.log(s(["bold", "cyan"], "  BENCHMARK SUMMARY"));
  console.log(s(["bold", "cyan"], rule));

  // ── Section 1: Per-fixture table (from task aggregates when reps > 1, else raw results) ──

  const hasFindVulns = taskAggregates.some((a) => a.recall != null);
  const hasCost = taskAggregates.some((a) => a.totalCostUsd != null);

  if (hasReps) {
    const repLabel = `(mean of ${results[0].totalRepetitions})`;
    console.log(`\n  ${s("dim", `Per-fixture scores ${repLabel}:`)}`);

    const header = hasFindVulns
      ? ["Task", "Config", "Score ±SD", "Recall", "Prec.", "Tokens", ...(hasCost ? ["Cost"] : []), "Time ±SD"]
      : ["Task", "Config", "Score ±SD", "Tokens", ...(hasCost ? ["Cost"] : []), "Time ±SD"];

    const rows = taskAggregates.map((a) => {
      const base = [
        a.taskId,
        a.runConfigId,
        scoreWithStdDev(a.score, a.scoreStdDev, true),
      ];
      if (hasFindVulns) {
        base.push(a.recall != null ? `${(a.recall * 100).toFixed(0)}%` : "-");
        base.push(a.precision != null ? `${(a.precision * 100).toFixed(0)}%` : "-");
      }
      base.push(Math.round(a.totalTokens).toLocaleString());
      if (hasCost) {
        base.push(a.totalCostUsd != null ? `$${a.totalCostUsd.toFixed(4)}` : "-");
      }
      base.push(durationWithStdDev(a.sessionDurationMs, a.sessionDurationStdDevMs, true));
      return base;
    });

    formatTable(header, rows, new Set([0, 1]), 2);
  } else {
    const header = hasFindVulns
      ? ["Task", "Config", "Score", "Recall", "Prec.", "Tokens", ...(hasCost ? ["Cost"] : []), "Time"]
      : ["Task", "Config", "Score", "Tokens", ...(hasCost ? ["Cost"] : []), "Time"];

    const rows = results.map((r) => {
      const m = r.metrics;
      const totalTokens = m.totalLogicalInputTokens + m.totalOutputTokens;
      const base = [
        r.taskId,
        r.runConfigId,
        r.error ? "ERROR" : `${(r.score * 100).toFixed(0)}%`,
      ];
      if (hasFindVulns) {
        const isFV = !r.error && "recall" in r.details;
        const d = isFV ? (r.details as FindVulnsDetails) : null;
        base.push(d ? `${(d.recall * 100).toFixed(0)}%` : "-");
        base.push(d ? `${(d.precision * 100).toFixed(0)}%` : "-");
      }
      base.push(totalTokens.toLocaleString());
      if (hasCost) {
        base.push(m.totalCostUsd != null ? `$${m.totalCostUsd.toFixed(4)}` : "-");
      }
      base.push(`${(m.sessionDurationMs / 1000).toFixed(1)}s`);
      return base;
    });

    formatTable(header, rows, new Set([0, 1]), 2);
  }

  // ── Section 2: Headline by config (macro-average across fixtures) ──

  if (hasMultipleTasks || hasReps) {
    const headlineLabel = hasMultipleTasks
      ? "Headline scores (macro-avg across fixtures):"
      : "Headline scores (mean across repetitions):";
    console.log(`\n  ${s(["bold", "dim"], headlineLabel)}`);

    const hdr = hasFindVulns
      ? ["Config", hasReps ? "Score ±SD" : "Score", "Recall", "Prec.", "Tokens", ...(hasCost ? ["Cost"] : []), hasReps ? "Time ±SD" : "Time", "Fixtures"]
      : ["Config", hasReps ? "Score ±SD" : "Score", "Tokens", ...(hasCost ? ["Cost"] : []), hasReps ? "Time ±SD" : "Time", "Fixtures"];

    const hRows = configAggregates.map((c) => {
      const base = [
        c.runConfigId,
        scoreWithStdDev(c.score, c.scoreStdDev, hasReps),
      ];
      if (hasFindVulns) {
        base.push(c.recall != null ? `${(c.recall * 100).toFixed(0)}%` : "-");
        base.push(c.precision != null ? `${(c.precision * 100).toFixed(0)}%` : "-");
      }
      base.push(Math.round(c.totalTokens).toLocaleString());
      if (hasCost) {
        base.push(c.totalCostUsd != null ? `$${c.totalCostUsd.toFixed(4)}` : "-");
      }
      base.push(durationWithStdDev(c.sessionDurationMs, c.sessionDurationStdDevMs, hasReps));
      base.push(String(c.fixtureCount));
      return base;
    });

    formatTable(hdr, hRows, new Set([0]), 1);

    if (configAggregates.some((config) => config.groundTruths.length > 1)) {
      console.log(`\n  ${s(["bold", "dim"], "Headline breakdown by ground truth:")}`);
      const breakdownHeader = hasFindVulns
        ? ["Config", "Ground truth", hasReps ? "Score ±SD" : "Score", "Recall", "Prec.", "Fixtures"]
        : ["Config", "Ground truth", hasReps ? "Score ±SD" : "Score", "Fixtures"];
      const breakdownRows: string[][] = [];
      for (const config of configAggregates) {
        for (const groundTruth of config.groundTruths) {
          const metrics = config.byGroundTruth[groundTruth];
          if (!metrics) continue;
          const row = [
            config.runConfigId,
            groundTruth,
            scoreWithStdDev(metrics.score, metrics.scoreStdDev, hasReps),
          ];
          if (hasFindVulns) {
            row.push(metrics.recall != null ? `${(metrics.recall * 100).toFixed(0)}%` : "-");
            row.push(metrics.precision != null ? `${(metrics.precision * 100).toFixed(0)}%` : "-");
          }
          row.push(String(metrics.fixtureCount));
          breakdownRows.push(row);
        }
      }
      formatTable(breakdownHeader, breakdownRows, new Set([0, 1]), 2);
    }
  } else {
    // Single task, single rep — just show the simple avg-by-config line like before
    const avgParts = configAggregates.map((c) =>
      `${s("dim", c.runConfigId)}  ${s(scoreColor(c.score), `${(c.score * 100).toFixed(0)}%`)}`,
    );
    if (avgParts.length > 0) {
      console.log();
      console.log(`  ${s("dim", "Avg by config:")}  ${avgParts.join(s("dim", "   |   "))}`);
    }
  }

  if (hasReps) {
    console.log(`  ${s("dim", "±SD is sample standard deviation across repetitions for score and time.")}`);
  }

  console.log();
}
