import YAML from "yaml";
import type { SnapshotRepo } from "../store/snapshotRepo.js";
import type { TreeIssueCode, ValidationIssue } from "../types.js";

function selectorFromPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "$";
  }
  let out = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      out += `.${segment}`;
    } else {
      out += `['${segment.replace(/'/g, "\\'")}']`;
    }
  }
  return out;
}

function getAtPath(root: unknown, path: Array<string | number>): unknown {
  let current = root;
  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

export function keyFromNodeId(nodeId: string): string {
  return nodeId.replace(/^id-/, "");
}

export function nodeIdFromKey(key: string): string {
  return key.startsWith("id-") ? key : `id-${key}`;
}

export function findNodePathByKey(
  node: unknown,
  targetKey: string,
  path: Array<string | number> = []
): Array<string | number> | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findNodePathByKey(node[i], targetKey, [...path, i]);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof node !== "object") {
    return undefined;
  }

  const row = node as Record<string, unknown>;
  if (typeof row.key === "string" && row.key === targetKey) {
    return path;
  }
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object") {
      const found = findNodePathByKey(value, targetKey, [...path, key]);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function findParentChildrenSlotByKey(
  node: unknown,
  targetKey: string,
  path: Array<string | number> = []
): { childrenPath: Array<string | number>; index: number } | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const found = findParentChildrenSlotByKey(node[i], targetKey, [...path, i]);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof node !== "object") {
    return undefined;
  }
  const row = node as Record<string, unknown>;
  const children = row.children;
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child && typeof child === "object") {
        const childRow = child as Record<string, unknown>;
        if (typeof childRow.key === "string" && childRow.key === targetKey) {
          return { childrenPath: [...path, "children"], index: i };
        }
      }
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object") {
      const found = findParentChildrenSlotByKey(value, targetKey, [...path, key]);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function collectWidgetTreeKeys(node: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (node === null || node === undefined) {
    return out;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectWidgetTreeKeys(entry, out);
    }
    return out;
  }
  if (typeof node !== "object") {
    return out;
  }
  const row = node as Record<string, unknown>;
  if (typeof row.key === "string" && row.key.trim()) {
    out.add(row.key.trim());
  }
  for (const value of Object.values(row)) {
    if (value !== null && typeof value === "object") {
      collectWidgetTreeKeys(value, out);
    }
  }
  return out;
}

export interface SplitTreeContext {
  pageId: string;
  treeFileKey: string;
  treeFileYaml: string;
  tree: unknown;
  nodeFileByKey: Map<string, { fileKey: string; yaml: string }>;
  nodeKeys: Set<string>;
}

export function loadSplitTreeContext(
  snapshotRepo: SnapshotRepo,
  snapshotId: string,
  pageId: string
): SplitTreeContext {
  const treeFileKey = `page/${pageId}/page-widget-tree-outline.yaml`;
  const treeFile = snapshotRepo.getFile(snapshotId, treeFileKey);
  if (!treeFile) {
    throw new Error(`Split widget tree file missing: ${treeFileKey}`);
  }
  const tree = YAML.parse(treeFile.yaml);
  const nodeFiles = snapshotRepo.listFiles(snapshotId, `page/${pageId}/page-widget-tree-outline/node/`, 10_000);
  const nodeFileByKey = new Map<string, { fileKey: string; yaml: string }>();
  for (const file of nodeFiles) {
    const match = file.fileKey.match(/\/node\/(id-[^/.]+)(?:\.ya?ml)?$/i)?.[1];
    if (!match) {
      continue;
    }
    nodeFileByKey.set(keyFromNodeId(match), { fileKey: file.fileKey, yaml: file.yaml });
  }
  return {
    pageId,
    treeFileKey,
    treeFileYaml: treeFile.yaml,
    tree,
    nodeFileByKey,
    nodeKeys: collectWidgetTreeKeys(tree)
  };
}

export function validateSplitTreeContext(
  pageRootKey: string,
  context: SplitTreeContext,
  includeOrphans: boolean
): { valid: boolean; issues: ValidationIssue[]; summary: Record<string, number> } {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const walk = (node: unknown, path: Array<string | number> = []): void => {
    if (node === null || node === undefined) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, [...path, index]));
      return;
    }
    if (typeof node !== "object") {
      return;
    }
    const row = node as Record<string, unknown>;
    if (typeof row.key === "string") {
      if (seen.has(row.key)) {
        duplicates.add(row.key);
      } else {
        seen.add(row.key);
      }
    }
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && typeof value === "object") {
        walk(value, [...path, key]);
      }
    }
  };
  walk(context.tree);

  for (const key of duplicates) {
    issues.push({
      code: "tree.duplicate_key" satisfies TreeIssueCode,
      severity: "error",
      message: `Duplicate widget key in tree: ${key}`,
      fileKey: context.treeFileKey
    });
  }

  const rootPath = findNodePathByKey(context.tree, pageRootKey);
  if (!rootPath) {
    issues.push({
      code: "tree.root_mismatch" satisfies TreeIssueCode,
      severity: "error",
      message: `Tree root mismatch. Expected root key ${pageRootKey}.`,
      fileKey: context.treeFileKey
    });
  }

  for (const key of context.nodeKeys) {
    if (!context.nodeFileByKey.has(key)) {
      issues.push({
        code: "tree.missing_node_file" satisfies TreeIssueCode,
        severity: "error",
        message: `Missing node file for key ${key}`,
        fileKey: context.treeFileKey
      });
    }
  }

  if (includeOrphans) {
    for (const [key, file] of context.nodeFileByKey.entries()) {
      if (!context.nodeKeys.has(key)) {
        issues.push({
          code: "tree.orphan_node_file" satisfies TreeIssueCode,
          severity: "warning",
          message: `Orphan node file not referenced in tree: ${key}`,
          fileKey: file.fileKey
        });
      }
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    summary: {
      treeKeys: context.nodeKeys.size,
      nodeFiles: context.nodeFileByKey.size,
      duplicates: duplicates.size,
      missingNodeFiles: issues.filter((issue) => issue.code === "tree.missing_node_file").length,
      orphanNodeFiles: issues.filter((issue) => issue.code === "tree.orphan_node_file").length
    }
  };
}

export function replaceKeyRefsDeep(node: unknown, keyMap: Map<string, string>): unknown {
  if (node === null || node === undefined) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((entry) => replaceKeyRefsDeep(entry, keyMap));
  }
  if (typeof node !== "object") {
    return node;
  }
  const row = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "key" && typeof value === "string" && keyMap.has(value)) {
      out[key] = keyMap.get(value)!;
      continue;
    }
    if (key === "nodeKeyRef" && value && typeof value === "object" && !Array.isArray(value)) {
      const ref = { ...(value as Record<string, unknown>) };
      if (typeof ref.key === "string" && keyMap.has(ref.key)) {
        ref.key = keyMap.get(ref.key)!;
      }
      out[key] = replaceKeyRefsDeep(ref, keyMap);
      continue;
    }
    out[key] = replaceKeyRefsDeep(value, keyMap);
  }
  return out;
}

export function cloneTreeNode(node: unknown): unknown {
  return YAML.parse(YAML.stringify(node, { lineWidth: 0 }));
}

export function removeNodeFromTreeByKey(tree: unknown, key: string): boolean {
  const slot = findParentChildrenSlotByKey(tree, key);
  if (!slot) {
    return false;
  }
  const siblings = getAtPath(tree, slot.childrenPath);
  if (!Array.isArray(siblings) || slot.index < 0 || slot.index >= siblings.length) {
    return false;
  }
  siblings.splice(slot.index, 1);
  return true;
}

export function attachChildAt(
  tree: unknown,
  parentKey: string,
  childEntry: unknown,
  index?: number
): { index: number; parentSelector: string } {
  const parentPath = findNodePathByKey(tree, parentKey);
  if (!parentPath) {
    throw new Error(`Parent widget node not found in tree: ${nodeIdFromKey(parentKey)}`);
  }
  const childrenPath = [...parentPath, "children"];
  let children = getAtPath(tree, childrenPath);
  if (!Array.isArray(children)) {
    const parent = getAtPath(tree, parentPath);
    if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
      throw new Error("Unable to resolve parent object for tree attach");
    }
    (parent as Record<string, unknown>).children = [];
    children = (parent as Record<string, unknown>).children as unknown[];
  }
  if (!Array.isArray(children)) {
    throw new Error("Unable to create children array for target parent");
  }
  const insertAt = index === undefined ? children.length : Math.max(0, Math.min(index, children.length));
  children.splice(insertAt, 0, childEntry);
  return {
    index: insertAt,
    parentSelector: selectorFromPath(parentPath)
  };
}
