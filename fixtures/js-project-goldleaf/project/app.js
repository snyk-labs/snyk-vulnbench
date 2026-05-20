const express = require("express");

const app = express();

app.disable("x-powered-by");
app.use(express.json());

function buildPreview(key) {
  const obj = {};
  const assignment = `obj[${JSON.stringify(key)}]=42`;

  eval(assignment);
  return obj;
}

app.post("/reports/preview", (req, res) => {
  const metricKey = req.body.metricKey || "monthlyTurnover";
  const preview = buildPreview(metricKey);

  res.json({ source: "saved-report", preview });
});

app.get("/reports/templates", (req, res) => {
  res.json({ templates: ["turnover", "shortage", "supplier-delay"] });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Goldleaf report preview service listening on ${port}`);
});
