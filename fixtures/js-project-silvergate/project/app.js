const express = require("express");
const http = require("http");

const app = express();
const server = http.createServer();

app.disable("x-powered-by");

server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "null");
  res.setHeader("Access-Control-Allow-Credentials", true);
});

app.get("/handoff/:workspace", (req, res) => {
  const target = req.query.target;

  if (target) {
    return res.redirect(target);
  }

  return res.redirect("//" + req.params.workspace);
});

app.get("/status", (req, res) => {
  res.json({ service: "silvergate", ready: true });
});

server.on("request", app);

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Silvergate handoff service listening on ${port}`);
});
