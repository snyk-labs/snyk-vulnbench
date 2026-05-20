const express = require("express");
const path = require("path");

const app = express();

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));

app.get("/shelves/validate", (req, res) => {
  const code = String(req.query.code || "");

  const regex1 = /([0-9]+)+\#/;
  const regex2 = new RegExp(/([0-9]+)+\#/);

  const firstMatch = regex1.test(code);
  const secondMatch = regex2.test(code);
  res.json({ valid: firstMatch || secondMatch });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Skylark shelf validation service listening on ${port}`);
});
