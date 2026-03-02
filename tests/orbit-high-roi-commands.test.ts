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

async function buildOrbit() {
  const db = openOrbitDb({ dbPath: ":memory:" });
  const snapshotRepo = new SnapshotRepo(db);
  const indexRepo = new IndexRepo(db);
  const policy = new PolicyEngine();
  await policy.reload();
  const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
  const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, orbit };
}

function seedSplitPage(snapshotRepo: SnapshotRepo, snapshotId: string) {
  const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
  const treeYaml = [
    "node:",
    "  key: Scaffold_xkz5zwqw",
    "  body:",
    "    key: Column_parent",
    "    children:",
    "      - key: Text_a",
    "      - key: Button_b",
    "      - key: Container_c",
    "        children:",
    "          - key: Text_c1"
  ].join("\n");
  const scaffold = "key: Scaffold_xkz5zwqw\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
  const column = "key: Column_parent\ntype: Column\nprops: {}\nparameterValues: {}\n";
  const textA = [
    "key: Text_a",
    "type: Text",
    "name: title",
    "props:",
    "  text:",
    "    textValue:",
    "      inputValue: brand.ai",
    "      mostRecentInputValue: brand.ai",
    "parameterValues: {}"
  ].join("\n");
  const buttonB = "key: Button_b\ntype: Button\nprops: {}\nparameterValues: {}\n";
  const containerC = "key: Container_c\ntype: Container\nprops: {}\nparameterValues: {}\n";
  const textC1 = "key: Text_c1\ntype: Text\nprops:\n  text:\n    textValue:\n      inputValue: child\nparameterValues: {}\n";
  snapshotRepo.upsertFiles(snapshotId, [
    { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml", yaml: treeYaml, sha256: sha256(treeYaml) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Scaffold_xkz5zwqw.yaml", yaml: scaffold, sha256: sha256(scaffold) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Column_parent.yaml", yaml: column, sha256: sha256(column) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml", yaml: textA, sha256: sha256(textA) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b.yaml", yaml: buttonB, sha256: sha256(buttonB) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Container_c.yaml", yaml: containerC, sha256: sha256(containerC) },
    { fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_c1.yaml", yaml: textC1, sha256: sha256(textC1) }
  ]);
}

describe("high ROI command set", () => {
  it("supports copy/paste, duplicate, deleteSubtree, removeChildren", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "roi-tree-ops");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);

    const copy = await orbit.run({
      cmd: "widgets.copyPaste",
      snapshot: snapshot.snapshotId,
      args: { mode: "copy", nameOrId: "login", nodeId: "id-Text_a" }
    });
    expect(copy.ok).toBe(true);
    const clipboardId = (copy.data as { clipboardId: string }).clipboardId;
    expect(typeof clipboardId).toBe("string");

    const paste = await orbit.run({
      cmd: "widgets.copyPaste",
      snapshot: snapshot.snapshotId,
      args: { mode: "paste", clipboardId, nameOrId: "login", afterNodeId: "id-Button_b", apply: true, remoteValidate: false }
    });
    expect(paste.ok).toBe(true);
    const pastedRootNodeId = (paste.data as { pastedRootNodeId: string }).pastedRootNodeId;
    expect(pastedRootNodeId).toContain("id-");

    const dup = await orbit.run({
      cmd: "widget.duplicate",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", count: 2, apply: true, remoteValidate: false }
    });
    expect(dup.ok).toBe(true);
    const dupData = dup.data as { createdNodeIds: string[] };
    expect(dupData.createdNodeIds.length).toBe(2);

    const del = await orbit.run({
      cmd: "widget.deleteSubtree",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Container_c", apply: true, remoteValidate: false }
    });
    expect(del.ok).toBe(true);

    const removeChildren = await orbit.run({
      cmd: "widget.removeChildren",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Column_parent", keepNodeIds: ["id-Text_a"], apply: true, remoteValidate: false }
    });
    expect(removeChildren.ok).toBe(true);

    db.close();
  });

  it("supports widgets.updateMany and widget.replaceType", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "roi-batch-replace");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);

    const updateMany = await orbit.run({
      cmd: "widgets.updateMany",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        filter: { type: "Text", textContains: "brand.ai" },
        set: { text: "James NC" },
        apply: true,
        remoteValidate: false
      }
    });
    expect(updateMany.ok).toBe(true);

    const replaced = await orbit.run({
      cmd: "widget.replaceType",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", toType: "Button", apply: true, remoteValidate: false }
    });
    expect(replaced.ok).toBe(true);

    db.close();
  });

  it("supports tree.validate and tree.repair", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "roi-tree-validate-repair");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);

    const missing = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_c1.yaml");
    expect(missing).toBeDefined();
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_c1.yaml",
        yaml: "",
        sha256: sha256("")
      }
    ]);

    const validate = await orbit.run({
      cmd: "tree.validate",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", includeOrphans: true }
    });
    expect(validate.ok).toBe(true);

    const repair = await orbit.run({
      cmd: "tree.repair",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", fixMissingNodes: true, apply: true, remoteValidate: false }
    });
    expect(repair.ok).toBe(true);

    db.close();
  });

  it("supports component extraction and component instance insertion", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "roi-components");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);

    const extracted = await orbit.run({
      cmd: "component.extractFromWidget",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Container_c",
        componentName: "LoginCard",
        apply: true,
        remoteValidate: false
      }
    });
    expect(extracted.ok).toBe(true);
    const extractedData = extracted.data as { componentId: string };
    expect(extractedData.componentId).toContain("id-");

    const inserted = await orbit.run({
      cmd: "component.instance.insert",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        componentNameOrId: extractedData.componentId,
        afterNodeId: "id-Button_b",
        apply: true,
        remoteValidate: false
      }
    });
    expect(inserted.ok).toBe(true);

    db.close();
  });

  it("supports intent.run routing and page.clone", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "roi-intent-clone");
    seedSplitPage(snapshotRepo, snapshot.snapshotId);

    const intent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "duplicate id-Text_a on login", preview: true }
    });
    expect(intent.ok).toBe(true);
    const intentData = intent.data as { mappedCommand?: string };
    expect(intentData.mappedCommand).toBe("widget.duplicate");

    const cloned = await orbit.run({
      cmd: "page.clone",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", newName: "loginClone", apply: true, remoteValidate: false }
    });
    expect(cloned.ok).toBe(true);
    const cloneData = cloned.data as { copiedFilesCount: number; newPageId: string };
    expect(cloneData.copiedFilesCount).toBeGreaterThan(0);
    expect(cloneData.newPageId).toContain("id-");

    db.close();
  });
});
