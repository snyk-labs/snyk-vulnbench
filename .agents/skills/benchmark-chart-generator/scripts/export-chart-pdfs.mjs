#!/usr/bin/env node

import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const svgNs = "http://www.w3.org/2000/svg";
const xmlNs = "http://www.w3.org/2000/xmlns/";

function usage() {
  console.error("Usage: node export-chart-pdfs.mjs <report-dir> [output-dir]");
  console.error("Example: node .claude/skills/benchmark-chart-generator/scripts/export-chart-pdfs.mjs public/2026-05-28-model-callouts");
}

function loadJsdom() {
  const candidates = [
    process.env.JSDOM_REQUIRE_FROM && resolve(process.env.JSDOM_REQUIRE_FROM, "package.json"),
    resolve(process.cwd(), "package.json"),
    resolve(scriptDir, "../package.json"),
    "/tmp/benchmark-chart-export-jsdom/package.json",
    "/tmp/chart-export-jsdom/package.json",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return createRequire(candidate)("jsdom");
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    [
      "Missing jsdom dependency for HTML chart rendering.",
      "Install it with one of:",
      "  npm install --prefix /tmp/benchmark-chart-export-jsdom jsdom",
      "  npm install jsdom",
      "If using a custom prefix, rerun with JSDOM_REQUIRE_FROM=/path/to/prefix.",
    ].join("\n")
  );
}

function ensureRsvgConvert() {
  const result = spawnSync("rsvg-convert", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      "Missing rsvg-convert. Install it on Debian with: sudo apt-get install -y librsvg2-bin"
    );
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function embeddedCss() {
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
    .legend-subtle { font-size: 10px; fill: #5c5c5c; }
  `;
}

function numericSvgSize(svg) {
  const viewBox = (svg.getAttribute("viewBox") || "0 0 860 360")
    .split(/\s+/)
    .map(Number);
  const width = Number(svg.getAttribute("width") || viewBox[2] || 860);
  const height = Number(svg.getAttribute("height") || viewBox[3] || 360);
  return { width, height };
}

function addText(document, group, attrs, text) {
  const node = document.createElementNS(svgNs, "text");
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  node.textContent = text;
  group.appendChild(node);
  return node;
}

function addScatterLegend(document, section, svg, oldHeight) {
  const items = [...section.querySelectorAll(".scatter-legend-item")].map((item) => ({
    index: item.querySelector(".scatter-legend-index")?.textContent.trim() || "",
    color: item.querySelector(".scatter-legend-index")?.style.background || "#4a4a4a",
    label: item.textContent.trim().replace(/\s+/g, " "),
  }));
  if (!items.length) return 0;

  const { width } = numericSvgSize(svg);
  const rows = Math.ceil(items.length / 2);
  const group = document.createElementNS(svgNs, "g");
  group.setAttribute("transform", `translate(86,${oldHeight + 6})`);
  const colWidth = (width - 130) / 2;

  items.forEach((item, index) => {
    const x = (index % 2) * colWidth;
    const y = Math.floor(index / 2) * 20;
    const circle = document.createElementNS(svgNs, "circle");
    circle.setAttribute("cx", String(x + 8));
    circle.setAttribute("cy", String(y + 8));
    circle.setAttribute("r", "8");
    circle.setAttribute("fill", item.color || "#4a4a4a");
    group.appendChild(circle);
    addText(document, group, {
      x: x + 8,
      y: y + 12,
      "text-anchor": "middle",
      "font-size": "9",
      "font-weight": "700",
      fill: "#ffffff",
    }, item.index);
    addText(document, group, {
      x: x + 22,
      y: y + 12,
      class: "legend-label",
    }, item.label);
  });

  svg.appendChild(group);
  return 26 + rows * 20;
}

function addRecallPrecisionLegend(document, section, svg, oldHeight) {
  const legend = section.querySelector(".rp-legend");
  const groups = legend ? [...legend.children] : [];
  if (!groups.length) return 0;

  const { width } = numericSvgSize(svg);
  const group = document.createElementNS(svgNs, "g");
  group.setAttribute("transform", `translate(86,${oldHeight + 8})`);
  const colWidth = Math.max(180, (width - 130) / 3);

  groups.forEach((entry, index) => {
    const x = (index % 3) * colWidth;
    const y = Math.floor(index / 3) * 38;
    const title = entry.querySelector("span")?.textContent.trim() || "";
    addText(document, group, {
      x,
      y: y + 10,
      class: "legend-label",
      "font-weight": "700",
    }, title);

    const rows = [...entry.querySelectorAll("div")].slice(0, 2);
    rows.forEach((row, rowIndex) => {
      const swatch = row.querySelector("span");
      const color = swatch?.style.background || "#4a4a4a";
      const metric = row.textContent.trim();
      const yy = y + 24 + rowIndex * 12;
      const rect = document.createElementNS(svgNs, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(yy - 7));
      rect.setAttribute("width", "22");
      rect.setAttribute("height", "6");
      rect.setAttribute("rx", "2");
      rect.setAttribute("fill", color);
      group.appendChild(rect);
      addText(document, group, {
        x: x + 28,
        y: yy,
        class: "legend-subtle",
      }, metric);
    });
  });

  svg.appendChild(group);
  return 18 + Math.ceil(groups.length / 3) * 38;
}

function prepareSvg(document, section) {
  const originalSvg = section.querySelector("svg");
  if (!originalSvg) return null;

  const svg = originalSvg.cloneNode(true);
  svg.setAttributeNS(xmlNs, "xmlns", svgNs);

  const { width, height: oldHeight } = numericSvgSize(svg);
  svg.setAttribute("width", String(width));

  const style = document.createElementNS(svgNs, "style");
  style.textContent = embeddedCss();
  svg.insertBefore(style, svg.firstChild);

  const bg = document.createElementNS(svgNs, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(oldHeight));
  bg.setAttribute("fill", "#ffffff");
  svg.insertBefore(bg, style.nextSibling);

  const addedHeight =
    addScatterLegend(document, section, svg, oldHeight) ||
    addRecallPrecisionLegend(document, section, svg, oldHeight);
  const height = oldHeight + addedHeight;
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  bg.setAttribute("height", String(height));

  return new document.defaultView.XMLSerializer().serializeToString(svg);
}

function convertSvgToPdf(svgPath, pdfPath) {
  const result = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfPath, svgPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`rsvg-convert failed for ${svgPath}: ${result.stderr || result.stdout}`);
  }
}

function readManifest(reportDir) {
  const manifestPath = resolve(reportDir, "chart-manifest.json");
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function validateCompleteExport(manifest, exported) {
  if (!manifest) return;
  const chartIds = (manifest.charts || []).map((chart) => chart.id).filter(Boolean);
  const missing = chartIds.filter((id) => !exported.has(id));
  if (!missing.length) return;
  throw new Error(
    [
      "PDF export was incomplete because some manifest charts did not render as SVG in index.html:",
      ...missing.map((id) => `  - ${id}`),
      "Add/fix renderers for these chart types so each chart has section.chart-section[data-chart-id] svg, then rerun.",
    ].join("\n")
  );
}

function updateManifest(reportDir, outputDir, exported, manifest) {
  if (!manifest) return;
  const manifestPath = resolve(reportDir, "chart-manifest.json");
  const relOutDir = relative(reportDir, outputDir).replaceAll("\\", "/") || ".";
  manifest.pdfFiguresDir = relOutDir;
  manifest.charts = (manifest.charts || []).map((chart) => {
    if (!exported.has(chart.id)) return chart;
    return {
      ...chart,
      pdfPath: `${relOutDir}/${chart.id}.pdf`,
    };
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function updateArticleVisuals(reportDir, exported, outputDir) {
  const path = resolve(reportDir, "article-visuals.md");
  if (!existsSync(path)) return;

  const relOutDir = relative(reportDir, outputDir).replaceAll("\\", "/") || ".";
  const blocks = readFileSync(path, "utf8").split(/\n(?=### FIG-)/);
  const updated = blocks.map((block) => {
    const match = block.match(/Placeholder:\s*`<!-- VISUAL: ([a-z0-9._-]+) -->`/);
    if (!match || !exported.has(match[1]) || /\nPDF:\s*`/.test(block)) return block;
    const pdfLine = `PDF: \`${relOutDir}/${match[1]}.pdf\``;
    if (/^Source: /m.test(block)) {
      return block.replace(/^(Source: .*)$/m, `$1\n${pdfLine}`);
    }
    return `${block.trimEnd()}\n\n${pdfLine}\n`;
  });

  writeFileSync(path, updated.join("\n"));
}

async function main() {
  const reportDirArg = process.argv[2];
  if (!reportDirArg || process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    process.exit(reportDirArg ? 0 : 1);
  }

  const reportDir = resolve(reportDirArg);
  const indexPath = resolve(reportDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`Missing index.html in ${reportDir}`);
  }

  ensureRsvgConvert();
  const { JSDOM } = loadJsdom();
  const outputDir = resolve(process.argv[3] || resolve(reportDir, "figures"));
  const tmpDir = resolve(reportDir, ".chart-svg-tmp");
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const html = readFileSync(indexPath, "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: `file://${indexPath}`,
  });
  await new Promise((resolveFrame) => dom.window.requestAnimationFrame(resolveFrame));

  const sections = [...dom.window.document.querySelectorAll("section.chart-section[data-chart-id]")];
  if (!sections.length) {
    throw new Error("No rendered chart sections with data-chart-id were found in index.html");
  }

  const exported = new Set();
  for (const section of sections) {
    const chartId = section.dataset.chartId;
    const svg = prepareSvg(dom.window.document, section);
    if (!chartId || !svg) continue;
    const svgPath = resolve(tmpDir, `${chartId}.svg`);
    const pdfPath = resolve(outputDir, `${chartId}.pdf`);
    writeFileSync(svgPath, svg);
    convertSvgToPdf(svgPath, pdfPath);
    exported.add(chartId);
    console.log(`Wrote ${pdfPath}`);
  }

  const manifest = readManifest(reportDir);
  validateCompleteExport(manifest, exported);
  updateManifest(reportDir, outputDir, exported, manifest);
  updateArticleVisuals(reportDir, exported, outputDir);
  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Exported ${exported.size} chart PDFs to ${outputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
