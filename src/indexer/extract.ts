import YAML from "yaml";
import type { OrbitEdge, OrbitSymbol } from "../types.js";

interface RawEdge {
  kind: "nav" | "usage";
  fromId: string;
  toKind: "page" | "component";
  toName: string;
  fileKey: string;
  metadata?: Record<string, unknown>;
}

function inferRootSymbolFromFileKey(fileKey: string): { kind: "page" | "component"; name: string } | undefined {
  const normalized = fileKey.replace(/\.ya?ml$/i, "");
  const match = normalized.match(/^(page|component)\/(id-[^/]+)$/i);
  const kindRaw = match?.[1]?.toLowerCase();
  const name = match?.[2];
  if ((kindRaw !== "page" && kindRaw !== "component") || !name) {
    return undefined;
  }
  const kind = kindRaw as "page" | "component";
  return { kind, name };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function baseFileName(fileKey: string): string {
  const parts = fileKey.split("/");
  const name = parts[parts.length - 1] ?? fileKey;
  return name.replace(/\.[^.]+$/, "");
}

function toStringCandidate(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function detectSymbolKind(node: Record<string, unknown>): OrbitSymbol["kind"] | undefined {
  const type = String(node.type ?? node.kind ?? node.nodeType ?? "").toLowerCase();

  if (type.includes("page") || node.isPage === true || "route" in node) {
    return "page";
  }

  if (type.includes("component") || "componentName" in node || "componentRef" in node) {
    return "component";
  }

  if (type.includes("action") || "actionType" in node || "onAction" in node || "onTapAction" in node) {
    return "action";
  }

  if (type.includes("widget") || "widgetType" in node || "children" in node || "child" in node) {
    return "widget";
  }

  return undefined;
}

function detectSymbolName(node: Record<string, unknown>, fileKey: string, kind: OrbitSymbol["kind"]): string {
  const candidates = [
    toStringCandidate(node.name),
    toStringCandidate(node.id),
    toStringCandidate(node.pageName),
    toStringCandidate(node.componentName),
    toStringCandidate(node.route)
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  if (kind === "page") {
    return baseFileName(fileKey);
  }

  return `${kind}_${baseFileName(fileKey)}`;
}

function symbolId(kind: OrbitSymbol["kind"], name: string, path: string): string {
  if (kind === "page" || kind === "component") {
    return `${kind}:${normalizeName(name)}`;
  }
  return `${kind}:${normalizeName(name)}:${normalizeName(path)}`;
}

function collectTags(node: Record<string, unknown>, kind: OrbitSymbol["kind"]): string[] {
  const tags = new Set<string>([kind]);
  const type = toStringCandidate(node.type);
  if (type) {
    tags.add(type.toLowerCase());
  }
  if (node.platform) {
    tags.add("platform");
  }
  if (node.onTapAction || node.actionType) {
    tags.add("interactive");
  }
  return [...tags];
}

interface TraverseContext {
  ownerId?: string;
  ownerKind?: "page" | "component";
}

export function extractSnapshotIndex(
  snapshotId: string,
  files: Array<{ fileKey: string; yaml: string }>
): { symbols: OrbitSymbol[]; edges: OrbitEdge[] } {
  const symbolsById = new Map<string, OrbitSymbol>();
  const rawEdges: RawEdge[] = [];

  const addSymbol = (symbol: OrbitSymbol): void => {
    if (!symbolsById.has(symbol.symbolId)) {
      symbolsById.set(symbol.symbolId, symbol);
    }
  };

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = YAML.parse(file.yaml);
    } catch {
      continue;
    }

    const inferredRoot = inferRootSymbolFromFileKey(file.fileKey);
    if (inferredRoot) {
      const inferredId = symbolId(inferredRoot.kind, inferredRoot.name, "$");
      addSymbol({
        snapshotId,
        symbolId: inferredId,
        kind: inferredRoot.kind,
        name: inferredRoot.name,
        fileKey: file.fileKey,
        nodePath: "$",
        tags: [inferredRoot.kind, "file-key-derived"]
      });
    }

    const walk = (node: unknown, path: string, context: TraverseContext): void => {
      const record = asRecord(node);
      if (record) {
        const maybeKind = detectSymbolKind(record);
        let nextContext = context;

        if (maybeKind) {
          const name = detectSymbolName(record, file.fileKey, maybeKind);
          const id = symbolId(maybeKind, name, path);

          addSymbol({
            snapshotId,
            symbolId: id,
            kind: maybeKind,
            name,
            fileKey: file.fileKey,
            nodePath: path,
            tags: collectTags(record, maybeKind)
          });

          if (maybeKind === "page" || maybeKind === "component") {
            nextContext = {
              ownerId: id,
              ownerKind: maybeKind
            };
          }

        }

        if (nextContext.ownerId) {
          const actionRecord = asRecord(record.action);
          const navigateRecord = asRecord(record.navigate) ?? asRecord(actionRecord?.navigate);
          const rawActionType = String(record.actionType ?? record.action ?? record.type ?? "").toLowerCase();
          const actionType = navigateRecord ? "navigate" : rawActionType;
          if (actionType.includes("navigate")) {
            const pageKeyRef = asRecord(navigateRecord?.pageNodeKeyRef);
            const pageKey = toStringCandidate(pageKeyRef?.key);
            const target =
              toStringCandidate(record.targetPage) ||
              toStringCandidate(record.pageName) ||
              toStringCandidate(record.route) ||
              toStringCandidate(record.navigateTo) ||
              (pageKey ? (pageKey.startsWith("id-") ? pageKey : `id-${pageKey}`) : undefined);
            if (target) {
              rawEdges.push({
                kind: "nav",
                fromId: nextContext.ownerId,
                toKind: "page",
                toName: target,
                fileKey: file.fileKey,
                metadata: {
                  via: actionType,
                  path
                }
              });
            }
          }

          const componentTarget =
            toStringCandidate(record.componentRef) ||
            toStringCandidate(record.componentName) ||
            toStringCandidate(record.customWidget) ||
            toStringCandidate(record.widgetName);
          if (componentTarget && actionType !== "") {
            rawEdges.push({
              kind: "usage",
              fromId: nextContext.ownerId,
              toKind: "component",
              toName: componentTarget,
              fileKey: file.fileKey,
              metadata: {
                via: actionType,
                path
              }
            });
          }
        }

        for (const [key, value] of Object.entries(record)) {
          walk(value, `${path}.${key}`, nextContext);
        }
        return;
      }

      if (Array.isArray(node)) {
        node.forEach((entry, index) => walk(entry, `${path}[${index}]`, context));
      }
    };

    walk(parsed, "$", {
      ownerKind: inferredRoot?.kind ?? (file.fileKey.includes("component") ? "component" : "page"),
      ownerId: inferredRoot
        ? `${inferredRoot.kind}:${normalizeName(inferredRoot.name)}`
        : file.fileKey.includes("component")
        ? `component:${normalizeName(baseFileName(file.fileKey))}`
        : `page:${normalizeName(baseFileName(file.fileKey))}`
    });
  }

  const edgesByKey = new Map<string, OrbitEdge>();
  for (const edge of rawEdges) {
    const normalized: OrbitEdge = {
      snapshotId,
      kind: edge.kind,
      fromId: edge.fromId,
      toId: `${edge.toKind}:${normalizeName(edge.toName)}`,
      fileKey: edge.fileKey,
      metadata: edge.metadata
    };
    const key = `${normalized.kind}|${normalized.fromId}|${normalized.toId}|${normalized.fileKey}`;
    if (!edgesByKey.has(key)) {
      edgesByKey.set(key, normalized);
    }
  }

  return { symbols: [...symbolsById.values()], edges: [...edgesByKey.values()] };
}
