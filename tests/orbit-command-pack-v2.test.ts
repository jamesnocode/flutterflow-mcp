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

function adapterFactory(options?: { remoteValidateOk?: boolean; pushOk?: boolean }): FlutterFlowAdapter {
  const remoteValidateOk = options?.remoteValidateOk ?? true;
  const pushOk = options?.pushOk ?? true;
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
      return pushOk ? { ok: true } : { ok: false, message: "push failed" };
    },
    async remoteValidate() {
      return remoteValidateOk ? { ok: true } : { ok: false, message: "remote validation failed" };
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

function rateLimitedAdapterFactory(options: {
  failCountBeforeSuccess?: number;
  alwaysRateLimited?: boolean;
}): FlutterFlowAdapter {
  let pushCalls = 0;
  const failCountBeforeSuccess = options.failCountBeforeSuccess ?? 1;
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
      pushCalls += 1;
      if (options.alwaysRateLimited || pushCalls <= failCountBeforeSuccess) {
        return {
          ok: false,
          message:
            "FlutterFlow API request failed (429) | POST https://api.flutterflow.io/v2/updateProjectByYaml | rate_limit: retry later (retry-after=1s)"
        };
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
  return { db, snapshotRepo, indexRepo, orbit, reindex };
}

function seedSplitPages(snapshotRepo: SnapshotRepo, snapshotId: string): void {
  const loginPageYaml = "name: login\ndescription: \"\"\nnode:\n  key: Scaffold_xkz5zwqw\n";
  const loginTreeYaml = [
    "node:",
    "  key: Scaffold_xkz5zwqw",
    "  children:",
    "    - key: Column_parent",
    "      children:",
    "        - key: Text_a",
    "        - key: Button_b"
  ].join("\n");
  const loginScaffoldYaml = "key: Scaffold_xkz5zwqw\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";
  const loginColumnYaml = "key: Column_parent\ntype: Column\nprops: {}\nparameterValues: {}\n";
  const loginTextYaml = [
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
  const loginButtonYaml = [
    "key: Button_b",
    "type: Button",
    "name: SignInButton",
    "props:",
    "  button:",
    "    text:",
    "      textValue:",
    "        inputValue: Sign In",
    "parameterValues: {}"
  ].join("\n");

  const dashPageYaml = "name: DailyDashboard\ndescription: \"\"\nnode:\n  key: Scaffold_yjzz7f8n\n";
  const dashTreeYaml = "node:\n  key: Scaffold_yjzz7f8n\n";
  const dashNodeYaml = "key: Scaffold_yjzz7f8n\ntype: Scaffold\nprops: {}\nparameterValues: {}\n";

  snapshotRepo.upsertFiles(snapshotId, [
    { fileKey: "page/id-Scaffold_xkz5zwqw.yaml", yaml: loginPageYaml, sha256: sha256(loginPageYaml) },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline.yaml",
      yaml: loginTreeYaml,
      sha256: sha256(loginTreeYaml)
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Scaffold_xkz5zwqw.yaml",
      yaml: loginScaffoldYaml,
      sha256: sha256(loginScaffoldYaml)
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Column_parent.yaml",
      yaml: loginColumnYaml,
      sha256: sha256(loginColumnYaml)
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml",
      yaml: loginTextYaml,
      sha256: sha256(loginTextYaml)
    },
    {
      fileKey: "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b.yaml",
      yaml: loginButtonYaml,
      sha256: sha256(loginButtonYaml)
    },
    { fileKey: "page/id-Scaffold_yjzz7f8n.yaml", yaml: dashPageYaml, sha256: sha256(dashPageYaml) },
    {
      fileKey: "page/id-Scaffold_yjzz7f8n/page-widget-tree-outline.yaml",
      yaml: dashTreeYaml,
      sha256: sha256(dashTreeYaml)
    },
    {
      fileKey: "page/id-Scaffold_yjzz7f8n/page-widget-tree-outline/node/id-Scaffold_yjzz7f8n.yaml",
      yaml: dashNodeYaml,
      sha256: sha256(dashNodeYaml)
    }
  ]);
}

describe("next command pack", () => {
  it("implements widgets.find and keeps tree.find alias behavior", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "find-pack");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const canonical = await orbit.run({
      cmd: "widgets.find",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", type: "Text" }
    });
    expect(canonical.ok).toBe(true);
    const alias = await orbit.run({
      cmd: "tree.find",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", type: "Text" }
    });
    expect(alias.ok).toBe(true);
    const canonicalWidgets = (canonical.data as { widgets: Array<{ nodeId?: string }> }).widgets;
    const aliasWidgets = (alias.data as { widgets: Array<{ nodeId?: string }> }).widgets;
    expect(canonicalWidgets.map((row) => row.nodeId)).toEqual(aliasWidgets.map((row) => row.nodeId));

    db.close();
  });

  it("supports widget.getMany by nodeIds and by filter", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "get-many");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const byIds = await orbit.run({
      cmd: "widget.getMany",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeIds: ["id-Text_a", "id-Missing"] }
    });
    expect(byIds.ok).toBe(true);
    const idsData = byIds.data as {
      totalRequested: number;
      totalFound: number;
      missingNodeIds: string[];
      widgets: Array<{ nodeId?: string; node?: unknown }>;
    };
    expect(idsData.totalRequested).toBe(2);
    expect(idsData.totalFound).toBe(1);
    expect(idsData.missingNodeIds).toEqual(["id-Missing"]);
    expect(idsData.widgets[0]?.nodeId).toBe("id-Text_a");
    expect(idsData.widgets[0]?.node).toBeUndefined();

    const byFilter = await orbit.run({
      cmd: "widget.getMany",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", filter: { type: "Button" } }
    });
    expect(byFilter.ok).toBe(true);
    const filterData = byFilter.data as { widgets: Array<{ nodeId?: string; type?: string; node?: unknown }> };
    expect(filterData.widgets.length).toBe(1);
    expect(filterData.widgets[0]?.nodeId).toBe("id-Button_b");
    expect(filterData.widgets[0]?.type).toBe("Button");
    expect(filterData.widgets[0]?.node).toBeUndefined();

    db.close();
  });

  it("supports widget.bindAction upsert/delete in split mode and rejects non-split", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "bind-action");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const upsert = await orbit.run({
      cmd: "widget.bindAction",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Button_b",
        trigger: "ON_TAP",
        action: { navigate: { pageNodeKeyRef: { key: "Scaffold_yjzz7f8n" }, isNavigateBack: false } },
        apply: true,
        remoteValidate: false
      }
    });
    expect(upsert.ok).toBe(true);
    const triggerFile = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP.yaml"
    );
    expect(triggerFile).toBeDefined();
    expect(triggerFile!.yaml).toContain("triggerType: ON_TAP");

    const deleted = await orbit.run({
      cmd: "widget.bindAction",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Button_b",
        trigger: "ON_TAP",
        mode: "delete",
        apply: true,
        remoteValidate: false
      }
    });
    expect(deleted.ok).toBe(true);
    const triggerAfterDelete = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Button_b/trigger_actions/id-ON_TAP.yaml"
    );
    expect(triggerAfterDelete).toBeDefined();
    expect(triggerAfterDelete!.yaml).toBe("");

    const nonSplit = snapshotRepo.createSnapshot("proj_1", "bind-action-nonsplit");
    const pageYaml = "name: Onboarding\nwidgetTree:\n  - id: id-Button_x\n    type: Button\n";
    snapshotRepo.upsertFiles(nonSplit.snapshotId, [{ fileKey: "page/id-Scaffold_non_split.yaml", yaml: pageYaml, sha256: sha256(pageYaml) }]);
    const nonSplitRes = await orbit.run({
      cmd: "widget.bindAction",
      snapshot: nonSplit.snapshotId,
      args: {
        nameOrId: "Onboarding",
        nodeId: "id-Button_x",
        trigger: "ON_TAP",
        action: { navigate: { isNavigateBack: true } }
      }
    });
    expect(nonSplitRes.ok).toBe(false);
    expect((nonSplitRes.errors ?? []).join(" ")).toContain("split page-widget-tree-outline mode");

    db.close();
  });

  it("supports widget.bindData writes and mirror behavior", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "bind-data");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const bound = await orbit.run({
      cmd: "widget.bindData",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Text_a",
        key: "props.text.textValue.inputValue",
        binding: "James NC",
        apply: true,
        remoteValidate: false
      }
    });
    expect(bound.ok).toBe(true);
    const textNode = snapshotRepo.getFile(
      snapshot.snapshotId,
      "page/id-Scaffold_xkz5zwqw/page-widget-tree-outline/node/id-Text_a.yaml"
    );
    expect(textNode).toBeDefined();
    expect(textNode!.yaml).toContain("inputValue: James NC");
    expect(textNode!.yaml).toContain("mostRecentInputValue: James NC");

    db.close();
  });

  it("supports routes.upsert/routes.delete and keeps routes.list in sync", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "routes-pack");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const upsert = await orbit.run({
      cmd: "routes.upsert",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Button_b",
        toPageNameOrId: "DailyDashboard",
        apply: true,
        remoteValidate: false
      }
    });
    expect(upsert.ok).toBe(true);

    const listAfterUpsert = await orbit.run({ cmd: "routes.list", snapshot: snapshot.snapshotId, args: {} });
    expect(listAfterUpsert.ok).toBe(true);
    const routesAfterUpsert = (listAfterUpsert.data as { routes: Array<{ to: string }> }).routes;
    expect(routesAfterUpsert.some((edge) => edge.to.includes("id_scaffold_yjzz7f8n"))).toBe(true);

    const removed = await orbit.run({
      cmd: "routes.delete",
      snapshot: snapshot.snapshotId,
      args: {
        nameOrId: "login",
        nodeId: "id-Button_b",
        apply: true,
        remoteValidate: false
      }
    });
    expect(removed.ok).toBe(true);
    const listAfterDelete = await orbit.run({ cmd: "routes.list", snapshot: snapshot.snapshotId, args: {} });
    expect(listAfterDelete.ok).toBe(true);
    const routesAfterDelete = (listAfterDelete.data as { routes: Array<{ to: string }> }).routes;
    expect(routesAfterDelete.some((edge) => edge.to.includes("id_scaffold_yjzz7f8n"))).toBe(false);

    db.close();
  });

  it("supports changeset.applySafe happy path, retry path, and fallback payload", async () => {
    const happy = await buildOrbit(adapterFactory({ remoteValidateOk: true, pushOk: true }));
    const snapshot1 = happy.snapshotRepo.createSnapshot("proj_1", "safe-happy");
    seedSplitPages(happy.snapshotRepo, snapshot1.snapshotId);
    await happy.reindex(snapshot1.snapshotId);
    const staged1 = await happy.orbit.run({
      cmd: "widget.set",
      snapshot: snapshot1.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "Happy", preview: true, apply: false }
    });
    expect(staged1.ok).toBe(true);
    const safe1 = await happy.orbit.run({
      cmd: "changeset.applySafe",
      snapshot: snapshot1.snapshotId,
      args: { changesetId: (staged1.data as { changesetId: string }).changesetId, confirm: true, remoteValidate: true }
    });
    expect(safe1.ok).toBe(true);
    const safe1Data = safe1.data as { applied: boolean; attempts: Array<{ remoteValidate: boolean; applied: boolean }> };
    expect(safe1Data.applied).toBe(true);
    expect(safe1Data.attempts.length).toBe(1);
    happy.db.close();

    const retry = await buildOrbit(adapterFactory({ remoteValidateOk: false, pushOk: true }));
    const snapshot2 = retry.snapshotRepo.createSnapshot("proj_1", "safe-retry");
    seedSplitPages(retry.snapshotRepo, snapshot2.snapshotId);
    await retry.reindex(snapshot2.snapshotId);
    const staged2 = await retry.orbit.run({
      cmd: "widget.set",
      snapshot: snapshot2.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "Retry", preview: true, apply: false }
    });
    expect(staged2.ok).toBe(true);
    const safe2 = await retry.orbit.run({
      cmd: "changeset.applySafe",
      snapshot: snapshot2.snapshotId,
      args: { changesetId: (staged2.data as { changesetId: string }).changesetId, confirm: true, remoteValidate: true }
    });
    expect(safe2.ok).toBe(true);
    const safe2Data = safe2.data as { applied: boolean; attempts: Array<{ remoteValidate: boolean; applied: boolean }> };
    expect(safe2Data.applied).toBe(true);
    expect(safe2Data.attempts.length).toBe(2);
    expect(safe2Data.attempts[0]?.remoteValidate).toBe(true);
    expect(safe2Data.attempts[1]?.remoteValidate).toBe(false);
    retry.db.close();

    const failed = await buildOrbit(adapterFactory({ remoteValidateOk: true, pushOk: false }));
    const snapshot3 = failed.snapshotRepo.createSnapshot("proj_1", "safe-fail");
    seedSplitPages(failed.snapshotRepo, snapshot3.snapshotId);
    await failed.reindex(snapshot3.snapshotId);
    const staged3 = await failed.orbit.run({
      cmd: "widget.set",
      snapshot: snapshot3.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "Fail", preview: true, apply: false }
    });
    expect(staged3.ok).toBe(true);
    const safe3 = await failed.orbit.run({
      cmd: "changeset.applySafe",
      snapshot: snapshot3.snapshotId,
      args: {
        changesetId: (staged3.data as { changesetId: string }).changesetId,
        confirm: true,
        remoteValidate: false,
        exportOnFailure: true
      }
    });
    expect(safe3.ok).toBe(true);
    const safe3Data = safe3.data as { applied: boolean; manualPayload?: unknown };
    expect(safe3Data.applied).toBe(false);
    expect(safe3Data.manualPayload).toBeDefined();
    failed.db.close();
  });

  it("retries changeset.applySafe on rate limits and succeeds", async () => {
    const rateLimited = await buildOrbit(rateLimitedAdapterFactory({ failCountBeforeSuccess: 1 }));
    const snapshot = rateLimited.snapshotRepo.createSnapshot("proj_1", "safe-rate-limit-retry");
    seedSplitPages(rateLimited.snapshotRepo, snapshot.snapshotId);
    await rateLimited.reindex(snapshot.snapshotId);

    const staged = await rateLimited.orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "RateRetry", preview: true, apply: false }
    });
    expect(staged.ok).toBe(true);

    const safe = await rateLimited.orbit.run({
      cmd: "changeset.applySafe",
      snapshot: snapshot.snapshotId,
      args: {
        changesetId: (staged.data as { changesetId: string }).changesetId,
        confirm: true,
        remoteValidate: false,
        rateLimitRetries: 1,
        rateLimitBaseMs: 250,
        rateLimitMaxWaitMs: 1000
      }
    });

    expect(safe.ok).toBe(true);
    const data = safe.data as {
      applied: boolean;
      rateLimited?: boolean;
      attempts: Array<{ phase?: string; waitMs?: number; applied: boolean }>;
    };
    expect(data.applied).toBe(true);
    expect(data.rateLimited).toBe(false);
    expect(data.attempts.some((attempt) => attempt.phase === "rate-limit-retry")).toBe(true);
    rateLimited.db.close();
  });

  it("returns retry guidance when changeset.applySafe remains rate-limited", async () => {
    const rateLimited = await buildOrbit(rateLimitedAdapterFactory({ alwaysRateLimited: true }));
    const snapshot = rateLimited.snapshotRepo.createSnapshot("proj_1", "safe-rate-limit-fail");
    seedSplitPages(rateLimited.snapshotRepo, snapshot.snapshotId);
    await rateLimited.reindex(snapshot.snapshotId);

    const staged = await rateLimited.orbit.run({
      cmd: "widget.set",
      snapshot: snapshot.snapshotId,
      args: { nameOrId: "login", nodeId: "id-Text_a", text: "RateFail", preview: true, apply: false }
    });
    expect(staged.ok).toBe(true);

    const safe = await rateLimited.orbit.run({
      cmd: "changeset.applySafe",
      snapshot: snapshot.snapshotId,
      args: {
        changesetId: (staged.data as { changesetId: string }).changesetId,
        confirm: true,
        remoteValidate: false,
        rateLimitRetries: 0
      }
    });

    expect(safe.ok).toBe(true);
    const data = safe.data as { applied: boolean; rateLimited?: boolean; nextRetryAt?: string };
    expect(data.applied).toBe(false);
    expect(data.rateLimited).toBe(true);
    expect(typeof data.nextRetryAt).toBe("string");
    rateLimited.db.close();
  });

  it("extends intent.run deterministic mappings for new commands", async () => {
    const { db, snapshotRepo, orbit, reindex } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "intent-pack");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);
    await reindex(snapshot.snapshotId);

    const findIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "find widgets on login" }
    });
    expect(findIntent.ok).toBe(true);
    expect((findIntent.data as { mappedCommand?: string }).mappedCommand).toBe("widgets.find");

    const routeIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "route id-Button_b to DailyDashboard on login" }
    });
    expect(routeIntent.ok).toBe(true);
    expect((routeIntent.data as { mappedCommand?: string }).mappedCommand).toBe("routes.upsert");

    const deleteRouteIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "remove route id-Button_b on login" }
    });
    expect(deleteRouteIntent.ok).toBe(true);
    expect((deleteRouteIntent.data as { mappedCommand?: string }).mappedCommand).toBe("routes.delete");

    const scaffoldIntent = await orbit.run({
      cmd: "intent.run",
      snapshot: snapshot.snapshotId,
      args: { text: "create a settings page called preferences", ensureFresh: false }
    });
    expect(scaffoldIntent.ok).toBe(true);
    expect((scaffoldIntent.data as { mappedCommand?: string }).mappedCommand).toBe("page.scaffold");
    const scaffoldArgs = (scaffoldIntent.data as { mappedArgs?: { recipe?: string; name?: string } }).mappedArgs;
    expect(scaffoldArgs?.recipe).toBe("settings.basic");
    expect(scaffoldArgs?.name).toBe("preferences");

    db.close();
  });

  it("exposes command-specific help for new commands", async () => {
    const { db, snapshotRepo, orbit } = await buildOrbit(adapterFactory());
    const snapshot = snapshotRepo.createSnapshot("proj_1", "help-pack");
    seedSplitPages(snapshotRepo, snapshot.snapshotId);

    const commands = ["widgets.find", "widget.getMany", "widget.bindAction", "widget.bindData", "routes.upsert", "routes.delete", "changeset.applySafe"];
    for (const cmd of commands) {
      const res = await orbit.run({ cmd: "help", snapshot: snapshot.snapshotId, args: { cmd } });
      expect(res.ok).toBe(true);
      const data = res.data as { cmd?: string; summary?: string };
      expect(data.cmd).toBe(cmd);
      expect(typeof data.summary).toBe("string");
    }

    db.close();
  });
});
