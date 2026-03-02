import { isSnapshotStale } from "../util/time.js";
import type { SnapshotRepo } from "../store/snapshotRepo.js";
import type { FlutterFlowAdapter } from "../ff/adapter.js";

export function parseStaleMinutes(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number.parseInt(process.env.ORBIT_SNAPSHOT_STALE_MINUTES ?? "30", 10) || 30;
}

export function isSnapshotLikelyIncomplete(snapshotRepo: SnapshotRepo, snapshotId: string): boolean {
  return snapshotRepo.countFiles(snapshotId) === 0;
}

export async function hasFingerprintDrift(
  adapter: FlutterFlowAdapter,
  snapshotRepo: SnapshotRepo,
  snapshotId: string,
  projectId: string
): Promise<boolean> {
  const local = snapshotRepo.getVersionInfo(snapshotId);
  if (!local?.projectSchemaFingerprint) {
    return false;
  }
  try {
    const listed = await adapter.listPartitionedFileNames(projectId);
    const remote = listed.versionInfo?.projectSchemaFingerprint;
    if (!remote) {
      return false;
    }
    return remote !== local.projectSchemaFingerprint;
  } catch {
    return false;
  }
}

export function computeSnapshotStaleness(refreshedAt: string, staleMinutes: number): boolean {
  return isSnapshotStale(refreshedAt, staleMinutes);
}

