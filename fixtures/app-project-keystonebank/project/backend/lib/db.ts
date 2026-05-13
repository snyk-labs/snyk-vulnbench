import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

let dbConn;

export function db() {
  return dbConn;
}

export async function init() {
  dbConn = await open({
    filename: 'database.db',
    driver: sqlite3.Database
  });
}

export interface DatabaseUser {
	id: string;
	username: string;
	password_hash: string;
}
