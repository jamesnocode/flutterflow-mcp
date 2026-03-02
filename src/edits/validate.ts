import YAML from "yaml";
import type { ValidationIssue } from "../types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pushIssue(
  list: ValidationIssue[],
  issue: ValidationIssue["severity"],
  code: string,
  message: string,
  fileKey: string
): void {
  list.push({ code, severity: issue, message, fileKey });
}

export function validateYamlStructure(fileKey: string, yaml: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let parsed: unknown;

  try {
    parsed = YAML.parse(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "YAML parse failed";
    pushIssue(issues, "error", "yaml.parse", message, fileKey);
    return issues;
  }

  const walk = (node: unknown, path: string): void => {
    const record = asRecord(node);
    if (record) {
      if (typeof record.type === "string" && !("name" in record) && !("id" in record)) {
        pushIssue(
          issues,
          "warning",
          "structure.missing_name",
          `Node at ${path} has 'type' but no name/id; verify selector stability`,
          fileKey
        );
      }

      const actionType = typeof record.actionType === "string" ? record.actionType.toLowerCase() : "";
      if (actionType.includes("navigate") && !("targetPage" in record) && !("route" in record)) {
        pushIssue(
          issues,
          "warning",
          "structure.nav_target_missing",
          `Navigation action at ${path} has no targetPage/route`,
          fileKey
        );
      }

      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    }
  };

  walk(parsed, "$");
  return issues;
}
