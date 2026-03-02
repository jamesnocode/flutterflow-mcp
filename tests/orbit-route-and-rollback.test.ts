import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { extractSnapshotIndex } from "../src/indexer/extract.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import type { FileKeyEntry, FileUpdate, ProjectSummary, ProjectVersionInfo, PushResult } from "../src/types.js";
import { sha256 } from "../src/util/hash.js";

class MemoryAdapter implements FlutterFlowAdapter {
  private readonly projects: ProjectSummary[] = [{ id: "proj_1", name: "proj_1" }];
  private readonly remoteFiles = new Map<string, string>();
  private versionInfo: ProjectVersionInfo | undefined = {
    partitionerVersion: "7",
    projectSchemaFingerprint: "fp_1"
  };

  seedRemote(files: Record<string, string>, versionInfo?: ProjectVersionInfo): void {
    this.remoteFiles.clear();
    for (const [fileKey, yaml] of Object.entries(files)) {
      this.remoteFiles.set(fileKey, yaml);
    }
    if (versionInfo) {
      this.versionInfo = versionInfo;
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.projects;
  }

  async listFileKeys(): Promise<FileKeyEntry[]> {
    return [...this.remoteFiles.keys()].map((fileKey) => ({ fileKey, hash: sha256(this.remoteFiles.get(fileKey) ?? "") }));
  }

  async fetchFile(_projectId: string, fileKey: string): Promise<string> {
    return this.remoteFiles.get(fileKey) ?? "";
  }

  async pushFiles(_projectId: string, updates: FileUpdate[]): Promise<PushResult> {
    for (const update of updates) {
      this.remoteFiles.set(update.fileKey, update.yaml);
    }
    return { ok: true };
  }

  async remoteValidate(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }

  async listPartitionedFileNames(): Promise<{ files: FileKeyEntry[]; versionInfo?: ProjectVersionInfo }> {
    return {
      files: [...this.remoteFiles.keys()].map((fileKey) => ({ fileKey, hash: sha256(this.remoteFiles.get(fileKey) ?? "") })),
      versionInfo: this.versionInfo
    };
  }

  async fetchProjectYamls(): Promise<{ files: Record<string, string>; versionInfo?: ProjectVersionInfo }> {
    const files: Record<string, string> = {};
    for (const [fileKey, yaml] of this.remoteFiles.entries()) {
      files[fileKey] = yaml;
    }
    return { files, versionInfo: this.versionInfo };
  }

  async validateProjectYaml(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }
}

async function buildOrbit(adapter = new MemoryAdapter()) {
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
  const changesets = new ChangesetService(db, snapshotRepo, policy, adapter, reindex);
  const orbit = new OrbitCommandPalette(adapter, snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, indexRepo, orbit, reindex, adapter };
}

function seedProject(snapshotRepo: SnapshotRepo, snapshotId: string, options?: { missingTarget?: boolean; orphanAction?: boolean }) {
  const loginPageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
  const loginTreeYaml = [
    "node:",
    "  key: Scaffold_xkz5zwqw",
    "  children:",
    "    - key: Column_parent",
    "      children:",
    "        - key: Text_a",
    "        - key: Text_b",
    "        - key: Text_c",
    "        - key: Button_b",
    "        - key: Row_wrap",
    "          children:",
    "            - key: Text_wrapped"
  ].join("\n");

  const loginNode = "key: Scaffold_xkz5zwqw\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
  const columnNode = "key: Column_parent\ntype: Column\nprops: {}\nparameterValues: {}\n";
  const textA = [
    "key: Text_a",
    "type: Text",
    "name: BrandText",
    "props:",
    "  text:",
    "    textValue:",
    "      inputValue: brand.ai",
    "      mostRecentInputValue: brand.ai",
    "parameterValues: {}"
  ].join("\n");
  const textB = [
    "key: Text_b",
    "type: Text",
    "name: Subtitle",
    "props:",
    "  text:",
    "    textValue:",
    "      inputValue: Hello",
    "parameterValues: {}"
  ].join("\n");
  const textC = [
    "key: Text_c",
    "type: Text",
    "name: Caption",
    "props:",
    "  text:",
    "    textValue:",
    "      inputValue: World",
    "parameterValues: {}"
  ].join("\n");
  const buttonB = "key: Button_b\ntype: Button\nprops: {}\nparameterValues: {}\n";
  const rowWrap = "key: Row_wrap\ntype: Row\nprops: {}\nparameterValues: {}\n";
  const wrapped = "key: Text_wrapped\ntype: Text\nprops:\n  text:\n    textValue:\n      inputValue: Wrapped\nparameterValues: {}\n";

  const targetKey = options?.missingTarget ? "Scaffold_missing_page" : "Scaffold_yjzz7f8n";
  const triggerYaml = [
    "rootAction:",
    "  key: root_route",
    "  action:",
    "    navigate:",
    "      allowBack: true",
    "      isNavigateBack: false",
    "      pageNodeKeyRef:",
    `        key: ${targetKey}`,
    "    key: NAV_login_to_dash",
    "trigger:",
    "  triggerType: ON_TAP"
  ].join("\n");
  const actionYaml = [
    "navigate:",
    "  allowBack: true",
    "  isNavigateBack: false",
    "  pageNodeKeyRef:",
    `    key: ${targetKey}`,
    "key: NAV_login_to_dash"
  ].join("\n");

  const dashboardPageYaml = "name: DailyDashboard\ndescription: \"\"\nnode:\n  key: Scaffold_yjzz7f8n\n";
  const dashboardTreeYaml = "node:\n  key: Scaffold_yjzz7f8n\n";
  const dashboardNode = "key: Scaffold_yjzz7f8n\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";

  const files = [
    { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: loginPageYaml },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml", yaml: loginTreeYaml },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Scaffold_xkz5zwqw.yaml", yaml: loginNode },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Column_parent.yaml", yaml: columnNode },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml", yaml: textA },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_b.yaml", yaml: textB },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_c.yaml", yaml: textC },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b.yaml", yaml: buttonB },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Row_wrap.yaml", yaml: rowWrap },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wrapped.yaml", yaml: wrapped },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP.yaml",
      yaml: triggerYaml
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP/action/id-NAV_login_to_dash.yaml",
      yaml: actionYaml
    },
    { fileKey: "page/id-Scaffold_yjzz7f8n.yaml", yaml: dashboardPageYaml },
    { fileKey: "page/id-Scaffold_yjzz7f8n/page-widget-tree-outline.yaml", yaml: dashboardTreeYaml },
    { fileKey: "page/id-Scaffold_yjzz7f8n/page-widget-tree-outline/node/id-Scaffold_yjzz7f8n.yaml", yaml: dashboardNode }
  ];

  if (options?.orphanAction) {
    files.push({
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP/action/id-Orphan_extra.yaml",
      yaml: "navigate:\n  allowBack: false\nkey: Orphan_extra\n"
    });
  }

  snapshotRepo.upsertFiles(
    snapshotId,
    files.map((row) => ({ fileKey: row.fileKey, yaml: row.yaml, sha256: sha256(row.yaml) }))
  );
}

describe("route + rollback command pack", () => {
  it("widget.unwrap unwraps wrapper and deletes wrapper file", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "unwrap-ok");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "widget.unwrap",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Row_wrap", apply: true, remoteValidate: false }
    });
    expect(res.ok).toBe(true);

    const treeAfter = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfter?.yaml.includes("Row_wrap")).toBe(false);
    expect(treeAfter?.yaml.includes("Text_wrapped")).toBe(true);

    const wrapperNode = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Row_wrap.yaml");
    expect(wrapperNode?.yaml).toBe("");
    db.close();
  });

  it("widget.unwrap rejects root unwrap", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "unwrap-root");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "widget.unwrap",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Scaffold_xkz5zwqw" }
    });
    expect(res.ok).toBe(false);
    expect((res.errors ?? []).join(" ")).toContain("Cannot unwrap root");
    db.close();
  });

  it("widget.moveMany preserves order when moving nodes after anchor", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "move-many-order");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "widget.moveMany",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeIds: ["id-Text_b", "id-Text_c", "id-Text_wrapped"],
        afterNodeId: "id-Button_b",
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);

    const tree = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml")?.yaml ?? "";
    const idxButton = tree.indexOf("- key: Button_b");
    const idxTextB = tree.indexOf("- key: Text_b");
    const idxTextC = tree.indexOf("- key: Text_c");
    expect(idxButton).toBeGreaterThan(0);
    expect(idxTextB).toBeGreaterThan(idxButton);
    expect(idxTextC).toBeGreaterThan(idxTextB);
    db.close();
  });

  it("widget.moveMany fails atomically when one node is missing", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "move-many-atomic");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const beforeTree = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml")?.yaml ?? "";
    const res = await orbit.run({
      cmd: "widget.moveMany",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeIds: ["id-Text_b", "id-Missing"],
        afterNodeId: "id-Button_b",
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(false);
    const afterTree = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml")?.yaml ?? "";
    expect(afterTree).toBe(beforeTree);
    db.close();
  });

  it("widget.action.list returns trigger/action metadata", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "action-list");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "widget.action.list",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Button_b" }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { totalActions: number; actions: Array<{ trigger: string; navigateTargetPageId?: string }> };
    expect(data.totalActions).toBeGreaterThan(0);
    expect(data.actions.some((row) => row.trigger === "ON_TAP")).toBe(true);
    expect(data.actions.some((row) => row.navigateTargetPageId === "id-Scaffold_yjzz7f8n")).toBe(true);
    db.close();
  });

  it("widget.action.get returns ON_TAP payload", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "action-get");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "widget.action.get",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Button_b", trigger: "ON_TAP" }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { action?: Record<string, unknown> };
    expect(data.action).toBeDefined();
    expect(JSON.stringify(data.action)).toContain("navigate");
    db.close();
  });

  it("routes.listByPage returns outgoing and incoming routes", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "routes-list-by-page");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const outgoing = await orbit.run({
      cmd: "routes.listByPage",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", direction: "outgoing" }
    });
    expect(outgoing.ok).toBe(true);
    const outRows = (outgoing.data as { routes: Array<{ fromPageId: string; toPageId: string }> }).routes;
    expect(outRows.some((row) => row.fromPageId === "id-Scaffold_xkz5zwqw" && row.toPageId === "id-Scaffold_yjzz7f8n")).toBe(true);

    const incoming = await orbit.run({
      cmd: "routes.listByPage",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "DailyDashboard", direction: "incoming" }
    });
    expect(incoming.ok).toBe(true);
    const inRows = (incoming.data as { routes: Array<{ fromPageId: string; toPageId: string }> }).routes;
    expect(inRows.some((row) => row.toPageId === "id-Scaffold_yjzz7f8n")).toBe(true);
    db.close();
  });

  it("routes.validate detects missing target page", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "routes-validate-missing");
    seedProject(snapshotRepo, snapshot.snapshotId, { missingTarget: true });
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "routes.validate",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login" }
    });
    expect(res.ok).toBe(true);
    const issues = (res.data as { issues: Array<{ code: string }> }).issues;
    expect(issues.some((issue) => issue.code === "route.target_missing")).toBe(true);
    db.close();
  });

  it("routes.validate detects orphan action files", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "routes-validate-orphans");
    seedProject(snapshotRepo, snapshot.snapshotId, { orphanAction: true });
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "routes.validate",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", includeOrphans: true }
    });
    expect(res.ok).toBe(true);
    const issues = (res.data as { issues: Array<{ code: string }> }).issues;
    expect(issues.some((issue) => issue.code === "route.orphan_action_file")).toBe(true);
    db.close();
  });

  it("snapshots.ensureFresh no-refresh path when snapshot is fresh", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "ensure-fresh-fresh");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "snapshots.ensureFresh",
      snapshot: snapshot.snapshotId,
      args: { staleMinutes: 60 }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { wasRefreshed: boolean; reason: string };
    expect(data.wasRefreshed).toBe(false);
    expect(data.reason).toBe("snapshot_fresh");
    db.close();
  });

  it("snapshots.ensureFresh refreshes when snapshot is stale", async () => {
    const adapter = new MemoryAdapter();
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "ensure-fresh-stale");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    adapter.seedRemote({
      "page/id-Scaffold_xkz5zwqw.yaml": "name: login\ndescription: refreshed\nnode:\n  key: Scaffold_xkz5zwqw\n"
    });
    db.prepare("UPDATE snapshots SET refreshed_at = datetime('now', '-120 minutes') WHERE snapshot_id = ?").run(snapshot.snapshotId);

    const res = await orbit.run({
      cmd: "snapshots.ensureFresh",
      snapshot: snapshot.snapshotId,
      args: { staleMinutes: 1 }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { wasRefreshed: boolean; reason: string };
    expect(data.wasRefreshed).toBe(true);
    expect(data.reason).toBe("snapshot_stale");
    db.close();
  });

  it("snapshots.ensureFresh refreshes when snapshot is empty", async () => {
    const adapter = new MemoryAdapter();
    const { db, snapshotRepo, orbit } = await buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "ensure-fresh-empty");
    adapter.seedRemote({
      "page/id-Scaffold_empty.yaml": "name: Empty\ndescription: \"\"\nnode:\n  key: Scaffold_empty\n"
    });

    const res = await orbit.run({
      cmd: "snapshots.ensureFresh",
      snapshot: snapshot.snapshotId,
      args: { staleMinutes: 30 }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { wasRefreshed: boolean; reason: string };
    expect(data.wasRefreshed).toBe(true);
    expect(data.reason).toBe("snapshot_empty");
    expect(snapshotRepo.countFiles(snapshot.snapshotId)).toBeGreaterThan(0);
    db.close();
  });

  it("changeset.rollback creates inverse changeset for latest applied", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "rollback-create");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const applied = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "James NC", apply: true, remoteValidate: false }
    });
    expect(applied.ok).toBe(true);

    const rollback = await orbit.run({
      cmd: "changeset.rollback",
      snapshot: snapshot.snapshotId,
      args: { latestApplied: true, confirm: true }
    });
    expect(rollback.ok).toBe(true);
    const data = rollback.data as { rollbackChangesetId: string; sourceChangesetId: string; filesReverted: string[] };
    expect(data.rollbackChangesetId).toContain("chg_");
    expect(data.sourceChangesetId).toContain("chg_");
    expect(data.filesReverted.length).toBeGreaterThan(0);
    db.close();
  });

  it("changeset.rollback apply restores original field value", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "rollback-apply");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const applied = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "James NC", apply: true, remoteValidate: false }
    });
    expect(applied.ok).toBe(true);

    const rollback = await orbit.run({
      cmd: "changeset.rollback",
      snapshot: snapshot.snapshotId,
      args: { latestApplied: true, confirm: true, apply: true, remoteValidate: false }
    });
    expect(rollback.ok).toBe(true);

    const textNode = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml");
    expect(textNode?.yaml).toContain("inputValue: brand.ai");
    db.close();
  });

  it("changeset.rollback rejects non-applied source changeset", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "rollback-reject");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const staged = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "Draft only", apply: false }
    });
    expect(staged.ok).toBe(true);

    const rollback = await orbit.run({
      cmd: "changeset.rollback",
      snapshot: snapshot.snapshotId,
      args: { changesetId: (staged.data as { changesetId: string }).changesetId, confirm: true }
    });
    expect(rollback.ok).toBe(false);
    expect((rollback.errors ?? []).join(" ")).toContain("applied changesets");
    db.close();
  });

  it("changeset.revert alias delegates to rollback", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "rollback-alias");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const applied = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "Alias", apply: true, remoteValidate: false }
    });
    expect(applied.ok).toBe(true);
    const sourceChangesetId = (applied.data as { changesetId: string }).changesetId;

    const reverted = await orbit.run({
      cmd: "changeset.revert",
      snapshot: snapshot.snapshotId,
      args: { changesetId: sourceChangesetId, confirm: true }
    });
    expect(reverted.ok).toBe(true);
    const data = reverted.data as { sourceChangesetId: string; rollbackChangesetId: string };
    expect(data.sourceChangesetId).toBe(sourceChangesetId);
    expect(data.rollbackChangesetId).toContain("chg_");
    db.close();
  });

  it("intent.run maps unwrap/moveMany/validate/ensureFresh/rollback intents", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "intent-mapping");
    seedProject(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const unwrap = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "unwrap id-Row_wrap on login" }
    });
    expect(unwrap.ok).toBe(true);
    expect((unwrap.data as { mappedCommand?: string }).mappedCommand).toBe("widget.unwrap");

    const moveMany = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "move [id-Text_b,id-Text_c] after id-Button_b on login" }
    });
    expect(moveMany.ok).toBe(true);
    expect((moveMany.data as { mappedCommand?: string }).mappedCommand).toBe("widget.moveMany");

    const validateRoutes = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "validate routes strict on login" }
    });
    expect(validateRoutes.ok).toBe(true);
    expect((validateRoutes.data as { mappedCommand?: string }).mappedCommand).toBe("routes.validate");

    const ensureFresh = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "ensure fresh snapshot" }
    });
    expect(ensureFresh.ok).toBe(true);
    expect((ensureFresh.data as { mappedCommand?: string }).mappedCommand).toBe("snapshots.ensureFresh");

    const rollback = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "rollback latest" }
    });
    expect(rollback.ok).toBe(true);
    expect((rollback.data as { mappedCommand?: string }).mappedCommand).toBe("changeset.rollback");
    db.close();
  });
});
