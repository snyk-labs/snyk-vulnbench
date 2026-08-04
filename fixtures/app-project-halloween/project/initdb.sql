--  sqlite3 database.sqlite < initdb.sql

 CREATE TABLE IF NOT EXISTS users (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   name TEXT NOT NULL,
   email TEXT NOT NULL UNIQUE,
   age INTEGER,
   role TEXT NOT NULL
 );

 INSERT INTO users (name, email, age, role) VALUES
 ('John Doe', 'john.doe@example.com', 42, 'user'),
 ('Jane Smith', 'jane.smith@example.com', 24, 'user');
