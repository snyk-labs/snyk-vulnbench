const express = require("express");
const cp = require("child_process");
const http = require("http");
const path = require("path");

const app = express();
const pluginRoot = path.join(__dirname, "plugins");

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const inventory = [
  { sku: "10042", name: "Thermal label roll", quantity: 118, aisle: "A-14" },
  { sku: "10078", name: "Packing tape", quantity: 42, aisle: "B-02" },
  { sku: "10113", name: "Pallet wrap", quantity: 17, aisle: "C-09" },
];

function getShell() {
  return "sh";
}

function execSh(command, options) {
  return cp.spawn(getShell(), ["-c", command], options);
}

function createObjectWrite(key) {
  const obj = {};
  const assignment = `obj[${JSON.stringify(key)}]=42`;

  eval(assignment);
  return obj;
}

app.get("/api/inventory", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const rows = inventory.filter((item) => item.name.toLowerCase().includes(q) || item.sku.includes(q));
  res.json({ rows });
});

app.get("/api/stock/validate", (req, res) => {
  const tainted = String(req.query.code || "");

  const regex1 = /([0-9]+)+\#/;
  const regex2 = new RegExp(/([0-9]+)+\#/);

  const regexOneMatch = regex1.test(tainted);
  const regexTwoMatch = regex2.test(tainted);
  const shelfCode = regexOneMatch || regexTwoMatch;
  res.json({ shelfCode });
});

app.post("/api/reports/preview", (req, res) => {
  const metricKey = req.body.metricKey || "items";
  const preview = createObjectWrite(metricKey);
  res.json({ preview, source: "warehouse-board" });
});

app.post("/api/imports/profile", (req, res) => {
  const section = req.body.section || "columns";
  const key = req.body.key || "sku";
  const value = req.body.value || "SKU";
  const profile = {
    columns: {},
    defaults: {},
  };

  profile[section][key] = value;
  res.json({ profile });
});

app.post("/api/plugins/install", (req, res) => {
  const packageName = req.body.package || "@stockpilot/label-printer";
  const command = `npm install ${packageName} --prefix ${pluginRoot}`;
  const child = execSh(command, { cwd: __dirname });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.on("close", (code) => {
    res.status(code === 0 ? 200 : 500).json({ package: packageName, code, output });
  });
});

app.get("/auth/continue/:workspace", (req, res) => {
  const next = req.query.next;

  if (next) {
    return res.redirect(next);
  }

  return res.redirect("//" + req.params.workspace);
});

const server = http.createServer();

server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "null");
  res.setHeader("Access-Control-Allow-Credentials", true);
});

server.on("request", app);

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`StockPilot admin listening on http://localhost:${port}`);
});
