import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(new URL("../../../..", import.meta.url).pathname);
const outDir = resolve(repoRoot, "reports/vulnbench-js-1.0/arxiv/figures");
const tmpDir = resolve(repoRoot, "reports/vulnbench-js-1.0/arxiv/.figure-tmp");

const jsdomRequire = createRequire("/tmp/chart-export-jsdom/package.json");
let JSDOM;
try {
  ({ JSDOM } = jsdomRequire("jsdom"));
} catch (error) {
  throw new Error(
    "Missing jsdom. Install it with: npm install --prefix /tmp/chart-export-jsdom jsdom",
    { cause: error }
  );
}

const svgNs = "http://www.w3.org/2000/svg";
const xmlNs = "http://www.w3.org/2000/xmlns/";

const charts = [
  {
    id: "score-stability-labeled-scatter",
    source: "public/2026-05-28-llm-repeatability/index.html",
    type: "html-svg",
  },
  {
    id: "unmatched-finding-repeatability",
    source: "public/2026-05-28-llm-repeatability/index.html",
    type: "html-svg",
  },
  {
    id: "one-run-unmatched-by-model",
    source: "public/2026-05-28-model-callouts/index.html",
    type: "html-svg",
  },
  {
    id: "stable-unmatched-by-model",
    source: "public/2026-05-28-model-callouts/index.html",
    type: "html-svg",
  },
  {
    id: "stable-matched-by-model",
    source: "public/2026-05-28-model-callouts/index.html",
    type: "html-svg",
  },
  {
    id: "larger-fixture-score-by-config",
    source: "public/2026-05-28-model-callouts/index.html",
    type: "html-svg",
  },
  {
    id: "score-vs-cost-model-callouts",
    source: "public/2026-05-28-model-callouts/index.html",
    type: "html-svg",
  },
  {
    id: "reference-coverage-by-type-and-config",
    source: "public/2026-05-28-model-callouts/chart-manifest.json",
    type: "heatmap",
  },
  {
    id: "extra-reports-by-type-and-model",
    source: "public/2026-05-28-model-callouts/chart-manifest.json",
    type: "heatmap",
  },
];

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(label, maxChars = 13) {
  const words = String(label).replaceAll("/", " / ").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}

function rgbToHex(rgb) {
  return "#" + rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

function mixWithWhite(hex, alpha) {
  const rgb = hexToRgb(hex);
  return rgbToHex(rgb.map((channel) => 255 * (1 - alpha) + channel * alpha));
}

function formatValue(unit, value) {
  if (typeof value !== "number") return "--";
  if (unit === "percent") return `${(value * 100).toFixed(0)}%`;
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function css() {
  return `
    svg { font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
    .grid { stroke: #e8e8e8; stroke-width: 1; }
    .axis-x { stroke: #000000; stroke-width: 1.5; }
    .tick-label { font-size: 12px; fill: #111111; }
    .value-label { font-size: 13px; font-weight: 700; fill: #111111; }
    .y-label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; fill: #5c5c5c; }
    .error-bar { stroke: #000000; stroke-width: 1.5; stroke-linecap: round; }
    .footnote { font-size: 12px; font-style: italic; fill: #5c5c5c; }
    .legend-label { font-size: 11px; fill: #111111; }
  `;
}

function prepareSvg(document, section, svg) {
  svg.setAttributeNS(xmlNs, "xmlns", svgNs);
  const viewBox = (svg.getAttribute("viewBox") || "0 0 860 360").split(/\s+/).map(Number);
  const width = Number(svg.getAttribute("width") || viewBox[2]);
  let height = Number(svg.getAttribute("height") || viewBox[3]);

  const style = document.createElementNS(svgNs, "style");
  style.textContent = css();
  svg.insertBefore(style, svg.firstChild);

  const bg = document.createElementNS(svgNs, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#ffffff");
  svg.insertBefore(bg, style.nextSibling);

  const legendItems = [...section.querySelectorAll(".scatter-legend-item")].map((item) => ({
    index: item.querySelector(".scatter-legend-index")?.textContent.trim() || "",
    label: item.querySelector(".scatter-legend-label")?.textContent.trim() || item.textContent.trim(),
  }));

  if (legendItems.length) {
    const oldHeight = height;
    const rows = Math.ceil(legendItems.length / 2);
    height += 26 + rows * 20;
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    bg.setAttribute("height", String(height));

    const group = document.createElementNS(svgNs, "g");
    group.setAttribute("transform", `translate(86,${oldHeight + 4})`);
    const colWidth = (width - 130) / 2;
    legendItems.forEach((item, index) => {
      const x = (index % 2) * colWidth;
      const y = Math.floor(index / 2) * 20;
      const circle = document.createElementNS(svgNs, "circle");
      circle.setAttribute("cx", String(x + 8));
      circle.setAttribute("cy", String(y + 8));
      circle.setAttribute("r", "8");
      circle.setAttribute("fill", "#4a4a4a");
      group.appendChild(circle);
      const number = document.createElementNS(svgNs, "text");
      number.setAttribute("x", String(x + 8));
      number.setAttribute("y", String(y + 12));
      number.setAttribute("text-anchor", "middle");
      number.setAttribute("font-size", "9");
      number.setAttribute("font-weight", "700");
      number.setAttribute("fill", "#ffffff");
      number.textContent = item.index;
      group.appendChild(number);
      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("x", String(x + 22));
      label.setAttribute("y", String(y + 12));
      label.setAttribute("class", "legend-label");
      label.textContent = item.label;
      group.appendChild(label);
    });
    svg.appendChild(group);
  }

  return new document.defaultView.XMLSerializer().serializeToString(svg);
}

function renderHtmlSvgChart(chart) {
  const sourcePath = resolve(repoRoot, chart.source);
  const html = readFileSync(sourcePath, "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: `file://${sourcePath}`,
  });

  const section = dom.window.document.querySelector(`#chart-${chart.id}`);
  const svg = section?.querySelector("svg");
  if (!section || !svg) {
    throw new Error(`Could not find rendered SVG for ${chart.id} in ${chart.source}`);
  }
  return prepareSvg(dom.window.document, section, svg);
}

function renderHeatmap(chart) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, chart.source), "utf8"));
  const spec = manifest.charts.find((item) => item.id === chart.id);
  if (!spec) throw new Error(`Could not find heatmap spec ${chart.id}`);

  const summary = spec.dataSummary || {};
  const columns = summary.columns || [];
  const rows = summary.rows || [];
  const unit = spec.unit || summary.unit || "number";
  const maxValue = spec.maxValue || Math.max(
    ...rows.flatMap((row) => columns.map((column) => row.values?.[column.key]).filter((value) => typeof value === "number")),
    unit === "percent" ? 1 : 0.01
  );

  const left = 220;
  const top = 124;
  const cellW = columns.length > 12 ? 78 : 98;
  const cellH = 48;
  const gap = 5;
  const width = left + columns.length * cellW + 42;
  const height = top + rows.length * cellH + 44;
  const modelColor = "#4a4a4a";
  const snykColor = "#9043c6";

  const parts = [];
  parts.push(`<svg xmlns="${svgNs}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(spec.title || spec.id)}">`);
  parts.push(`<style>${css()} .hm-title{font-size:22px;font-weight:700;fill:#111}.hm-sub{font-size:13px;fill:#5c5c5c}.hm-head{font-size:11px;font-weight:700;fill:#111}.hm-row{font-size:13px;font-weight:700;fill:#111}.hm-cell{font-size:13px;font-weight:800}</style>`);
  parts.push(`<rect width="${width}" height="${height}" fill="#fff"/>`);
  parts.push(`<text x="20" y="32" class="hm-title">${escapeXml(spec.title || spec.id)}</text>`);
  parts.push(`<text x="20" y="54" class="hm-sub">${escapeXml(spec.caption || "")}</text>`);

  columns.forEach((column, c) => {
    const x = left + c * cellW + cellW / 2;
    const lines = wrapWords(column.label || column.key, columns.length > 12 ? 11 : 13);
    lines.forEach((line, i) => {
      parts.push(`<text x="${x}" y="${78 + i * 13}" text-anchor="middle" class="hm-head">${escapeXml(line)}</text>`);
    });
  });

  rows.forEach((row, r) => {
    const y = top + r * cellH;
    const rowLines = wrapWords(row.label, 24);
    rowLines.slice(0, 2).forEach((line, i) => {
      parts.push(`<text x="20" y="${y + 25 + i * 14}" class="hm-row">${escapeXml(line)}</text>`);
    });
    columns.forEach((column, c) => {
      const raw = row.values?.[column.key];
      const value = typeof raw === "number" ? raw : 0;
      const intensity = Math.max(0, Math.min(1, value / maxValue));
      const alpha = 0.08 + intensity * 0.72;
      const base = row.runConfigType === "command" ? snykColor : modelColor;
      const fill = mixWithWhite(base, alpha);
      const textColor = intensity > 0.62 ? "#ffffff" : "#111111";
      const x = left + c * cellW;
      parts.push(`<rect x="${x + gap / 2}" y="${y + gap / 2}" width="${cellW - gap}" height="${cellH - gap}" rx="8" fill="${fill}"/>`);
      parts.push(`<text x="${x + cellW / 2}" y="${y + 29}" text-anchor="middle" class="hm-cell" fill="${textColor}">${escapeXml(formatValue(unit, raw))}</text>`);
    });
  });

  parts.push("</svg>");
  return parts.join("\n");
}

function convertSvgToPdf(svgPath, pdfPath) {
  const result = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfPath, svgPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`rsvg-convert failed for ${svgPath}: ${result.stderr || result.stdout}`);
  }
}

mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

for (const chart of charts) {
  const svg = chart.type === "heatmap" ? renderHeatmap(chart) : renderHtmlSvgChart(chart);
  const svgPath = resolve(tmpDir, `${chart.id}.svg`);
  const pdfPath = resolve(outDir, `${chart.id}.pdf`);
  writeFileSync(svgPath, svg);
  convertSvgToPdf(svgPath, pdfPath);
  console.log(`Wrote ${pdfPath}`);
}
