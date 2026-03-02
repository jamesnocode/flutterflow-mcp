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

describe("textfields.list and widgets.list type/include", () => {
  it("returns textfields quickly with extracted display fields", async () => {
    const db = openOrbitDb({ dbPath: ":memory:" });
    const snapshotRepo = new SnapshotRepo(db);
    const indexRepo = new IndexRepo(db);
    const policy = new PolicyEngine();
    await policy.reload();
    const changesets = new ChangesetService(db, snapshotRepo, policy, fakeAdapter(), async () => {});
    const orbit = new OrbitCommandPalette(fakeAdapter(), snapshotRepo, indexRepo, changesets, policy);

    const snapshot = snapshotRepo.createSnapshot("proj_1", "textfields");
    const pageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
    const treeYaml = [
      "node:",
      "  key: Scaffold_xkz5zwqw",
      "  body:",
      "    key: Column_abc",
      "    children:",
      "      - key: TextField_email",
      "      - key: TextField_password",
      "      - key: Button_signin"
    ].join("\n");
    const tfEmail = [
      "key: TextField_email",
      "type: TextField",
      "name: emailAddress",
      "props:",
      "  label:",
      "    textValue:",
      "      inputValue: Email",
      "  passwordField: false"
    ].join("\n");
    const tfPassword = [
      "key: TextField_password",
      "type: TextField",
      "name: password",
      "props:",
      "  label:",
      "    textValue:",
      "      inputValue: Password",
      "  passwordField: true"
    ].join("\n");
    const button = [
      "key: Button_signin",
      "type: Button",
      "name: signin",
      "props:",
      "  button:",
      "    text:",
      "      textValue:",
      "        inputValue: Sign In"
    ].join("\n");

    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: pageYaml, sha256: sha256(pageYaml) },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
        yaml: treeYaml,
        sha256: sha256(treeYaml)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-TextField_email.yaml",
        yaml: tfEmail,
        sha256: sha256(tfEmail)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-TextField_password.yaml",
        yaml: tfPassword,
        sha256: sha256(tfPassword)
      },
      {
        fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_signin.yaml",
        yaml: button,
        sha256: sha256(button)
      }
    ]);

    const typedList = await orbit.run({
      cmd: "widgets.list",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        type: "TextField",
        include: ["label", "passwordField"]
      }
    });
    expect(typedList.ok).toBe(true);
    const typedData = typedList.data as { totalWidgets: number; widgets: Array<{ type?: string; display?: Record<string, unknown> }> };
    expect(typedData.totalWidgets).toBe(2);
    expect(typedData.widgets.every((widget) => widget.type === "TextField")).toBe(true);
    expect(typedData.widgets.some((widget) => widget.display?.label === "Email")).toBe(true);
    expect(typedData.widgets.some((widget) => widget.display?.passwordField === true)).toBe(true);

    const textfields = await orbit.run({
      cmd: "textfields.list",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login" }
    });
    expect(textfields.ok).toBe(true);
    const data = textfields.data as { totalTextFields: number; textFields: Array<{ label?: string; passwordField?: boolean }> };
    expect(data.totalTextFields).toBe(2);
    expect(data.textFields.some((field) => field.label === "Email")).toBe(true);
    expect(data.textFields.some((field) => field.label === "Password" && field.passwordField === true)).toBe(true);

    db.close();
  });
});
