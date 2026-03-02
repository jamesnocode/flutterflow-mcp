import type { OrbitEdge } from "../types.js";
import { IndexRepo } from "../store/indexRepo.js";

export interface GraphWalkResult {
  start: string;
  kind: OrbitEdge["kind"];
  depth: number;
  nodes: string[];
  edges: Array<{ from: string; to: string; fileKey: string }>;
}

export function walkGraph(
  indexRepo: IndexRepo,
  snapshotId: string,
  startNode: string,
  kind: OrbitEdge["kind"],
  depth = 2
): GraphWalkResult {
  const cappedDepth = Math.max(1, Math.min(depth, 6));
  const visited = new Set<string>([startNode]);
  const queued: Array<{ node: string; depth: number }> = [{ node: startNode, depth: 0 }];
  const edgesOut: Array<{ from: string; to: string; fileKey: string }> = [];

  while (queued.length > 0) {
    const current = queued.shift();
    if (!current) {
      continue;
    }

    if (current.depth >= cappedDepth) {
      continue;
    }

    const outgoing = indexRepo.listOutgoingEdges(snapshotId, kind, current.node);
    for (const edge of outgoing) {
      edgesOut.push({ from: edge.fromId, to: edge.toId, fileKey: edge.fileKey });
      if (!visited.has(edge.toId)) {
        visited.add(edge.toId);
        queued.push({ node: edge.toId, depth: current.depth + 1 });
      }
    }
  }

  return {
    start: startNode,
    kind,
    depth: cappedDepth,
    nodes: [...visited].sort(),
    edges: edgesOut
  };
}
