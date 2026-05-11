const express = require("express");
const knex = require("knex")({
  client: "pg",
  connection: {
    host: "127.0.0.1",
    user: "your_database_user",
    password: "your_database_password",
    database: "myapp_test",
  },
});

const app = express();
app.use(express.json());

app.get("/users", (req, res) => {
  let userProvidedValue = req.query.id;

  knex
    .raw(`SELECT * FROM users WHERE id = ${userProvidedValue}`)
    .then((result) => {
      res.json(result.rows);
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
