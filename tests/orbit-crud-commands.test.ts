import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import type { FileUpdate, PushResult } from "../src/types.js";
import { sha256 } from "../src/util/hash.js";

class MockAdapter implements FlutterFlowAdapter {
  updates: FileUpdate[] = [];

  async listProjects() {
    return [];
  }

  async listFileKeys() {
    return [];
  }

  async fetchFile() {
    return "";
  }

  async listPartitionedFileNames() {
    return { files: [] };
  }

  async fetchProjectYamls() {
    return { files: {} };
  }

  async validateProjectYaml() {
    return { ok: true };
  }

  async remoteValidate() {
    return { ok: true };
  }

  async pushFiles(_projectId: string, updates: FileUpdate[]): Promise<PushResult> {
    this.updates = updates;
    return { ok: true };
  }
}

async function buildOrbit() {
  const db = openOrbitDb({ dbPath: ":memory:" });
  const snapshotRepo = new SnapshotRepo(db);
  const indexRepo = new IndexRepo(db);
  const policy = new PolicyEngine();
  await policy.setPolicy({
    allowProjects: ["*"],
    allowFileKeyPrefixes: [],
    denyFileKeyPrefixes: ["lib/custom_code/", "lib/custom_functions/", "lib/main.dart"],
    maxFilesPerApply: 200,
    maxLinesChanged: 10000,
    requireManualApproval: false,
    allowPlatformConfigEdits: false,
    safeMode: "fullWrite"
  });
  const adapter = new MockAdapter();
  const changesets = new ChangesetService(db, snapshotRepo, policy, adapter, async () => {});
  const orbit = new OrbitCommandPalette(adapter, snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, orbit };
}

describe("orbit first-class page/widget CRUD commands", () => {
  it("supports page create, update, delete (hard-delete attempt)", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-crud");

    const create = await orbit.run({
      cmd: "page.create",
      snapshot: snapshot.snapshotId,
      args: { pageId: "id-Scaffold_testpage1", name: "TestPage", apply: true, remoteValidate: false }
    });
    expect(create.ok).toBe(true);

    const listedAfterCreate = await orbit.run({
      cmd: "pages.list",
      snapshot: snapshot.snapshotId,
      args: { strictSnapshot: true }
    });
    expect(listedAfterCreate.ok).toBe(true);
    const createPages = (listedAfterCreate.data as { pages: Array<{ pageId: string; name: string }> }).pages;
    expect(createPages.some((page) => page.pageId === "id-Scaffold_testpage1" && page.name === "TestPage")).toBe(true);

    const update = await orbit.run({
      cmd: "page.update",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "id-Scaffold_testpage1",
        key: "name",
        value: "TestPageRenamed",
        apply: true,
        remoteValidate: false
      }
    });
    expect(update.ok).toBe(true);

    const listedAfterUpdate = await orbit.run({
      cmd: "pages.list",
      snapshot: snapshot.snapshotId,
      args: { strictSnapshot: true }
    });
    const updatePages = (listedAfterUpdate.data as { pages: Array<{ pageId: string; name: string }> }).pages;
    expect(updatePages.some((page) => page.pageId === "id-Scaffold_testpage1" && page.name === "TestPageRenamed")).toBe(true);

    const remove = await orbit.run({
      cmd: "page.delete",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "id-Scaffold_testpage1", apply: true, remoteValidate: false }
    });
    expect(remove.ok).toBe(true);
    const removeData = remove.data as { mode: string; deleted: boolean };
    expect(removeData.mode).toBe("hard-delete");
    expect(removeData.deleted).toBe(true);

    const listedAfterDelete = await orbit.run({
      cmd: "pages.list",
      snapshot: snapshot.snapshotId,
      args: { strictSnapshot: true }
    });
    const visiblePages = (listedAfterDelete.data as { pages: Array<{ pageId: string }> }).pages;
    expect(visiblePages.some((page) => page.pageId === "id-Scaffold_testpage1")).toBe(false);

    const listedIncludingDeleted = await orbit.run({
      cmd: "pages.list",
      snapshot: snapshot.snapshotId,
      args: { strictSnapshot: true, includeDeleted: true }
    });
    const allPages = (listedIncludingDeleted.data as { pages: Array<{ pageId: string; name: string }> }).pages;
    expect(allPages.some((page) => page.pageId === "id-Scaffold_testpage1")).toBe(true);

    const pageFile = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_testpage1.yaml");
    expect(pageFile?.yaml).toContain("[deleted]");
    expect(pageFile?.yaml).toContain("TestPageRenamed");

    db.close();
  });

  it("supports widget create, get, update, delete", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-crud");
    const pageId = "id-Scaffold_widgetcrud1";
    const pageYaml = "name: WidgetCrudPage\ndescription: \"\"\nnode:\n  key: Scaffold_widgetcrud1\n  classModel: {}\n";
    const treeYaml = "node:\n  key: Scaffold_widgetcrud1\n";
    const rootNodeYaml = "key: Scaffold_widgetcrud1\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: `page/${pageId}.yaml`, yaml: pageYaml, sha256: sha256(pageYaml) },
      { fileKey: `page/${pageId}/page-widget-tree-outline.yaml`, yaml: treeYaml, sha256: sha256(treeYaml) },
      {
        fileKey: `page/${pageId}/page-widget-tree-outline/node/${pageId}.yaml`,
        yaml: rootNodeYaml,
        sha256: sha256(rootNodeYaml)
      }
    ]);

    const created = await orbit.run({
      cmd: "widget.create",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: pageId,
        parentNodeId: pageId,
        nodeId: "id-Text_newwidget1",
        type: "Text",
        props: { text: { textValue: { inputValue: "Hello", mostRecentInputValue: "Hello" } } },
        apply: true,
        remoteValidate: false
      }
    });
    expect(created.ok).toBe(true);

    const got = await orbit.run({
      cmd: "widget.get",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: pageId, nodeId: "id-Text_newwidget1" }
    });
    expect(got.ok).toBe(true);
    const gotData = got.data as { widget: { node: Record<string, unknown> } };
    expect(gotData.widget.node.type).toBe("Text");

    const updated = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: pageId,
        nodeId: "id-Text_newwidget1",
        key: "props.text.textValue.inputValue",
        value: "Updated",
        apply: true,
        remoteValidate: false
      }
    });
    expect(updated.ok).toBe(true);

    const removed = await orbit.run({
      cmd: "widget.delete",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: pageId, nodeId: "id-Text_newwidget1", apply: true, remoteValidate: false }
    });
    expect(removed.ok).toBe(true);

    const listedAfterDelete = await orbit.run({
      cmd: "widgets.list",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: pageId }
    });
    expect(listedAfterDelete.ok).toBe(true);
    const widgets = (listedAfterDelete.data as { widgets: Array<{ nodeId?: string }> }).widgets;
    expect(widgets.some((widget) => widget.nodeId === "id-Text_newwidget1")).toBe(false);

    db.close();
  });

  it("supports page.scaffold as high-level page creation flow", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit();
    const snapshot = snapshotRepo.createSnapshot("proj_1", "page-scaffold-crud");

    const scaffold = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "ScaffoldedSettings",
        pageId: "id-Scaffold_scaffolded_settings",
        recipe: "auth.login",
        apply: true,
        remoteValidate: false
      }
    });
    expect(scaffold.ok).toBe(true);
    const scaffoldData = scaffold.data as {
      state: string;
      page: { pageId: string; name: string; fileKey: string };
      generated: { filesCreated: number };
      applyResult?: { applied?: boolean };
    };
    expect(scaffoldData.state).toBe("applied");
    expect(scaffoldData.applyResult?.applied).toBe(true);
    expect(scaffoldData.page.pageId).toBe("id-Scaffold_scaffolded_settings");
    expect(scaffoldData.generated.filesCreated).toBeGreaterThanOrEqual(4);

    const listed = await orbit.run({
      cmd: "pages.list",
      snapshot: snapshot.snapshotId,
      args: { strictSnapshot: true }
    });
    expect(listed.ok).toBe(true);
    const pages = (listed.data as { pages: Array<{ pageId: string; name: string }> }).pages;
    expect(pages.some((page) => page.pageId === "id-Scaffold_scaffolded_settings" && page.name === "ScaffoldedSettings")).toBe(true);

    db.close();
  });
});
