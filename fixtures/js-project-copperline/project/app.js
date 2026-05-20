const express = require("express");
const cp = require("child_process");
const http = require("http");
const path = require("path");

const app = express();
const pluginRoot = path.join(__dirname, "plugins");

app.disable("x-powered-by");
app.use(express.json());

function shell() {
  return "sh";
}

function runInstaller(command, options) {
  return cp.spawn(shell(), ["-c", command], options);
}

app.post("/plugins/install", (req, res) => {
  const packageName = req.body.package || "@warehouse/scanner-bridge";
  const command = `npm install ${packageName} --prefix ${pluginRoot}`;
  const child = runInstaller(command, { cwd: __dirname });
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

app.get("/plugins", (req, res) => {
  res.json({ available: ["@warehouse/scanner-bridge", "@warehouse/label-sync"] });
});

const server = http.createServer(app);
const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Copperline plugin service listening on ${port}`);
});
