import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { extractSnapshotIndex } from "../src/indexer/extract.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import { sha256 } from "../src/util/hash.js";
import { validateScaffoldTree } from "../src/mcp/scaffoldValidator.js";

function adapterFactory(): FlutterFlowAdapter {
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

async function buildOrbit(adapter: FlutterFlowAdapter) {
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
  return { db, snapshotRepo, orbit, reindex };
}

function seedExistingPage(snapshotRepo: SnapshotRepo, snapshotId: string, pageId: string, name: string): void {
  const pageYaml = YAML.stringify({
    name,
    description: "",
    node: {
      key: pageId.replace(/^id-/, ""),
      classModel: {}
    }
  }, { lineWidth: 0 });
  snapshotRepo.upsertFiles(snapshotId, [{ fileKey: `page/${pageId}.yaml`, yaml: pageYaml, sha256: sha256(pageYaml) }]);
}

function collectTreeRelations(node: Record<string, unknown>, parentKey?: string, out: Map<string, string>) {
  const key = typeof node.key === "string" ? node.key : "";
  if (key && parentKey) {
    out.set(key, parentKey);
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectTreeRelations(child as Record<string, unknown>, key || parentKey, out);
    }
  }
  const body = node.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    collectTreeRelations(body as Record<string, unknown>, key || parentKey, out);
  }
}

describe("page.scaffold recipe engine", () => {
  it("creates auth.login scaffold files and applies successfully", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-apply");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "login2",
        pageId: "id-Scaffold_login2",
        recipe: "auth.login",
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);
    const data = res.data as {
      state: string;
      page: { pageId: string; fileKey: string };
      generated: { filesCreated: number; nodeCount: number };
      applyResult?: { applied?: boolean };
    };
    expect(data.state).toBe("applied");
    expect(data.applyResult?.applied).toBe(true);
    expect(data.generated.filesCreated).toBeGreaterThanOrEqual(4);
    expect(data.generated.nodeCount).toBeGreaterThan(1);

    const pageFile = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_login2.yaml");
    const treeFile = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_login2/page-widget-tree-outline.yaml");
    const scaffoldNode = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_login2/page-widget-tree-outline/node/id-Scaffold_login2.yaml"
    );
    expect(pageFile).toBeDefined();
    expect(treeFile).toBeDefined();
    expect(scaffoldNode).toBeDefined();

    await reindex(snapshot.snapshotId);
    const pageGet = await orbit.run({
      cmd: "page.get",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login2" }
    });
    expect(pageGet.ok).toBe(true);

    db.close();
  });

  it("is preview-first by default and stages changes only", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-preview");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "signup2",
        pageId: "id-Scaffold_signup2",
        recipe: "auth.signup"
      }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { state: string; page: { pageId: string }; preview?: unknown; applyResult?: unknown };
    expect(data.state).toBe("staged");
    expect(data.preview).toBeDefined();
    expect(data.applyResult).toBeUndefined();

    const pageFile = snapshotRepo.getFile(snapshot.snapshotId, `page/${data.page.pageId}.yaml`);
    expect(pageFile).toBeUndefined();

    db.close();
  });

  it("supports settings.basic recipe without layout validation failure", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-settings");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "settings2",
        pageId: "id-Scaffold_settings2",
        recipe: "settings.basic",
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { state: string; applyResult?: { applied?: boolean } };
    expect(data.state).toBe("applied");
    expect(data.applyResult?.applied).toBe(true);

    db.close();
  });

  it("returns SCAFFOLD_PAGE_EXISTS when page id or name collides", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-collision");
    seedExistingPage(snapshotRepo, snapshot.snapshotId, "id-Scaffold_existing", "login2");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "login2",
        recipe: "auth.login"
      }
    });
    expect(res.ok).toBe(false);
    expect((res.errors ?? []).join(" ")).toContain("SCAFFOLD_PAGE_EXISTS");

    db.close();
  });

  it("does not create trigger action files when wireActions is false", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-no-actions");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "loginNoAction",
        pageId: "id-Scaffold_loginNoAction",
        recipe: "auth.login",
        wireActions: false,
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);
    const files = snapshotRepo.listFiles(snapshot.snapshotId, "page/id-Scaffold_loginNoAction/", 10_000);
    expect(files.some((file) => file.fileKey.includes("/trigger_actions/"))).toBe(false);

    db.close();
  });

  it("creates trigger action files when wireActions is true on supported recipe", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-actions");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "loginAction",
        pageId: "id-Scaffold_loginAction",
        recipe: "auth.login",
        wireActions: true,
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);
    const files = snapshotRepo.listFiles(snapshot.snapshotId, "page/id-Scaffold_loginAction/", 10_000);
    expect(files.some((file) => file.fileKey.endsWith("/trigger_actions/id-ON_TAP.yaml"))).toBe(true);
    expect(files.some((file) => /\/trigger_actions\/id-ON_TAP\/action\/id-ACTION_/i.test(file.fileKey))).toBe(true);

    db.close();
  });

  it("validator rejects Expanded under SingleChildScrollView", () => {
    const validation = validateScaffoldTree({
      recipe: "auth.login",
      requiredRoles: ["primaryCta"],
      children: [
        {
          type: "SingleChildScrollView",
          children: [
            {
              type: "Expanded",
              meta: { role: "primaryCta" },
              children: [{ type: "Text" }]
            }
          ]
        }
      ]
    });
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "layout.expanded_under_scroll")).toBe(true);
  });

  it("list.cards.search keeps ListView under an Expanded ancestor", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-list");

    const res = await orbit.run({
      cmd: "page.scaffold",
      snapshot: snapshot.snapshotId,
      args: {
        name: "products",
        pageId: "id-Scaffold_products",
        recipe: "list.cards.search",
        apply: true,
        remoteValidate: false
      }
    });
    expect(res.ok).toBe(true);

    const treeFile = snapshotRepo.getFile(snapshot.snapshotId, "page/id-Scaffold_products/page-widget-tree-outline.yaml");
    expect(treeFile).toBeDefined();
    const treeDoc = YAML.parse(treeFile!.yaml) as { node?: Record<string, unknown> };
    const parentByKey = new Map<string, string>();
    if (treeDoc.node) {
      collectTreeRelations(treeDoc.node, undefined, parentByKey);
    }

    const nodeFiles = snapshotRepo.listFiles(snapshot.snapshotId, "page/id-Scaffold_products/page-widget-tree-outline/node/", 10_000);
    const typeByKey = new Map<string, string>();
    for (const file of nodeFiles) {
      const doc = YAML.parse(file.yaml) as { key?: string; type?: string };
      if (typeof doc.key === "string" && typeof doc.type === "string") {
        typeByKey.set(doc.key, doc.type);
      }
    }

    const listViewKey = [...typeByKey.entries()].find((entry) => entry[1] === "ListView")?.[0];
    expect(listViewKey).toBeTruthy();
    const parentKey = listViewKey ? parentByKey.get(listViewKey) : undefined;
    expect(parentKey).toBeTruthy();
    expect(parentKey ? typeByKey.get(parentKey) : undefined).toBe("Expanded");

    db.close();
  });

  it("intent.run maps create prompts to page.scaffold", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-intent");

    const res = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: {
        text: "create a login page called login3 with email and password and sign in",
        ensureFresh: false,
        preview: true
      }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { mappedCommand?: string; mappedArgs?: { recipe?: string; name?: string }; resultOk?: boolean };
    expect(data.mappedCommand).toBe("page.scaffold");
    expect(data.mappedArgs?.recipe).toBe("auth.login");
    expect(data.mappedArgs?.name).toBe("login3");
    expect(data.resultOk).toBe(true);

    db.close();
  });

  it("intent.run returns clarify payload when scaffold recipe/name is missing", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-intent-clarify");

    const res = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: {
        text: "create page",
        ensureFresh: false
      }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { clarify?: { message?: string }; mappedCommand?: string };
    expect(data.mappedCommand).toBeUndefined();
    expect(data.clarify?.message).toContain("Missing scaffold details");

    db.close();
  });

  it("help returns command-specific docs for page.scaffold", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "scaffold-help");

    const res = await orbit.run({
      cmd: "help",
      snapshot: snapshot.snapshotId,
      args: { cmd: "page.scaffold" }
    });
    expect(res.ok).toBe(true);
    const data = res.data as { cmd?: string; summary?: string; args?: Record<string, string> };
    expect(data.cmd).toBe("page.scaffold");
    expect(typeof data.summary).toBe("string");
    expect(data.args?.recipe).toContain("required recipe id");

    db.close();
  });
});
