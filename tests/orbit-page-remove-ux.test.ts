import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { extractSnapshotIndex } from "../src/indexer/extract.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import type { FileUpdate, PushResult } from "../src/types.js";
import { sha256 } from "../src/util/hash.js";

function fakeAdapter(options?: {
  pushFiles?: (projectId: string, updates: FileUpdate[]) => Promise<PushResult>;
}): FlutterFlowAdapter {
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
    async pushFiles(projectId: string, updates: FileUpdate[]) {
      if (options?.pushFiles) {
        return options.pushFiles(projectId, updates);
      }
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

async function buildOrbit(adapterOverride?: FlutterFlowAdapter) {
  const db = openOrbitDb({ dbPath: ":memory:" });
  const snapshotRepo = new SnapshotRepo(db);
  const indexRepo = new IndexRepo(db);
  const policy = new PolicyEngine();
  await policy.reload();
  const reindex = async (snapshotId: string) => {
    const files = snapshotRepo.listFiles(snapshotId, undefined, 10_000);
    const extracted = extractSnapshotIndex(
      snapshotId,
      files.map((file) => ({ fileKey: file.fileKey, yaml: file.yaml }))
    );
    indexRepo.replaceSnapshotIndices(snapshotId, extracted.symbols, extracted.edges);
  };
  const adapter = adapterOverride ?? fakeAdapter();
  const changesets = new ChangesetService(db, snapshotRepo, policy, adapter, reindex);
  const orbit = new OrbitCommandPalette(adapter, snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, orbit, reindex };
}

function seedPages(snapshotRepo: SnapshotRepo, snapshotId: string) {
  const homeYaml = "name: Home\ndescription: \"\"\nnode:\n  key: Scaffold_home\n";
  const homeTree = [
    "node:",
    "  key: Scaffold_home",
    "  children:",
    "    - key: Button_go_login"
  ].join("\n");
  const homeNode = "key: Scaffold_home\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
  const homeButton = "key: Button_go_login\ntype: Button\nprops: {}\nparameterValues: {}\n";
  const trigger = [
    "rootAction:",
    "  key: root_route",
    "  action:",
    "    navigate:",
    "      allowBack: true",
    "      isNavigateBack: false",
    "      pageNodeKeyRef:",
    "        key: Scaffold_login2",
    "    key: NAV_home_to_login2",
    "trigger:",
    "  triggerType: ON_TAP"
  ].join("\n");
  const action = [
    "navigate:",
    "  allowBack: true",
    "  isNavigateBack: false",
    "  pageNodeKeyRef:",
    "    key: Scaffold_login2",
    "key: NAV_home_to_login2"
  ].join("\n");

  const loginYaml = "name: login2\ndescription: \"\"\nnode:\n  key: Scaffold_login2\n";
  const loginTree = "node:\n  key: Scaffold_login2\n";
  const loginNode = "key: Scaffold_login2\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";

  const files = [
    { fileKey: "page/id-Scaffold_home.yaml", yaml: homeYaml },
    { fileKey: "page/id-Scaffold_home/page-widget-tree-outline.yaml", yaml: homeTree },
    { fileKey: "page/id-Scaffold_home/page-widget-tree-outline/node/id-Scaffold_home.yaml", yaml: homeNode },
    { fileKey: "page/id-Scaffold_home/page-widget-tree-outline/node/id-Button_go_login.yaml", yaml: homeButton },
    {
      fileKey: "page/id-Scaffold_home/page-widget-tree-outline/node/id-Button_go_login/trigger_actions/id-ON_TAP.yaml",
      yaml: trigger
    },
    {
      fileKey: "page/id-Scaffold_home/page-widget-tree-outline/node/id-Button_go_login/trigger_actions/id-ON_TAP/action/id-NAV_home_to_login2.yaml",
      yaml: action
    },
    { fileKey: "page/id-Scaffold_login2.yaml", yaml: loginYaml },
    { fileKey: "page/id-Scaffold_login2/page-widget-tree-outline.yaml", yaml: loginTree },
    { fileKey: "page/id-Scaffold_login2/page-widget-tree-outline/node/id-Scaffold_login2.yaml", yaml: loginNode }
  ];
  snapshotRepo.upsertFiles(
    snapshotId,
    files.map((file) => ({ fileKey: file.fileKey, yaml: file.yaml, sha256: sha256(file.yaml) }))
  );
}

describe("page remove UX", () => {
  it("preflight and remove block by default when incoming routes exist", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-remove-preflight");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const preflight = await orbit.run({
      cmd: "page.preflightDelete",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2" }
    });
    expect(preflight.ok).toBe(true);
    const p = preflight.data as { canDelete: boolean; incomingRoutesCount: number; blockingReasons: string[] };
    expect(p.canDelete).toBe(false);
    expect(p.incomingRoutesCount).toBeGreaterThan(0);
    expect(p.blockingReasons.length).toBeGreaterThan(0);

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2", apply: true, remoteValidate: false }
    });
    expect(removed.ok).toBe(true);
    const r = removed.data as { state: string; removed: boolean; blocked: boolean; mode: string; errorCode?: string };
    expect(r.state).toBe("blocked");
    expect(r.removed).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.mode).toBe("preflight-blocked");
    expect(r.errorCode).toBe("PRECHECK_BLOCKED");
    db.close();
  });

  it("returns staged state for remove preview-only runs", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-remove-staged");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2", force: true, apply: false }
    });
    expect(removed.ok).toBe(true);
    const r = removed.data as { state: string; removed: boolean; mode: string; usedSnapshotId?: string };
    expect(r.state).toBe("staged");
    expect(r.removed).toBe(false);
    expect(r.mode).toBe("hard-delete");
    expect(r.usedSnapshotId).toBe(snapshot.snapshotId);
    db.close();
  });

  it("force remove applies hard-delete path and reports explicit post-checks", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-remove-force");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2", force: true, apply: true, remoteValidate: false }
    });
    expect(removed.ok).toBe(true);
    const r = removed.data as {
      state: string;
      removed: boolean;
      mode: string;
      fallbackUsed: boolean;
      postCheck: { existsInSnapshot: boolean; existsRemotely?: boolean };
    };
    expect(r.state).toBe("applied");
    expect(r.removed).toBe(true);
    expect(r.mode).toBe("hard-delete");
    expect(r.fallbackUsed).toBe(false);
    expect(r.postCheck.existsInSnapshot).toBe(false);
    expect(r.postCheck.existsRemotely).toBe(false);

    const page = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_login2.yaml");
    expect(page?.yaml).toContain("[deleted]");
    expect(page?.yaml).toContain("login2");
    db.close();
  });

  it("falls back to archive mode when hard-delete is rejected with 400", async () => {
    const adapter = fakeAdapter({
      async pushFiles(_projectId, updates) {
        const hardDeleteAttempt = updates.some(
          (row) => row.fileKey === "page/id-Scaffold_login2.yaml" && row.yaml.includes("[deleted]")
        );
        if (hardDeleteAttempt) {
          return {
            ok: false,
            message:
              "FlutterFlow API request failed (400) | POST https://api.flutterflow.io/v2/updateProjectByYaml | details: Failed to update project: page/id-Scaffold_login2: (6:1): Unknown field name 'deleted'"
          };
        }
        return { ok: true };
      }
    });
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-remove-fallback");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2", force: true, apply: true, remoteValidate: false }
    });
    expect(removed.ok).toBe(true);
    const r = removed.data as {
      state: string;
      removed: boolean;
      mode: string;
      fallbackUsed: boolean;
      fallbackActions: string[];
    };
    expect(r.state).toBe("applied");
    expect(r.removed).toBe(false);
    expect(r.mode).toBe("archive-fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.fallbackActions.some((entry) => entry.includes("renamed page"))).toBe(true);

    const page = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_login2.yaml");
    expect(page?.yaml).toContain("name: deprecated_login2");
    db.close();
  });

  it("pins writes to fuller snapshot when requested snapshot is empty", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const full = snapshotRepo.createSnapshot("proj_1", "full");
    seedPages(snapshotRepo, full.snapshotId);
    await reindex(full.snapshotId);

    const empty = snapshotRepo.createSnapshot("proj_1", "empty");

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: empty.snapshotId,
      args: { nameOrId: "login2", force: true, apply: false }
    });
    expect(removed.ok).toBe(true);
    const data = removed.data as { snapshotId: string; usedSnapshotId?: string; requestedSnapshotId?: string };
    expect(data.snapshotId).toBe(full.snapshotId);
    expect(data.usedSnapshotId).toBe(full.snapshotId);
    expect(data.requestedSnapshotId).toBe(empty.snapshotId);
    db.close();
  });

  it("intent maps page delete/clone phrasing and accepts prompt alias", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "intent-page-ops");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const removeIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "delete page login2", apply: false }
    });
    expect(removeIntent.ok).toBe(true);
    expect((removeIntent.data as { mappedCommand?: string }).mappedCommand).toBe("page.remove");

    const cloneIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "clone page login2 as login3", apply: false }
    });
    expect(cloneIntent.ok).toBe(true);
    expect((cloneIntent.data as { mappedCommand?: string }).mappedCommand).toBe("page.clone");

    const removeIntentPrompt = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { prompt: "delete page login2", apply: false }
    });
    expect(removeIntentPrompt.ok).toBe(true);
    expect((removeIntentPrompt.data as { mappedCommand?: string }).mappedCommand).toBe("page.remove");

    db.close();
  });

  it("help includes page.delete docs and 429 failures are classified", async () => {
    const rateLimitedAdapter = fakeAdapter({
      async pushFiles() {
        return {
          ok: false,
          message:
            "FlutterFlow API request failed (429) | POST https://api.flutterflow.io/v2/updateProjectByYaml | details: Too Many Requests | rate_limit: retry later (retry-after=3s)"
        };
      }
    });
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(rateLimitedAdapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-remove-rate-limited");
    seedPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const help = await orbit.run({
      cmd: "help",
      snapshot: snapshot.snapshotId,
      args: { cmd: "page.delete" }
    });
    expect(help.ok).toBe(true);
    expect((help.data as { summary?: string }).summary).toContain("Low-level hard-delete attempt");

    const removed = await orbit.run({
      cmd: "page.remove",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2", force: true, apply: true, remoteValidate: false }
    });
    expect(removed.ok).toBe(true);
    const data = removed.data as { errorCode?: string; reason?: string; state: string };
    expect(data.state).toBe("failed");
    expect(data.errorCode).toBe("RATE_LIMITED");
    expect(data.reason).toContain("429");

    db.close();
  });
});
