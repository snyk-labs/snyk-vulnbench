/**
 * Open the activity heatmap and the last-7-days chart as the member who
 * logged time, and record whether the project-name HTML runs.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(join(here, "evidence", "state.json"), "utf8"));
const require = createRequire(import.meta.url);
const playwrightCore =
  process.env.PLAYWRIGHT_CORE ||
  "/home/node/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core";
const { chromium } = require(playwrightCore);
const chromePath =
  process.env.CHROME_PATH ||
  "/home/node/.cache/ms-playwright/chromium-1234/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const dialogs = [];
const consoleMessages = [];
page.on("dialog", async (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  await dialog.dismiss();
});
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  consoleMessages.push(`pageerror: ${error.message}`);
});

await page.goto(`${state.base}/login/`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="username"]', state.member);
await page.fill('input[name="password"]', state.password);
await page.click('button[type="submit"], input[type="submit"]');
await page.waitForLoadState("domcontentloaded");

const today = new Date();
const todayStamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
const apiProbe = await page.evaluate(async (stamp) => {
  const activity = await fetch(`/timelog/api/activity/?user=${document.body.dataset.user || ""}`).then((response) => response.text());
  const day = await fetch(`/timelog/api/${stamp}`).then((response) => response.text());
  return {
    activity: activity.slice(0, 500),
    day: day.slice(0, 800),
  };
}, todayStamp);

await page.goto(`${state.base}/timelog/activity/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#cal-heatmap svg", { timeout: 15000 });
await page.waitForTimeout(1500);
const cellInfo = await page.evaluate(() =>
  [...document.querySelectorAll("#cal-heatmap rect, #cal-heatmap .graph-rect")].map((rect, index) => ({
    index,
    fill: rect.getAttribute("fill") || "",
    title: rect.getAttribute("title") || rect.querySelector("title")?.textContent || "",
    width: Number(rect.getAttribute("width") || 0),
  })),
);
const todayCell = await page.evaluate((stamp) => {
  const rects = [...document.querySelectorAll("#cal-heatmap rect.graph-rect")];
  const describe = (rect) => {
    const raw = rect.__data__ && rect.__data__.t;
    if (raw == null) return null;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    return {
      raw,
      key: `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`,
    };
  };
  const index = rects.findIndex((rect) => describe(rect)?.key === stamp);
  return {
    count: rects.length,
    index,
    sample: rects.slice(0, 2).map(describe),
    matched: index >= 0 ? describe(rects[index]) : null,
  };
}, todayStamp);
let heatmap = { cells: cellInfo.length, apiProbe, todayCell, dialogs: 0, img: null };
if (todayCell.index >= 0) {
  const before = dialogs.length;
  await page.locator("#cal-heatmap rect.graph-rect").nth(todayCell.index).click({ force: true });
  await page.waitForTimeout(800);
  heatmap = {
    ...heatmap,
    dialogs: dialogs.slice(before),
    placeholder: await page.evaluate(() => document.querySelector("#onClick-placeholder")?.innerHTML || ""),
    img: await page.evaluate(() => {
      const node = document.querySelector("#onClick-placeholder img");
      return node ? { onerror: node.getAttribute("onerror"), html: node.outerHTML } : null;
    }),
  };
}

await page.goto(`${state.base}/timelog/lastweek/?project=${state.project}`, {
  waitUntil: "domcontentloaded",
});
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await page.waitForTimeout(1000);
const rects = page.locator("#chart_last_seven rect, svg rect");
const rectCount = await rects.count();
let chart = { rects: rectCount };
if (rectCount > 0) {
  const before = dialogs.length;
  const box = await rects.first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 8));
    await page.waitForTimeout(500);
  }
  chart = {
    rects: rectCount,
    dialogs: dialogs.slice(before),
    tooltip: await page.evaluate(() => {
      const tip = document.querySelector(".ch-tooltip");
      const img = tip?.querySelector("img");
      return {
        html: tip?.innerHTML || null,
        onerror: img?.getAttribute("onerror") || null,
      };
    }),
  };
}

const ran = dialogs.some((dialog) => dialog.message === "1");
const result = {
  reproduced: ran ? "yes" : "no",
  state: { member: state.member, project: state.project, issue: state.issue },
  heatmap,
  chart,
  dialogs,
  consoleMessages,
};
writeFileSync(join(here, "evidence", "browser.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ reproduced: result.reproduced, dialogs, heatmapHit: Boolean(heatmap.dialogs), chartHit: Boolean(chart.dialogs?.length) }, null, 2));
await browser.close();
if (!ran) process.exit(1);
