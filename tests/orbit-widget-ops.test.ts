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

describe("widget helper commands", () => {
  it("lists widgets and supports set/delete through changesets", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-ops");
    const yaml = [
      "pageName: Onboarding",
      "widgetTree:",
      "  - id: id-Parent",
      "    type: Column",
      "    children:",
      "      - id: id-ChildText",
      "        type: Text",
      "        props:",
      "          textValue:",
      "            inputValue: Hello",
      "            mostRecentInputValue: Hello"
    ].join("\n");

    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_x2qdc4sq.yaml", yaml, sha256: sha256(yaml) }
    ]);

    const list = await orbit.run({
      cmd: "widgets.list",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "Onboarding" }
    });
    expect(list.ok).toBe(true);
    const listData = list.data as { totalWidgets: number };
    expect(listData.totalWidgets).toBeGreaterThan(0);

    const setResult = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { name: "Onboarding", nodeId: "id-ChildText", key: "textValue.inputValue", value: "Updated", preview: true }
    });
    expect(setResult.ok).toBe(true);
    const setData = setResult.data as {
      changesetId: string;
      selector: string;
      preview?: { files: Array<{ linesChanged: number }> };
    };
    expect(typeof setData.changesetId).toBe("string");
    expect(setData.selector.endsWith(".props.textValue.inputValue")).toBe(true);
    expect((setData.preview?.files?.[0]?.linesChanged ?? 0) > 0).toBe(true);

    const deleteResult = await orbit.run({
      cmd: "widget.delete",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "Onboarding", nodeId: "id-ChildText", preview: true }
    });
    expect(deleteResult.ok).toBe(true);
    const deleteData = deleteResult.data as { changesetId: string };
    expect(typeof deleteData.changesetId).toBe("string");

    db.close();
  });

  it("lists split page-widget-tree-outline nodes for a page", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-split");
    const pageYaml = "pageName: login\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = "node:\n  key: Scaffold_xkz5zwqw\n  children:\n    - key: TextField_dgr0b1pe\n";
    const nodeYaml = "key: TextField_dgr0b1pe\ntype: TextField\nprops:\n  text: hello\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-TextField_dgr0b1pe.yaml",
        yaml: nodeYaml,
        sha256: sha256(nodeYaml)
      }
    ]);

    const list = await orbit.run({
      cmd: "widgets.list",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login" }
    });
    expect(list.ok).toBe(true);
    const data = list.data as { totalWidgets: number; widgets: Array<{ nodeId?: string; type?: string }> };
    expect(data.totalWidgets).toBeGreaterThan(0);
    expect(data.widgets.some((widget) => widget.nodeId === "id-TextField_dgr0b1pe")).toBe(true);
    expect(data.widgets.some((widget) => widget.type === "TextField")).toBe(true);

    const deleteProperty = await orbit.run({
      cmd: "widget.delete",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-TextField_dgr0b1pe", key: "props.text", preview: true }
    });
    expect(deleteProperty.ok).toBe(true);
    const deleteData = deleteProperty.data as { fileKey: string };
    expect(deleteData.fileKey).toBe("page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-TextField_dgr0b1pe.yaml");

    db.close();
  });

  it("scopes non-split widget.set/widget.delete key operations to the requested nodeId", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-nonsplit-scope");
    const yaml = [
      "pageName: ScopeTest",
      "widgetTree:",
      "  - id: id-Parent",
      "    children:",
      "      - id: id-TextA",
      "        type: Text",
      "        props:",
      "          textValue:",
      "            inputValue: Alpha",
      "      - id: id-TextB",
      "        type: Text",
      "        props:",
      "          textValue:",
      "            inputValue: Beta"
    ].join("\n");
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_scope.yaml", yaml, sha256: sha256(yaml) }
    ]);

    const setResult = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "ScopeTest",
        nodeId: "id-TextB",
        key: "textValue.inputValue",
        value: "BetaUpdated",
        preview: true,
        apply: true,
        remoteValidate: false
      }
    });
    expect(setResult.ok).toBe(true);
    const setData = setResult.data as { selector: string };
    expect(setData.selector.startsWith("$.widgetTree")).toBe(true);

    const afterSet = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_scope.yaml");
    expect(afterSet).toBeDefined();
    expect(afterSet!.yaml).toContain("inputValue: Alpha");
    expect(afterSet!.yaml).toContain("inputValue: BetaUpdated");

    const deleteResult = await orbit.run({
      cmd: "widget.delete",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "ScopeTest",
        nodeId: "id-TextB",
        key: "props.textValue",
        preview: true,
        apply: true,
        remoteValidate: false
      }
    });
    expect(deleteResult.ok).toBe(true);
    const deleteData = deleteResult.data as { selector: string };
    expect(deleteData.selector.startsWith("$.widgetTree")).toBe(true);
    const afterDelete = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_scope.yaml");
    expect(afterDelete).toBeDefined();
    expect(afterDelete!.yaml).toContain("id: id-TextA");
    expect(afterDelete!.yaml).toContain("inputValue: Alpha");
    expect(afterDelete!.yaml).not.toContain("inputValue: BetaUpdated");

    db.close();
  });

  it("wraps a widget in split mode and creates wrapper node file", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-wrap");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_wsxpaf81",
      "      - key: Button_next"
    ].join("\n");
    const textYaml = [
      "key: Text_wsxpaf81",
      "type: Text",
      "props:",
      "  text:",
      "    textValue:",
      "      inputValue: James NC"
    ].join("\n");
    const buttonYaml = [
      "key: Button_next",
      "type: Button",
      "props: {}"
    ].join("\n");
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81.yaml",
        yaml: textYaml,
        sha256: sha256(textYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_next.yaml",
        yaml: buttonYaml,
        sha256: sha256(buttonYaml)
      }
    ]);

    const wrap = await orbit.run({
      cmd: "widget.wrap",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Text_wsxpaf81",
        wrapperType: "Row",
        wrapperNodeId: "id-Row_wrapper",
        apply: true,
        remoteValidate: false
      }
    });
    expect(wrap.ok).toBe(true);

    const treeAfter = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfter).toBeDefined();
    expect(treeAfter!.yaml).toContain("- key: Row_wrapper");
    expect(treeAfter!.yaml).toContain("children:");
    expect(treeAfter!.yaml).toContain("- key: Text_wsxpaf81");

    const wrapperNode = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Row_wrapper.yaml"
    );
    expect(wrapperNode).toBeDefined();
    expect(wrapperNode!.yaml).toContain("type: Row");

    db.close();
  });

  it("supports widget.create wrapNodeId alias by delegating to widget.wrap", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-wrap-create");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_wsxpaf81"
    ].join("\n");
    const textYaml = [
      "key: Text_wsxpaf81",
      "type: Text",
      "props:",
      "  text:",
      "    textValue:",
      "      inputValue: James NC"
    ].join("\n");
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81.yaml",
        yaml: textYaml,
        sha256: sha256(textYaml)
      }
    ]);

    const wrappedViaCreate = await orbit.run({
      cmd: "widget.create",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        wrapNodeId: "id-Text_wsxpaf81",
        type: "Row",
        nodeId: "id-Row_from_create",
        apply: true,
        remoteValidate: false
      }
    });
    expect(wrappedViaCreate.ok).toBe(true);

    const treeAfter = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfter).toBeDefined();
    expect(treeAfter!.yaml).toContain("- key: Row_from_create");
    expect(treeAfter!.yaml).toContain("- key: Text_wsxpaf81");

    db.close();
  });

  it("finds widgets by text query and blocks parentNodeId reparent misuse in widget.set", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widgets-find-text");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_title",
      "      - key: TextField_email"
    ].join("\n");
    const textTitleYaml = [
      "key: Text_title",
      "type: Text",
      "name: titleText",
      "props:",
      "  text:",
      "    textValue:",
      "      inputValue: James NC"
    ].join("\n");
    const textFieldYaml = [
      "key: TextField_email",
      "type: TextField",
      "name: emailAddress",
      "props:",
      "  label:",
      "    textValue:",
      "      inputValue: Email"
    ].join("\n");
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_title.yaml",
        yaml: textTitleYaml,
        sha256: sha256(textTitleYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-TextField_email.yaml",
        yaml: textFieldYaml,
        sha256: sha256(textFieldYaml)
      }
    ]);

    const found = await orbit.run({
      cmd: "widgets.findText",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", text: "Email", type: "TextField" }
    });
    expect(found.ok).toBe(true);
    const foundData = found.data as { totalMatches: number; matches: Array<{ nodeId?: string }> };
    expect(foundData.totalMatches).toBe(1);
    expect(foundData.matches[0]?.nodeId).toBe("id-TextField_email");

    const badSet = await orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Text_title",
        key: "parentNodeId",
        value: "id-Row_anything"
      }
    });
    expect(badSet.ok).toBe(false);
    expect((badSet.errors ?? []).join(" ")).toContain("widget.wrap");

    db.close();
  });

  it("locates and returns subtree context for a split-tree widget", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "tree-locate-subtree");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_wsxpaf81",
      "      - key: Button_next"
    ].join("\n");
    const textYaml = "key: Text_wsxpaf81\ntype: Text\nname: brand\nprops: {}\n";
    const buttonYaml = "key: Button_next\ntype: Button\nname: next\nprops: {}\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_wsxpaf81.yaml",
        yaml: textYaml,
        sha256: sha256(textYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_next.yaml",
        yaml: buttonYaml,
        sha256: sha256(buttonYaml)
      }
    ]);

    const locate = await orbit.run({
      cmd: "tree.locate",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_wsxpaf81" }
    });
    expect(locate.ok).toBe(true);
    const locateData = locate.data as { parent?: { nodeId?: string; index?: number }; siblings?: Array<{ nodeId?: string }> };
    expect(locateData.parent?.nodeId).toBe("id-Column_parent");
    expect(locateData.parent?.index).toBe(0);
    expect(locateData.siblings?.some((row) => row.nodeId === "id-Button_next")).toBe(true);

    const subtree = await orbit.run({
      cmd: "tree.subtree",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Column_parent", depth: 2 }
    });
    expect(subtree.ok).toBe(true);
    const subtreeData = subtree.data as { root?: { children?: Array<{ nodeId?: string }> } };
    const children = subtreeData.root?.children ?? [];
    expect(children.some((row) => row.nodeId === "id-Text_wsxpaf81")).toBe(true);
    expect(children.some((row) => row.nodeId === "id-Button_next")).toBe(true);

    db.close();
  });

  it("moves and reorders widgets in split tree mode", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-move");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_a",
      "      - key: Text_b",
      "      - key: Button_c"
    ].join("\n");
    const textAYaml = "key: Text_a\ntype: Text\nprops: {}\n";
    const textBYaml = "key: Text_b\ntype: Text\nprops: {}\n";
    const buttonCYaml = "key: Button_c\ntype: Button\nprops: {}\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml",
        yaml: textAYaml,
        sha256: sha256(textAYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_b.yaml",
        yaml: textBYaml,
        sha256: sha256(textBYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_c.yaml",
        yaml: buttonCYaml,
        sha256: sha256(buttonCYaml)
      }
    ]);

    const moved = await orbit.run({
      cmd: "widget.move",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Text_b",
        beforeNodeId: "id-Text_a",
        apply: true,
        remoteValidate: false
      }
    });
    expect(moved.ok).toBe(true);
    const treeAfterMove = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfterMove).toBeDefined();
    const indexTextB = treeAfterMove!.yaml.indexOf("- key: Text_b");
    const indexTextA = treeAfterMove!.yaml.indexOf("- key: Text_a");
    expect(indexTextB).toBeGreaterThanOrEqual(0);
    expect(indexTextA).toBeGreaterThanOrEqual(0);
    expect(indexTextB).toBeLessThan(indexTextA);

    const reordered = await orbit.run({
      cmd: "widget.reorder",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Text_b",
        direction: "down",
        steps: 1,
        apply: true,
        remoteValidate: false
      }
    });
    expect(reordered.ok).toBe(true);
    const treeAfterReorder = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfterReorder).toBeDefined();
    const indexTextBAfter = treeAfterReorder!.yaml.indexOf("- key: Text_b");
    const indexTextAAfter = treeAfterReorder!.yaml.indexOf("- key: Text_a");
    expect(indexTextBAfter).toBeGreaterThan(indexTextAAfter);

    db.close();
  });

  it("inserts widgets in one call using before/after/child placement", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "widget-insert");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_parent",
      "    children:",
      "      - key: Text_a",
      "      - key: Button_b"
    ].join("\n");
    const textAYaml = "key: Text_a\ntype: Text\nprops: {}\n";
    const buttonBYaml = "key: Button_b\ntype: Button\nprops: {}\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml",
        yaml: textAYaml,
        sha256: sha256(textAYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b.yaml",
        yaml: buttonBYaml,
        sha256: sha256(buttonBYaml)
      }
    ]);

    const insertedBefore = await orbit.run({
      cmd: "widget.insert",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        type: "Text",
        nodeId: "id-Text_new_before",
        beforeNodeId: "id-Button_b",
        apply: true,
        remoteValidate: false
      }
    });
    expect(insertedBefore.ok).toBe(true);

    const insertedChild = await orbit.run({
      cmd: "widget.insert",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        type: "Container",
        nodeId: "id-Container_first",
        parentNodeId: "id-Column_parent",
        index: 0,
        apply: true,
        remoteValidate: false
      }
    });
    expect(insertedChild.ok).toBe(true);

    const treeAfter = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml");
    expect(treeAfter).toBeDefined();
    const iContainer = treeAfter!.yaml.indexOf("- key: Container_first");
    const iTextA = treeAfter!.yaml.indexOf("- key: Text_a");
    const iTextNew = treeAfter!.yaml.indexOf("- key: Text_new_before");
    const iButtonB = treeAfter!.yaml.indexOf("- key: Button_b");
    expect(iContainer).toBeGreaterThanOrEqual(0);
    expect(iTextA).toBeGreaterThanOrEqual(0);
    expect(iTextNew).toBeGreaterThanOrEqual(0);
    expect(iButtonB).toBeGreaterThanOrEqual(0);
    expect(iContainer).toBeLessThan(iTextA);
    expect(iTextNew).toBeLessThan(iButtonB);

    const nodeFileBefore = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_new_before.yaml"
    );
    expect(nodeFileBefore).toBeDefined();
    expect(nodeFileBefore!.yaml).toContain("type: Text");

    const nodeFileContainer = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Container_first.yaml"
    );
    expect(nodeFileContainer).toBeDefined();
    expect(nodeFileContainer!.yaml).toContain("type: Container");

    db.close();
  });
});
