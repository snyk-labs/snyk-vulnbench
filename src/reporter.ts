import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { styleText } from "node:util";
import type { EvalResult, FindVulnsDetails, FixVulnsDetails } from "./types.js";

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

const LABEL_WIDTH = 12;

function metricLine(label: string, value: string, indent = "    "): string {
  return `${indent}${s("dim", label.padEnd(LABEL_WIDTH))}${s("dim", ":")}  ${value}`;
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
  const totalTokens = m.totalInputTokens + m.totalOutputTokens + m.totalCacheReadTokens + m.totalCacheCreationTokens;
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

  if (isFindVulns) {
    const d = result.details as FindVulnsDetails;
    const totalKnown = d.truePositives.length + d.falseNegatives.length;
    console.log(metricLine("Recall", coloredScore(d.recall, `(${d.truePositives.length}/${totalKnown} known vulns found)`)));
    console.log(metricLine("Precision", coloredScore(d.precision, `(${d.falsePositives} false positives)`)));
    const missedValue = d.falseNegatives.length > 0
      ? s("red", d.falseNegatives.join(", "))
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

  if (totalTokens > 0) {
    const cacheDetail = (m.totalCacheReadTokens > 0 || m.totalCacheCreationTokens > 0)
      ? `  cache-read: ${m.totalCacheReadTokens.toLocaleString()}  cache-write: ${m.totalCacheCreationTokens.toLocaleString()}`
      : "";
    console.log(metricLine(
      "Tokens",
      `${totalTokens.toLocaleString()}  (in: ${m.totalInputTokens.toLocaleString()}  out: ${m.totalOutputTokens.toLocaleString()}${cacheDetail})`,
    ));
  } else {
    console.log(metricLine("Tokens", "0"));
  }

  const topTools = Object.entries(m.toolStats).sort((a, b) => b[1].count - a[1].count);
  if (topTools.length > 0) {
    const parts = topTools.map(([tool, stats]) => {
      const avgMs = (stats.totalDurationMs / stats.count).toFixed(0);
      return `${tool} ${stats.count}x avg ${avgMs}ms ~${stats.totalInputTokensEst.toLocaleString()} in / ~${stats.totalOutputTokensEst.toLocaleString()} out`;
    });
    console.log(metricLine("Tools", s("dim", parts.join(" · "))));
  }
}

// ─── Save Results ─────────────────────────────────────────────────────────────

export function saveResults(results: EvalResult[], outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const filename = `benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const filepath = join(outputDir, filename);

  for (const result of results) {
    appendFileSync(filepath, JSON.stringify(result) + "\n");
  }

  return filepath;
}

// ─── Summary Table ────────────────────────────────────────────────────────────

export function printSummaryTable(results: EvalResult[]): void {
  if (results.length === 0) return;

  const rule = "═".repeat(70);
  console.log(`\n${s(["bold", "cyan"], rule)}`);
  console.log(s(["bold", "cyan"], "  BENCHMARK SUMMARY"));
  console.log(s(["bold", "cyan"], rule));

  const hasFindVulns = results.some((r) => !r.error && "recall" in r.details);

  const header = hasFindVulns
    ? ["Task", "Config", "Score", "Recall", "Prec.", "Tokens", "Time"]
    : ["Task", "Config", "Score", "Tokens", "Time"];

  const rows = results.map((r) => {
    const m = r.metrics;
    const totalTokens = m.totalInputTokens + m.totalOutputTokens + m.totalCacheReadTokens + m.totalCacheCreationTokens;
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
    base.push(`${(m.sessionDurationMs / 1000).toFixed(1)}s`);
    return base;
  });

  const leftAlignCols = new Set([0, 1]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const fmtRow = (row: string[], colorize = false) =>
    "  " + row.map((cell, i) => {
      const padded = leftAlignCols.has(i) ? cell.padEnd(widths[i]) : cell.padStart(widths[i]);
      if (!colorize) return padded;
      if (i === 2 && cell !== "ERROR" && cell !== "-") {
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

  // Per-config averages
  const configScores = new Map<string, number[]>();
  for (const r of results) {
    if (r.error) continue;
    const arr = configScores.get(r.runConfigId) ?? [];
    arr.push(r.score);
    configScores.set(r.runConfigId, arr);
  }

  if (configScores.size > 0) {
    console.log();
    const avgParts = [...configScores.entries()].map(([id, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return `${s("dim", id)}  ${s(scoreColor(avg), `${(avg * 100).toFixed(0)}%`)}`;
    });
    console.log(`  ${s("dim", "Avg by config:")}  ${avgParts.join(s("dim", "   |   "))}`);
  }

  console.log();
}
