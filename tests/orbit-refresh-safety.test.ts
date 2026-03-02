import { describe, expect, it } from "vitest";
import { openOrbitDb } from "../src/store/db.js";
import { SnapshotRepo } from "../src/store/snapshotRepo.js";
import { IndexRepo } from "../src/store/indexRepo.js";
import { OrbitCommandPalette } from "../src/mcp/orbitTool.js";
import { ChangesetService } from "../src/edits/changesets.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { FlutterFlowAdapter } from "../src/ff/adapter.js";
import { FlutterFlowApiError } from "../src/ff/errors.js";
import { sha256 } from "../src/util/hash.js";

function buildOrbit(adapter: FlutterFlowAdapter) {
  const db = openOrbitDb({ dbPath: ":memory:" });
  const snapshotRepo = new SnapshotRepo(db);
  const indexRepo = new IndexRepo(db);
  const policy = new PolicyEngine();
  const changesets = new ChangesetService(db, snapshotRepo, policy, adapter, async () => {});
  const orbit = new OrbitCommandPalette(adapter, snapshotRepo, indexRepo, changesets, policy);
  return { db, snapshotRepo, orbit };
}

describe("orbit snapshots.refresh safety", () => {
  it("does not prune snapshot files after partial full refresh failures", async () => {
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return ["page/id-Scaffold_1", "page/id-Scaffold_2"];
      },
      async fetchFile(_projectId, fileKey) {
        if (fileKey === "page/id-Scaffold_2") {
          throw new Error("429");
        }
        return "pageName: New One\n";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        return {
          files: [{ fileKey: "page/id-Scaffold_1" }, { fileKey: "page/id-Scaffold_2" }]
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-safe");
    const yaml1 = "pageName: Old One\n";
    const yaml2 = "pageName: Old Two\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_1.yaml", yaml: yaml1, sha256: sha256(yaml1) },
      { fileKey: "page/id-Scaffold_2.yaml", yaml: yaml2, sha256: sha256(yaml2) }
    ]);

    const result = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "full" }
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("Skipped pruning missing files"))).toBe(true);
    const files = snapshotRepo.listFiles(snapshot.snapshotId, "page/", 10_000).map((file) => file.fileKey);
    expect(files).toContain("page/id-Scaffold_2.yaml");
    expect(files).toContain("page/id-Scaffold_1.yaml");
    db.close();
  });

  it("respects maxFetch budget for snapshots.refresh", async () => {
    const remoteFiles: Record<string, string> = {
      "page/id-Scaffold_1.yaml": "pageName: One\n",
      "page/id-Scaffold_2.yaml": "pageName: Two\n",
      "page/id-Scaffold_3.yaml": "pageName: Three\n"
    };
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }));
      },
      async fetchFile(_projectId, fileKey) {
        return remoteFiles[fileKey] ?? "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        return {
          files: Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }))
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-budgeted");
    const result = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "incremental", maxFetch: 1, concurrency: 1 }
    });

    expect(result.ok).toBe(true);
    const data = result.data as { attemptedFetchCount: number; fetchedCount: number };
    expect(data.attemptedFetchCount).toBe(1);
    expect(data.fetchedCount).toBe(1);
    expect(snapshotRepo.countFiles(snapshot.snapshotId)).toBe(1);
    db.close();
  });

  it("snapshots.refreshSlow crawls in incremental batches", async () => {
    const remoteFiles: Record<string, string> = {
      "page/id-Scaffold_1.yaml": "pageName: One\n",
      "page/id-Scaffold_2.yaml": "pageName: Two\n",
      "page/id-Scaffold_3.yaml": "pageName: Three\n"
    };
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }));
      },
      async fetchFile(_projectId, fileKey) {
        return remoteFiles[fileKey] ?? "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        return {
          files: Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }))
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-slow");
    const result = await orbit.run({
      cmd: "snapshots.refreshSlow",
      snapshot: snapshot.snapshotId,
      args: { passes: 5, pauseMs: 0, maxFetch: 1, concurrency: 1, sleepMs: 0 }
    });

    expect(result.ok).toBe(true);
    const data = result.data as { passesCompleted: number; totalFetchedCount: number };
    expect(data.totalFetchedCount).toBe(3);
    expect(data.passesCompleted).toBeGreaterThan(1);
    expect(snapshotRepo.countFiles(snapshot.snapshotId)).toBe(3);
    db.close();
  });

  it("defaults full file refresh to chunked session mode without relisting every pass", async () => {
    const remoteFiles: Record<string, string> = {
      "page/id-Scaffold_1.yaml": "pageName: One\n",
      "page/id-Scaffold_2.yaml": "pageName: Two\n",
      "page/id-Scaffold_3.yaml": "pageName: Three\n"
    };
    let listCalls = 0;
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }));
      },
      async fetchFile(_projectId, fileKey) {
        return remoteFiles[fileKey] ?? "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        listCalls += 1;
        return {
          files: Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }))
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-full-chunked");

    const first = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "full", fetchStrategy: "file", maxFetch: 1, concurrency: 1, sleepMs: 0 }
    });
    expect(first.ok).toBe(true);
    const firstData = first.data as {
      authoritative: boolean;
      chunkSession?: { sessionId: string; remainingFetchCount: number; completed: boolean };
    };
    expect(firstData.authoritative).toBe(false);
    expect(firstData.chunkSession?.remainingFetchCount).toBe(2);

    const second = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: {
        mode: "full",
        fetchStrategy: "file",
        chunkSessionId: firstData.chunkSession?.sessionId,
        maxFetch: 1,
        concurrency: 1,
        sleepMs: 0
      }
    });
    expect(second.ok).toBe(true);
    const secondData = second.data as { chunkSession?: { remainingFetchCount: number } };
    expect(secondData.chunkSession?.remainingFetchCount).toBe(1);

    const third = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: {
        mode: "full",
        fetchStrategy: "file",
        chunkSessionId: firstData.chunkSession?.sessionId,
        maxFetch: 1,
        concurrency: 1,
        sleepMs: 0
      }
    });
    expect(third.ok).toBe(true);
    const thirdData = third.data as {
      authoritative: boolean;
      pruneApplied: boolean;
      chunkSession?: { remainingFetchCount: number; completed: boolean };
    };
    expect(thirdData.authoritative).toBe(true);
    expect(thirdData.pruneApplied).toBe(true);
    expect(thirdData.chunkSession?.completed).toBe(true);
    expect(thirdData.chunkSession?.remainingFetchCount).toBe(0);
    expect(snapshotRepo.countFiles(snapshot.snapshotId)).toBe(3);
    expect(listCalls).toBe(1);
    db.close();
  });

  it("can reset chunked full refresh session and relist", async () => {
    const remoteFiles: Record<string, string> = {
      "page/id-Scaffold_1.yaml": "pageName: One\n",
      "page/id-Scaffold_2.yaml": "pageName: Two\n"
    };
    let listCalls = 0;
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }));
      },
      async fetchFile(_projectId, fileKey) {
        return remoteFiles[fileKey] ?? "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        listCalls += 1;
        return {
          files: Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }))
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-full-chunked-reset");

    const first = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "full", fetchStrategy: "file", maxFetch: 1, concurrency: 1, sleepMs: 0 }
    });
    expect(first.ok).toBe(true);
    expect(listCalls).toBe(1);

    const second = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: {
        mode: "full",
        fetchStrategy: "file",
        chunkedFull: true,
        resetChunkSession: true,
        maxFetch: 1,
        concurrency: 1,
        sleepMs: 0
      }
    });
    expect(second.ok).toBe(true);
    expect(listCalls).toBe(2);
    db.close();
  });

  it("retries listPartitionedFileNames on 429 before failing refresh", async () => {
    const remoteFiles: Record<string, string> = {
      "page/id-Scaffold_1.yaml": "pageName: One\n"
    };
    let listCalls = 0;
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }));
      },
      async fetchFile(_projectId, fileKey) {
        return remoteFiles[fileKey] ?? "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        listCalls += 1;
        if (listCalls === 1) {
          throw new FlutterFlowApiError("rate limited", 429, "", {
            method: "GET",
            url: "https://api.flutterflow.io/v2/listPartitionedFileNames",
            retryAfter: "0"
          });
        }
        return {
          files: Object.keys(remoteFiles).map((fileKey) => ({ fileKey, hash: sha256(remoteFiles[fileKey] ?? "") }))
        };
      },
      async fetchProjectYamls() {
        return { files: {} };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-retry");
    const result = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "incremental", listRetries: 1, listRetryBaseMs: 1 }
    });

    expect(result.ok).toBe(true);
    expect(listCalls).toBe(2);
    expect(result.warnings.some((warning) => warning.includes("Rate limited on listPartitionedFileNames"))).toBe(true);
    db.close();
  });

  it("uses bulk projectYamls for full refresh and can prune missing files", async () => {
    let bulkCalls = 0;
    let fetchCalls = 0;
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return [
          { fileKey: "page/id-Scaffold_1.yaml", hash: sha256("pageName: One\n") },
          { fileKey: "page/id-Scaffold_2.yaml", hash: sha256("pageName: Two\n") }
        ];
      },
      async fetchFile() {
        fetchCalls += 1;
        return "";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        return {
          files: [
            { fileKey: "page/id-Scaffold_1.yaml", hash: sha256("pageName: One\n") },
            { fileKey: "page/id-Scaffold_2.yaml", hash: sha256("pageName: Two\n") }
          ]
        };
      },
      async fetchProjectYamls() {
        bulkCalls += 1;
        return {
          files: {
            "page/id-Scaffold_1.yaml": "pageName: One\n",
            "page/id-Scaffold_2.yaml": "pageName: Two\n"
          }
        };
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-full-bulk");
    const stale = "pageName: Legacy\n";
    snapshotRepo.upsertFiles(snapshot.snapshotId, [
      { fileKey: "page/id-Scaffold_legacy.yaml", yaml: stale, sha256: sha256(stale) }
    ]);

    const result = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "full", fetchStrategy: "bulk" }
    });

    expect(result.ok).toBe(true);
    const data = result.data as { strategyUsed: string; pruneApplied: boolean; authoritative: boolean };
    expect(data.strategyUsed).toBe("bulk");
    expect(data.pruneApplied).toBe(true);
    expect(data.authoritative).toBe(true);
    expect(bulkCalls).toBe(1);
    expect(fetchCalls).toBe(0);
    expect(snapshotRepo.listFiles(snapshot.snapshotId, "page/", 10_000).map((file) => file.fileKey)).toEqual([
      "page/id-Scaffold_1.yaml",
      "page/id-Scaffold_2.yaml"
    ]);
    db.close();
  });

  it("falls back from bulk full refresh to per-file mode when bulk fails", async () => {
    let bulkCalls = 0;
    let fetchCalls = 0;
    const adapter: FlutterFlowAdapter = {
      async listProjects() {
        return [];
      },
      async listFileKeys() {
        return [
          { fileKey: "page/id-Scaffold_1.yaml", hash: sha256("pageName: One\n") },
          { fileKey: "page/id-Scaffold_2.yaml", hash: sha256("pageName: Two\n") }
        ];
      },
      async fetchFile(_projectId, fileKey) {
        fetchCalls += 1;
        if (fileKey.endsWith("_2.yaml")) {
          throw new Error("429");
        }
        return "pageName: One\n";
      },
      async pushFiles() {
        return { ok: true };
      },
      async remoteValidate() {
        return { ok: true };
      },
      async listPartitionedFileNames() {
        return {
          files: [
            { fileKey: "page/id-Scaffold_1.yaml", hash: sha256("pageName: One\n") },
            { fileKey: "page/id-Scaffold_2.yaml", hash: sha256("pageName: Two\n") }
          ]
        };
      },
      async fetchProjectYamls() {
        bulkCalls += 1;
        throw new FlutterFlowApiError("rate limited", 429, "", {
          method: "GET",
          url: "https://api.flutterflow.io/v2/projectYamls",
          retryAfter: "0"
        });
      },
      async validateProjectYaml() {
        return { ok: true };
      }
    };

    const { db, snapshotRepo, orbit } = buildOrbit(adapter);
    const snapshot = snapshotRepo.createSnapshot("proj_1", "refresh-full-bulk-fallback");
    const result = await orbit.run({
      cmd: "snapshots.refresh",
      snapshot: snapshot.snapshotId,
      args: { mode: "full", fetchStrategy: "bulk", maxFetch: 20, concurrency: 1 }
    });

    expect(result.ok).toBe(true);
    const data = result.data as { strategyUsed: string; partial: boolean; authoritative: boolean; pruneApplied: boolean };
    expect(data.strategyUsed).toBe("file");
    expect(data.partial).toBe(true);
    expect(data.authoritative).toBe(false);
    expect(data.pruneApplied).toBe(false);
    expect(bulkCalls).toBe(1);
    expect(fetchCalls).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("Bulk projectYamls fetch failed"))).toBe(true);
    db.close();
  });
});
