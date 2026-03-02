import type BetterSqlite3 from "better-sqlite3";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    refreshed_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS snapshot_files (
    snapshot_id TEXT NOT NULL,
    file_key TEXT NOT NULL,
    yaml TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, file_key),
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS snapshot_version_info (
    snapshot_id TEXT PRIMARY KEY,
    partitioner_version TEXT,
    project_schema_fingerprint TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS snapshot_symbols (
    snapshot_id TEXT NOT NULL,
    symbol_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    node_path TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, symbol_id),
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS snapshot_edges (
    snapshot_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    file_key TEXT NOT NULL,
    metadata_json TEXT,
    PRIMARY KEY (snapshot_id, kind, from_id, to_id, file_key),
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_snapshot_files_file_key
  ON snapshot_files(snapshot_id, file_key);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_snapshot_symbols_name
  ON snapshot_symbols(snapshot_id, name, kind);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_snapshot_edges_from
  ON snapshot_edges(snapshot_id, kind, from_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_snapshot_edges_to
  ON snapshot_edges(snapshot_id, kind, to_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS changesets (
    changeset_id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    title TEXT NOT NULL,
    intent TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    preview_json TEXT,
    validation_json TEXT,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS changeset_entries (
    entry_id TEXT PRIMARY KEY,
    changeset_id TEXT NOT NULL,
    file_key TEXT NOT NULL,
    patch_spec_json TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (changeset_id) REFERENCES changesets(changeset_id) ON DELETE CASCADE
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_changeset_entries_changeset
  ON changeset_entries(changeset_id, file_key);
  `
];

export function runMigrations(db: BetterSqlite3.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
}
