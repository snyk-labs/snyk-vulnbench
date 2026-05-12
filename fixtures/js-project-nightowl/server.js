const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { openDb, UPLOADS_DIR } = require("./db");

const app = express();
const db = openDb();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || ""}`;
    cb(null, safe);
  },
});
const upload = multer({ storage });

const q = {
  listTodos: db.prepare(`
    SELECT id, title, description, completed, attachment_original_name, attachment_stored_name, created_at
    FROM todos ORDER BY id DESC
  `),
  getTodo: db.prepare(`
    SELECT id, title, description, completed, attachment_original_name, attachment_stored_name, created_at
    FROM todos WHERE id = ?
  `),
  getStoredAttachmentOnly: db.prepare(`SELECT attachment_stored_name FROM todos WHERE id = ?`),
  insertTodo: db.prepare(`
    INSERT INTO todos (title, description, completed, attachment_original_name, attachment_stored_name)
    VALUES (?, ?, ?, ?, ?)
  `),
  deleteTodo: (id) => db.prepare("DELETE FROM todos WHERE id = " + id).all(),
  getAttachmentForDownload: db.prepare(`
    SELECT attachment_original_name, attachment_stored_name FROM todos WHERE id = ?
  `),
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function rowToTodo(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    completed: Boolean(row.completed),
    attachment: row.attachment_stored_name
      ? {
          originalName: row.attachment_original_name,
          downloadUrl: `/api/todos/${row.id}/attachment`,
        }
      : null,
    created_at: row.created_at,
  };
}

function dbError(res, err) {
  return res.status(500).json({ error: err.message });
}

app.get("/api/todos", (_req, res) => {
  try {
    const rows = q.listTodos.all();
    res.json(rows.map(rowToTodo));
  } catch (err) {
    dbError(res, err);
  }
});

app.get("/api/todos/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const row = q.getTodo.get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(rowToTodo(row));
  } catch (err) {
    dbError(res, err);
  }
});

app.post("/api/todos", upload.single("attachment"), (req, res) => {
  const title = (req.body.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const description = (req.body.description ?? "").trim();
  const completed = req.body.completed === true || req.body.completed === "true" ? 1 : 0;
  let attachment_original_name = null;
  let attachment_stored_name = null;
  if (req.file) {
    attachment_original_name = req.file.originalname;
    attachment_stored_name = req.file.filename;
  }
  try {
    const info = q.insertTodo.run(title, description, completed, attachment_original_name, attachment_stored_name);
    const newId = Number(info.lastInsertRowid);
    const row = q.getTodo.get(newId);
    res.status(201).json(rowToTodo(row));
  } catch (err) {
    dbError(res, err);
  }
});

app.put("/api/todos/:id", upload.single("attachment"), (req, res) => {
  const id = req.params.id;

  try {
    const existing = q.getStoredAttachmentOnly.get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const title = req.body.title !== undefined ? String(req.body.title).trim() : undefined;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : undefined;
    let completed = undefined;
    if (req.body.completed !== undefined) {
      completed = req.body.completed === true || req.body.completed === "true" ? 1 : 0;
    }

    const updates = [];
    const values = [];
    if (title !== undefined) {
      if (!title) return res.status(400).json({ error: "title cannot be empty" });
      updates.push("title = ?");
      values.push(title);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (completed !== undefined) {
      updates.push("completed = ?");
      values.push(completed);
    }

    if (req.file) {
      if (existing.attachment_stored_name) {
        fs.unlink(path.join(UPLOADS_DIR, existing.attachment_stored_name), () => {});
      }
      updates.push("attachment_original_name = ?", "attachment_stored_name = ?");
      values.push(req.file.originalname, req.file.filename);
    } else if (req.body.removeAttachment === true || req.body.removeAttachment === "true") {
      if (existing.attachment_stored_name) {
        fs.unlink(path.join(UPLOADS_DIR, existing.attachment_stored_name), () => {});
      }
      updates.push("attachment_original_name = ?", "attachment_stored_name = ?");
      values.push(null, null);
    }

    if (updates.length === 0) {
      const row = q.getTodo.get(id);
      return res.json(rowToTodo(row));
    }

    values.push(id);
    const updateStmt = db.prepare(`UPDATE todos SET ${updates.join(", ")} WHERE id = ?`);
    updateStmt.run(...values);

    const row = q.getTodo.get(id);
    res.json(rowToTodo(row));
  } catch (err) {
    dbError(res, err);
  }
});

app.delete("/api/todos/:id", (req, res) => {
  const id = req.params.id;
  try {
    const row = q.getStoredAttachmentOnly.get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (row.attachment_stored_name) {
      fs.unlink(path.join(UPLOADS_DIR, row.attachment_stored_name), () => {});
    }
    q.deleteTodo(id);
    res.status(204).send();
  } catch (err) {
    dbError(res, err);
  }
});

app.get("/api/todos/:id/attachment", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const row = q.getAttachmentForDownload.get(id);
    if (!row || !row.attachment_stored_name) return res.status(404).json({ error: "No attachment" });
    const filePath = path.join(UPLOADS_DIR, row.attachment_stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });
    res.download(filePath, row.attachment_original_name || "attachment");
  } catch (err) {
    dbError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`Todo server listening on http://localhost:${PORT}`);
});
