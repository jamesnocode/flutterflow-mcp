import type Database from "better-sqlite3";
import type { OrbitEdge, OrbitSymbol } from "../types.js";

interface SymbolRow {
  snapshot_id: string;
  symbol_id: string;
  kind: "page" | "component" | "action" | "widget";
  name: string;
  file_key: string;
  node_path: string;
  tags_json: string;
}

interface EdgeRow {
  snapshot_id: string;
  kind: "nav" | "usage";
  from_id: string;
  to_id: string;
  file_key: string;
  metadata_json: string | null;
}

export class IndexRepo {
  constructor(private readonly db: Database.Database) {}

  replaceSnapshotIndices(snapshotId: string, symbols: OrbitSymbol[], edges: OrbitEdge[]): void {
    const clearSymbols = this.db.prepare(`DELETE FROM snapshot_symbols WHERE snapshot_id = ?`);
    const clearEdges = this.db.prepare(`DELETE FROM snapshot_edges WHERE snapshot_id = ?`);

    const insertSymbol = this.db.prepare(
      `INSERT OR IGNORE INTO snapshot_symbols
      (snapshot_id, symbol_id, kind, name, file_key, node_path, tags_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertEdge = this.db.prepare(
      `INSERT OR IGNORE INTO snapshot_edges
      (snapshot_id, kind, from_id, to_id, file_key, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      clearSymbols.run(snapshotId);
      clearEdges.run(snapshotId);

      for (const symbol of symbols) {
        insertSymbol.run(
          symbol.snapshotId,
          symbol.symbolId,
          symbol.kind,
          symbol.name,
          symbol.fileKey,
          symbol.nodePath,
          JSON.stringify(symbol.tags)
        );
      }

      for (const edge of edges) {
        insertEdge.run(
          edge.snapshotId,
          edge.kind,
          edge.fromId,
          edge.toId,
          edge.fileKey,
          edge.metadata ? JSON.stringify(edge.metadata) : null
        );
      }
    });

    tx();
  }

  findSymbols(snapshotId: string, kind: OrbitSymbol["kind"], query: string): OrbitSymbol[] {
    const rows = this.db
      .prepare(
        `SELECT snapshot_id, symbol_id, kind, name, file_key, node_path, tags_json
         FROM snapshot_symbols
         WHERE snapshot_id = ? AND kind = ? AND (name = ? OR symbol_id = ? OR name LIKE ?)
         ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, name ASC
         LIMIT 25`
      )
      .all(snapshotId, kind, query, query, `%${query}%`, query) as SymbolRow[];

    return rows.map(this.mapSymbol);
  }

  listSymbols(snapshotId: string, kind?: OrbitSymbol["kind"]): OrbitSymbol[] {
    const rows = kind
      ? ((this.db
          .prepare(
            `SELECT snapshot_id, symbol_id, kind, name, file_key, node_path, tags_json
             FROM snapshot_symbols
             WHERE snapshot_id = ? AND kind = ?
             ORDER BY name ASC`
          )
          .all(snapshotId, kind) as SymbolRow[]))
      : ((this.db
          .prepare(
            `SELECT snapshot_id, symbol_id, kind, name, file_key, node_path, tags_json
             FROM snapshot_symbols
             WHERE snapshot_id = ?
             ORDER BY kind ASC, name ASC`
          )
          .all(snapshotId) as SymbolRow[]));

    return rows.map(this.mapSymbol);
  }

  listEdges(snapshotId: string, kind?: OrbitEdge["kind"]): OrbitEdge[] {
    const rows = kind
      ? ((this.db
          .prepare(
            `SELECT snapshot_id, kind, from_id, to_id, file_key, metadata_json
             FROM snapshot_edges
             WHERE snapshot_id = ? AND kind = ?`
          )
          .all(snapshotId, kind) as EdgeRow[]))
      : ((this.db
          .prepare(
            `SELECT snapshot_id, kind, from_id, to_id, file_key, metadata_json
             FROM snapshot_edges
             WHERE snapshot_id = ?`
          )
          .all(snapshotId) as EdgeRow[]));

    return rows.map(this.mapEdge);
  }

  listOutgoingEdges(snapshotId: string, kind: OrbitEdge["kind"], fromId: string): OrbitEdge[] {
    const rows = this.db
      .prepare(
        `SELECT snapshot_id, kind, from_id, to_id, file_key, metadata_json
         FROM snapshot_edges
         WHERE snapshot_id = ? AND kind = ? AND from_id = ?`
      )
      .all(snapshotId, kind, fromId) as EdgeRow[];
    return rows.map(this.mapEdge);
  }

  listIncomingEdges(snapshotId: string, kind: OrbitEdge["kind"], toId: string): OrbitEdge[] {
    const rows = this.db
      .prepare(
        `SELECT snapshot_id, kind, from_id, to_id, file_key, metadata_json
         FROM snapshot_edges
         WHERE snapshot_id = ? AND kind = ? AND to_id = ?`
      )
      .all(snapshotId, kind, toId) as EdgeRow[];
    return rows.map(this.mapEdge);
  }

  listRoutes(snapshotId: string): Array<{ from: string; to: string; fileKey: string }> {
    const rows = this.db
      .prepare(
        `SELECT from_id, to_id, file_key
         FROM snapshot_edges
         WHERE snapshot_id = ? AND kind = 'nav'
         ORDER BY from_id ASC, to_id ASC`
      )
      .all(snapshotId) as Array<{ from_id: string; to_id: string; file_key: string }>;

    return rows.map((row) => ({
      from: row.from_id,
      to: row.to_id,
      fileKey: row.file_key
    }));
  }

  private readonly mapSymbol = (row: SymbolRow): OrbitSymbol => ({
    snapshotId: row.snapshot_id,
    symbolId: row.symbol_id,
    kind: row.kind,
    name: row.name,
    fileKey: row.file_key,
    nodePath: row.node_path,
    tags: JSON.parse(row.tags_json) as string[]
  });

  private readonly mapEdge = (row: EdgeRow): OrbitEdge => ({
    snapshotId: row.snapshot_id,
    kind: row.kind,
    fromId: row.from_id,
    toId: row.to_id,
    fileKey: row.file_key,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined
  });
}
