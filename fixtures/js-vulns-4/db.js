const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "todos.sqlite");
const UPLOADS_DIR = path.join(__dirname, "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function openDb() {
  ensureUploadsDir();
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      attachment_original_name TEXT,
      attachment_stored_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

module.exports = { openDb, DB_PATH, UPLOADS_DIR };
