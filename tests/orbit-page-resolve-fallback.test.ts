import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
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

describe("page resolution fallback", () => {
  it("summarize.page and page.get resolve by display name when index is empty", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "fallback-page-resolve");
    const yaml = "pageName: Onboarding\nchildren:\n  - type: widget\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_x2qdc4sq.yaml", yaml, sha256: sha256(yaml) }
    ]);

    const summary = await orbit.run({
      cmd: "summarize.page",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "Onboarding" }
    });
    expect(summary.ok).toBe(true);

    const pageGet = await orbit.run({
      cmd: "page.get",
      snapshot: snapshot.snapshotId,
      args: { pageId: "id-Scaffold_x2qdc4sq" }
    });
    expect(pageGet.ok).toBe(true);

    db.close();
  });
});
