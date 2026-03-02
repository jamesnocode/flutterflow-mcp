export function selectorToPath(selector: string): Array<string | number> {
  if (!selector || selector === "/" || selector === "." || selector === "$") {
    return [];
  }

  const normalized = selector
    .replace(/^\$\.?/, "")
    .replace(/^\//, "")
    .replace(/\//g, ".")
    .trim();

  const tokens: Array<string | number> = [];
  for (const piece of normalized.split(".")) {
    if (!piece) {
      continue;
    }

    const segmentRegex = /([^\[\]]+)|(\[(\d+)\])/g;
    let match: RegExpExecArray | null;
    while ((match = segmentRegex.exec(piece)) !== null) {
      if (match[1]) {
        tokens.push(match[1]);
      } else if (match[3]) {
        tokens.push(Number.parseInt(match[3], 10));
      }
    }
  }

  return tokens;
}

export function setAtPath(root: unknown, path: Array<string | number>, value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }

  if (root === null || typeof root !== "object") {
    root = typeof path[0] === "number" ? [] : {};
  }

  let cursor: Record<string, unknown> | Array<unknown> = root as Record<string, unknown> | Array<unknown>;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    const next = path[i + 1]!;

    if (typeof key === "number") {
      if (!Array.isArray(cursor)) {
        throw new Error("Path segment expects an array");
      }
      if (cursor[key] === undefined || cursor[key] === null || typeof cursor[key] !== "object") {
        cursor[key] = typeof next === "number" ? [] : {};
      }
      cursor = cursor[key] as Record<string, unknown> | Array<unknown>;
      continue;
    }

    if (Array.isArray(cursor)) {
      throw new Error("Path segment expects an object");
    }

    if (!(key in cursor) || cursor[key] === null || typeof cursor[key] !== "object") {
      cursor[key] = typeof next === "number" ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown> | Array<unknown>;
  }

  const leaf = path[path.length - 1]!;
  if (typeof leaf === "number") {
    if (!Array.isArray(cursor)) {
      throw new Error("Leaf path expects an array");
    }
    cursor[leaf] = value;
    return root;
  }

  if (Array.isArray(cursor)) {
    throw new Error("Leaf path expects an object");
  }

  cursor[leaf] = value;
  return root;
}

export function getAtPath(root: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }

    if (typeof key === "number") {
      if (!Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[key];
      continue;
    }

    if (typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}
