import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export interface OrbitDbOptions {
  dbPath: string;
}

export function openOrbitDb(options: OrbitDbOptions): Database.Database {
  const db = new Database(options.dbPath);
  runMigrations(db);
  return db;
}
