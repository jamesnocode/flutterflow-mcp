import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";

function throwingAdapter(): FlutterFlowAdapter {
  return {
    async listProjects() {
      throw new Error("FlutterFlow API request failed (404)");
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

describe("orbit projects.list fallback", () => {
  it("returns local fallback projects when remote list fails", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, throwingAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(throwingAdapter(), snapshotRepo, indexRepo, changesets, policy);

    snapshotRepo.createSnapshot("proj_from_snapshot", "fallback");

    const result = await orbit.run({ cmd: "projects.list" });
    expect(result.ok).toBe(true);
    const data = result.data as { source: string; projects: Array<{ id: string }> };
    expect(data.source).toBe("local-fallback");
    expect(data.projects.some((project) => project.id === "proj_from_snapshot")).toBe(true);
    expect((result.warnings ?? []).some((warning) => warning.includes("Remote projects.list unavailable"))).toBe(true);

    db.close();
  });
});
