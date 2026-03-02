import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { extractSnapshotIndex } from "../src/indexer/extract.js";
import { sha256 } from "../src/util/hash.js";
import { compileSafeRegex } from "../src/util/regex.js";

describe("SQLite snapshot persistence", () => {
  it("persists snapshots and files to disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbit-store-"));
    const dbPath = path.join(dir, "orbit.sqlite");

    {
      const db = openOrbitDb({ dbPath });
      const repo = new SnapshotRepo(db);
      const snap = repo.createSnapshot("proj_1", "seed");
      const yaml = "page:\n  name: Home\n";
      repo.upsertFiles(snap.snapshotId, [{ fileKey: "lib/pages/home.yaml", yaml, sha256: sha256(yaml) }]);
      db.close();
    }

    {
      const db = openOrbitDb({ dbPath });
      const repo = new SnapshotRepo(db);
      const snapshots = repo.listSnapshots();
      expect(snapshots.length).toBe(1);
      expect(repo.countFiles(snapshots[0].snapshotId)).toBe(1);
      db.close();
    }

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Indexer graph extraction", () => {
  it("extracts nav and usage edges", () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "idx");

    const files = [
      {
        fileKey: "lib/pages/home.yaml",
        yaml: "page:\n  name: Home\n  actionType: navigate\n  targetPage: Profile\n  componentRef: UserCard\n"
      },
      {
        fileKey: "lib/components/user_card.yaml",
        yaml: "component:\n  name: UserCard\n"
      }
    ];

    const extracted = extractSnapshotIndex(snapshot.snapshotId, files);
    indexRepo.replaceSnapshotIndices(snapshot.snapshotId, extracted.symbols, extracted.edges);

    const nav = indexRepo.listEdges(snapshot.snapshotId, "nav");
    const usage = indexRepo.listEdges(snapshot.snapshotId, "usage");

    expect(nav.length).toBeGreaterThan(0);
    expect(usage.length).toBeGreaterThan(0);

    db.close();
  });

  it("handles duplicate page/component symbols and infers page symbols from file keys", () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "idx-dupes");

    const files = [
      {
        fileKey: "page/id-Scaffold_x2qdc4sq",
        yaml: "id: id-Scaffold_x2qdc4sq\nchildren:\n  - id: id-Scaffold_x2qdc4sq\n"
      },
      {
        fileKey: "component/id-Widget_abc123",
        yaml: "id: id-Widget_abc123\nchildren:\n  - id: id-Widget_abc123\n"
      }
    ];

    const extracted = extractSnapshotIndex(snapshot.snapshotId, files);
    expect(() => indexRepo.replaceSnapshotIndices(snapshot.snapshotId, extracted.symbols, extracted.edges)).not.toThrow();

    const pages = indexRepo.listSymbols(snapshot.snapshotId, "page");
    expect(pages.some((page) => page.name === "id-Scaffold_x2qdc4sq")).toBe(true);

    db.close();
  });
});

describe("Regex safety", () => {
  it("rejects unsafe nested quantifiers", () => {
    expect(() => compileSafeRegex("(a+)+$")).toThrow(/Unsafe regex/);
  });

  it("accepts normal patterns", () => {
    const re = compileSafeRegex("home.*page");
    expect(re.test("home route page")).toBe(true);
  });
});
