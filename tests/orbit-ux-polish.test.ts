import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { extractSnapshotIndex } from "../src/indexer/extract.js";
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

async function buildOrbit() {
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
  const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), reindex);
  const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, orbit, reindex };
}

function seedSplitPage(snapshotRepo: SnapshotRepo, snapshotId: string) {
  const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
  const treeYaml = [
    "node:",
    "  key: Scaffold_xkz5zwqw",
    "  children:",
    "    - key: Column_parent",
    "      children:",
    "        - key: Button_b",
    "        - key: Row_wrap",
    "          children:",
    "            - key: Text_wrapped"
  ].join("\n");
  const scaffold = "key: Scaffold_xkz5zwqw\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
  const column = "key: Column_parent\ntype: Column\nprops: {}\nparameterValues: {}\n";
  const rowWrap = "key: Row_wrap\ntype: Row\nprops: {}\nparameterValues: {}\n";
  const wrapped = "key: Text_wrapped\ntype: Text\nprops:\n  text:\n    textValue:\n      inputValue: Wrapped\nparameterValues: {}\n";
  const buttonB = "key: Button_b\ntype: Button\nprops: {}\nparameterValues: {}\n";
  const triggerYaml = [
    "rootAction:",
    "  key: root_route",
    "  action:",
    "    navigate:",
    "      allowBack: true",
    "      isNavigateBack: false",
    "      pageNodeKeyRef:",
    "        key: Scaffold_xkz5zwqw",
    "    key: NAV_self",
    "trigger:",
    "  triggerType: ON_TAP"
  ].join("\n");
  const actionYaml = [
    "navigate:",
    "  allowBack: true",
    "  isNavigateBack: false",
    "  pageNodeKeyRef:",
    "    key: Scaffold_xkz5zwqw",
    "key: NAV_self"
  ].join("\n");

  snapshotRepo.upsertFiles(snapshotId, [
    { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml", yaml: treeYaml, sha256: sha256(treeYaml) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Scaffold_xkz5zwqw.yaml", yaml: scaffold, sha256: sha256(scaffold) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Column_parent.yaml", yaml: column, sha256: sha256(column) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b.yaml", yaml: buttonB, sha256: sha256(buttonB) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Row_wrap.yaml", yaml: rowWrap, sha256: sha256(rowWrap) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wrapped.yaml", yaml: wrapped, sha256: sha256(wrapped) },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP.yaml",
      yaml: triggerYaml,
      sha256: sha256(triggerYaml)
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP/action/id-NAV_self.yaml",
      yaml: actionYaml,
      sha256: sha256(actionYaml)
    }
  ]);
}

describe("ux polish", () => {
  it("stores and clears remembered selection", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "selection-memory");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const getWidget = await orbit.run({
      cmd: "widget.get",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Row_wrap" }
    });
    expect(getWidget.ok).toBe(true);

    const selected = await orbit.run({ cmd: "selection.get", snapshot: snapshot.snapshotId, args: {} });
    expect(selected.ok).toBe(true);
    const selection = (selected.data as { selection: { nodeId: string } | null }).selection;
    expect(selection?.nodeId).toBe("id-Row_wrap");

    const cleared = await orbit.run({ cmd: "selection.clear", snapshot: snapshot.snapshotId, args: {} });
    expect(cleared.ok).toBe(true);

    const selectedAfter = await orbit.run({ cmd: "selection.get", snapshot: snapshot.snapshotId, args: {} });
    expect(selectedAfter.ok).toBe(true);
    expect((selectedAfter.data as { selection: unknown }).selection).toBeNull();

    db.close();
  });

  it("intent.run uses remembered selection for 'unwrap this'", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "intent-selection");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const getWidget = await orbit.run({
      cmd: "widget.get",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Row_wrap" }
    });
    expect(getWidget.ok).toBe(true);

    const intent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "unwrap this", apply: false }
    });
    expect(intent.ok).toBe(true);
    const data = intent.data as { mappedCommand?: string; resultOk?: boolean };
    expect(data.mappedCommand).toBe("widget.unwrap");
    expect(data.resultOk).toBe(true);

    db.close();
  });

  it("intent.run infers page from nodeId for action reads", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "intent-infer-page");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const intent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "list actions on id-Button_b" }
    });
    expect(intent.ok).toBe(true);
    const data = intent.data as { mappedCommand?: string; mappedArgs?: { nameOrId?: string }; resultOk?: boolean };
    expect(data.mappedCommand).toBe("widget.action.list");
    expect(data.mappedArgs?.nameOrId).toBe("id-Scaffold_xkz5zwqw");
    expect(data.resultOk).toBe(true);

    db.close();
  });
});
