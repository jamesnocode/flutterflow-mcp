import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { ChangesetService } from "../src/edits/changesets.js";
import type { FileUpdate, PushResult } from "../src/types.js";
import { sha256 } from "../src/util/hash.js";

class MockAdapter {
  updates: FileUpdate[] = [];
  remoteValidationOk = true;

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
    return this.remoteValidationOk ? { ok: true } : { ok: false, message: "validation blocked" };
  }

  async pushFiles(_projectId: string, updates: FileUpdate[]): Promise<PushResult> {
    this.updates = updates;
    return { ok: true };
  }
}

describe("ChangesetService", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0, dirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds a preview diff and line counts", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbit-test-"));
    dirs.push(dir);
    process.env.ORBIT_POLICY_FILE = path.join(dir, "orbit.policy.json");
    const db = openOrbitDb({ dbPath: path.join(dir, "orbit.sqlite") });
    const snapshots = new SnapshotRepo(db);
    const policy = new PolicyEngine();
    await policy.setPolicy({
      allowProjects: ["*"],
      allowFileKeyPrefixes: [],
      denyFileKeyPrefixes: ["lib/custom_code/", "lib/main.dart"],
      maxFilesPerApply: 8,
      maxLinesChanged: 200,
      requireManualApproval: false,
      allowPlatformConfigEdits: false,
      safeMode: "fullWrite"
    });

    const adapter = new MockAdapter();
    const changesets = new ChangesetService(db, snapshots, policy, adapter, async () => undefined);

    const snapshot = snapshots.createSnapshot("proj_1", "base");
    const yaml = "page:\n  name: Home\n";
    snapshots.upsertFiles(snapshot.snapshotId, [{ fileKey: "lib/pages/home.yaml", yaml, sha256: sha256(yaml) }]);

    const changeset = changesets.newChangeset(snapshot.snapshotId, "Rename Home", "Update page name");
    changesets.addEntry(changeset.changesetId, "lib/pages/home.yaml", {
      type: "jsonpath",
      selector: "$.page.name",
      value: "HomeV2"
    });

    const preview = changesets.preview(changeset.changesetId);

    expect(preview.files).toHaveLength(1);
    expect(preview.files[0].diff).toContain("HomeV2");
    expect(preview.impact.linesChanged).toBeGreaterThan(0);

    db.close();
    delete process.env.ORBIT_POLICY_FILE;
  });

  it("can apply with remote validation disabled", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbit-test-"));
    dirs.push(dir);
    process.env.ORBIT_POLICY_FILE = path.join(dir, "orbit.policy.json");
    const db = openOrbitDb({ dbPath: path.join(dir, "orbit.sqlite") });
    const snapshots = new SnapshotRepo(db);
    const policy = new PolicyEngine();
    await policy.setPolicy({
      allowProjects: ["*"],
      allowFileKeyPrefixes: [],
      denyFileKeyPrefixes: ["lib/custom_code/", "lib/main.dart"],
      maxFilesPerApply: 8,
      maxLinesChanged: 200,
      requireManualApproval: false,
      allowPlatformConfigEdits: false,
      safeMode: "fullWrite"
    });

    const adapter = new MockAdapter();
    adapter.remoteValidationOk = false;
    const changesets = new ChangesetService(db, snapshots, policy, adapter, async () => undefined);

    const snapshot = snapshots.createSnapshot("proj_1", "base");
    const yaml = "page:\n  name: Home\n";
    snapshots.upsertFiles(snapshot.snapshotId, [{ fileKey: "lib/pages/home.yaml", yaml, sha256: sha256(yaml) }]);

    const changeset = changesets.newChangeset(snapshot.snapshotId, "Rename Home", "Update page name");
    changesets.addEntry(changeset.changesetId, "lib/pages/home.yaml", {
      type: "jsonpath",
      selector: "$.page.name",
      value: "HomeV2"
    });

    const result = await changesets.apply(changeset.changesetId, true, { remoteValidate: false });
    expect(result.applied).toBe(true);
    expect(adapter.updates[0]?.yaml).toContain("HomeV2");

    db.close();
    delete process.env.ORBIT_POLICY_FILE;
  });
});
