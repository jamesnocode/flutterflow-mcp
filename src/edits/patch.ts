import YAML from "yaml";
import type { PatchSpec } from "../types.js";
import { selectorToPath, setAtPath, getAtPath } from "../util/paths.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out;
}

function applyYamlMerge(yaml: string, selector: string, value: unknown): string {
  const root = YAML.parse(yaml) as unknown;
  const path = selectorToPath(selector);

  if (path.length === 0) {
    return YAML.stringify(deepMerge(root, value), { lineWidth: 0 });
  }

  const existing = getAtPath(root, path);
  const merged = deepMerge(existing, value);
  const next = setAtPath(root, path, merged);

  return YAML.stringify(next, { lineWidth: 0 });
}

function applyJsonPathSet(yaml: string, selector: string, value: unknown): string {
  const root = YAML.parse(yaml) as unknown;
  const path = selectorToPath(selector);
  const next = setAtPath(root, path, value);
  return YAML.stringify(next, { lineWidth: 0 });
}

function applyReplaceRange(yaml: string, start: number, end: number, replacement: string): string {
  if (start < 0 || end < start || end > yaml.length) {
    throw new Error(`Invalid replace-range bounds (${start}, ${end}) for file length ${yaml.length}`);
  }

  return `${yaml.slice(0, start)}${replacement}${yaml.slice(end)}`;
}

export function applyPatchSpec(yaml: string, patch: PatchSpec): string {
  switch (patch.type) {
    case "yaml-merge":
      return applyYamlMerge(yaml, patch.selector, patch.value);
    case "jsonpath":
      return applyJsonPathSet(yaml, patch.selector, patch.value);
    case "replace-range":
      return applyReplaceRange(yaml, patch.start, patch.end, patch.replacement);
    default: {
      const exhaustive: never = patch;
      throw new Error(`Unsupported patch type: ${String(exhaustive)}`);
    }
  }
}
