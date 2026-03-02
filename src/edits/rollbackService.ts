import type { SnapshotRepo } from "../store/snapshotRepo.js";
import { applyPatch, parsePatch, reversePatch } from "diff";
import type { ChangesetPreview, PatchSpec } from "../types.js";

export interface RollbackSourceEntry {
  entryId: string;
  fileKey: string;
  patchSpec: PatchSpec;
}

export interface RollbackSourceChangeset {
  changesetId: string;
  snapshotId: string;
  title: string;
  intent: string;
}

function canonicalFileOrder(entries: RollbackSourceEntry[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!seen.has(entry.fileKey)) {
      seen.add(entry.fileKey);
      ordered.push(entry.fileKey);
    }
  }
  return ordered;
}

export function buildInverseReplacements(
  snapshotRepo: SnapshotRepo,
  source: RollbackSourceChangeset,
  entries: RollbackSourceEntry[],
  sourcePreview?: ChangesetPreview
): Array<{ fileKey: string; previousYaml: string; currentYaml: string }> {
  if (sourcePreview?.files?.length) {
    const out: Array<{ fileKey: string; previousYaml: string; currentYaml: string }> = [];
    for (const diffFile of sourcePreview.files) {
      const currentYaml = snapshotRepo.getFile(source.snapshotId, diffFile.fileKey)?.yaml ?? "";
      const parsedPatch = parsePatch(diffFile.diff);
      const firstPatch = parsedPatch[0];
      if (!firstPatch) {
        throw new Error(`changeset.rollback missing parsable diff for ${diffFile.fileKey}`);
      }
      const reversed = reversePatch(firstPatch);
      const previousYaml = applyPatch(currentYaml, reversed);
      if (typeof previousYaml !== "string") {
        throw new Error(
          `changeset.rollback failed to reverse patch for ${diffFile.fileKey}. ` +
            "Ensure this is the latest applied changeset for the snapshot."
        );
      }
      out.push({ fileKey: diffFile.fileKey, previousYaml, currentYaml });
    }
    return out;
  }

  if (entries.length === 0) {
    return [];
  }

  const perFile = new Map<string, RollbackSourceEntry[]>();
  for (const entry of entries) {
    const list = perFile.get(entry.fileKey) ?? [];
    list.push(entry);
    perFile.set(entry.fileKey, list);
  }

  const out: Array<{ fileKey: string; previousYaml: string; currentYaml: string }> = [];
  const orderedFiles = canonicalFileOrder(entries);
  for (const fileKey of orderedFiles) {
    const currentFile = snapshotRepo.getFile(source.snapshotId, fileKey);
    if (!currentFile) {
      continue;
    }
    const fileEntries = perFile.get(fileKey) ?? [];
    let previousYaml = currentFile.yaml;
    for (let i = fileEntries.length - 1; i >= 0; i -= 1) {
      const patch = fileEntries[i]!.patchSpec;
      if (patch.type !== "replace-range") {
        throw new Error(`changeset.rollback currently supports replace-range entries only (file: ${fileKey})`);
      }
      const start = patch.start;
      const replacementLength = patch.replacement.length;
      previousYaml = `${previousYaml.slice(0, start)}${patch.replacement}${previousYaml.slice(start + replacementLength)}`;
    }

    out.push({
      fileKey,
      previousYaml,
      currentYaml: currentFile.yaml
    });
  }
  return out;
}
