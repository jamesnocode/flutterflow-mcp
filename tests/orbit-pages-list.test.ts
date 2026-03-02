import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import type { OrbitEdge, OrbitSymbol } from "../src/types.js";
import { sha256 } from "../src/util/hash.js";

function fakeAdapter(): FlutterFlowAdapter {
  return {
    async listProjects() {
      return [];
    },
    async listFileKeys() {
      return [];
    },
    async fetchFile() {
      return "";
    },
    async pushFiles() {
      return { ok: true };
    },
    async remoteValidate() {
      return { ok: true };
    },
    async listPartitionedFileNames() {
      return { files: [] };
    },
    async fetchProjectYamls() {
      return { files: {} };
    },
    async validateProjectYaml() {
      return { ok: true };
    }
  };
}

function buildOrbit() {
  const db = openOrbitDb({ dbPath: ":memory:" });
  const snapshotRepo = new SnapshotRepo(db);
  const indexRepo = new IndexRepo(db);
  const policy = new PolicyEngine();
  const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
  const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, indexRepo, orbit };
}

describe("orbit pages.list", () => {
  it("lists pages from index when symbols exist", async () => {
    const { db, snapshotRepo, indexRepo, orbit } = buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "pages-index");

    const symbols: OrbitSymbol[] = [
      {
        snapshotId: snapshot.snapshotId,
        symbolId: "page:id_scaffold_1",
        kind: "page",
        name: "id-Scaffold_1",
        fileKey: "page/id-Scaffold_1.yaml",
        nodePath: "$",
        tags: ["page"]
      }
    ];
    const edges: OrbitEdge[] = [];
    indexRepo.replaceSnapshotIndices(snapshot.snapshotId, symbols, edges);
    const yaml = "pageName: Home\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml, sha256: sha256(yaml) }
    ]);

    const result = await orbit.run({ cmd: "pages.list", snapshot: snapshot.snapshotId });
    expect(result.ok).toBe(true);
    const data = result.data as { source: string; totalPages: number; pages: Array<{ pageId: string }> };
    expect(data.source).toBe("index");
    expect(data.totalPages).toBe(1);
    expect(data.pages[0]?.pageId).toBe("id-Scaffold_1");
    expect(data.pages[0]?.name).toBe("Home");
    db.close();
  });

  it("falls back to page file keys when page index is empty", async () => {
    const { db, snapshotRepo, orbit } = buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "pages-fallback");

    const yaml = "id: id-Scaffold_2\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_2", yaml: "pageName: Profile\n", sha256: sha256("pageName: Profile\n") },
      { fileKey: "page/id-Scaffold_2/page-widget-tree-outline.yaml", yaml: "a: b\n", sha256: sha256("a: b\n") },
      { fileKey: "page/id-Scaffold_3.yaml", yaml: "title: Settings\n", sha256: sha256("title: Settings\n") }
    ]);

    const result = await orbit.run({ cmd: "pages.list", snapshot: snapshot.snapshotId, args: { query: "scaffold" } });
    expect(result.ok).toBe(true);
    const data = result.data as { source: string; totalPages: number; pages: Array<{ pageId: string }> };
    expect(data.source).toBe("file-key-fallback");
    expect(data.totalPages).toBe(2);
    expect(data.pages.map((page) => page.pageId)).toEqual(["id-Scaffold_2", "id-Scaffold_3"]);
    expect((data.pages as Array<{ name: string }>).map((page) => page.name)).toEqual(["Profile", "Settings"]);
    db.close();
  });

  it("merges index pages with file-key-derived page ids when index is partial", async () => {
    const { db, snapshotRepo, indexRepo, orbit } = buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "pages-merged");

    const symbols: OrbitSymbol[] = [
      {
        snapshotId: snapshot.snapshotId,
        symbolId: "page:id_scaffold_1",
        kind: "page",
        name: "id-Scaffold_1",
        fileKey: "page/id-Scaffold_1.yaml",
        nodePath: "$",
        tags: ["page"]
      }
    ];
    indexRepo.replaceSnapshotIndices(snapshot.snapshotId, symbols, []);

    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: "pageName: First\n", sha256: sha256("pageName: First\n") },
      {
        fileKey: "page/id-Scaffold_2/page-widget-tree-outline/node/id-Text_a.yaml",
        yaml: "type: Text\n",
        sha256: sha256("type: Text\n")
      },
      {
        fileKey: "page/id-Scaffold_3/page-widget-tree-outline/node/id-Text_b.yaml",
        yaml: "type: Text\n",
        sha256: sha256("type: Text\n")
      }
    ]);

    const result = await orbit.run({ cmd: "pages.list", snapshot: snapshot.snapshotId });
    expect(result.ok).toBe(true);
    const data = result.data as { source: string; totalPages: number; pages: Array<{ pageId: string }> };
    expect(data.source).toBe("index+file-key-fallback");
    expect(data.totalPages).toBe(3);
    expect(data.pages.map((page) => page.pageId)).toEqual(["id-Scaffold_1", "id-Scaffold_2", "id-Scaffold_3"]);
    db.close();
  });

  it("falls back to a fuller snapshot for the same project by default", async () => {
    const { db, snapshotRepo, orbit } = buildOrbit();
    const fuller = snapshotRepo.createSnapshot("proj_1", "fuller");
    snapshotRepo.upsertFiles(fuller.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: "pageName: One\n", sha256: sha256("pageName: One\n") },
      { fileKey: "page/id-Scaffold_2.yaml", yaml: "pageName: Two\n", sha256: sha256("pageName: Two\n") },
      { fileKey: "page/id-Scaffold_3.yaml", yaml: "pageName: Three\n", sha256: sha256("pageName: Three\n") }
    ]);

    const partial = snapshotRepo.createSnapshot("proj_1", "partial");
    snapshotRepo.upsertFiles(partial.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: "pageName: One\n", sha256: sha256("pageName: One\n") }
    ]);

    const result = await orbit.run({ cmd: "pages.list", snapshot: partial.snapshotId });
    expect(result.ok).toBe(true);
    const data = result.data as {
      snapshotId: string;
      requestedSnapshotId?: string;
      totalPages: number;
      pages: Array<{ pageId: string }>;
      source: string;
    };
    expect(data.snapshotId).toBe(fuller.snapshotId);
    expect(data.requestedSnapshotId).toBe(partial.snapshotId);
    expect(data.totalPages).toBe(3);
    expect(data.pages.map((page) => page.pageId)).toEqual(["id-Scaffold_1", "id-Scaffold_2", "id-Scaffold_3"]);
    expect(data.source).toContain("best-snapshot-fallback");
    db.close();
  });

  it("respects strictSnapshot=true and does not switch snapshots", async () => {
    const { db, snapshotRepo, orbit } = buildOrbit();
    const fuller = snapshotRepo.createSnapshot("proj_1", "fuller");
    snapshotRepo.upsertFiles(fuller.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: "pageName: One\n", sha256: sha256("pageName: One\n") },
      { fileKey: "page/id-Scaffold_2.yaml", yaml: "pageName: Two\n", sha256: sha256("pageName: Two\n") }
    ]);

    const partial = snapshotRepo.createSnapshot("proj_1", "partial");
    snapshotRepo.upsertFiles(partial.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: "pageName: One\n", sha256: sha256("pageName: One\n") }
    ]);

    const result = await orbit.run({
      cmd: "pages.list",
      snapshot: partial.snapshotId,
      args: { strictSnapshot: true }
    });
    expect(result.ok).toBe(true);
    const data = result.data as { snapshotId: string; requestedSnapshotId?: string; totalPages: number };
    expect(data.snapshotId).toBe(partial.snapshotId);
    expect(data.requestedSnapshotId).toBeUndefined();
    expect(data.totalPages).toBe(1);
    db.close();
  });
});
