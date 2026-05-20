const express = require("express");

const app = express();

app.disable("x-powered-by");
app.use(express.json());

app.post("/imports/profile", (req, res) => {
  const section = req.body.section || "columns";
  const key = req.body.key || "sku";
  const value = req.body.value || "Supplier SKU";
  const profile = {
    columns: {},
    defaults: {},
  };

  profile[section][key] = value;
  res.json({ profile });
});

app.get("/imports/profile", (req, res) => {
  res.json({ columns: ["sku", "name", "quantity"], defaults: { warehouse: "central" } });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Riverbend import profile service listening on ${port}`);
});
