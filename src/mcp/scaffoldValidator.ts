import type { PageRecipeId, ScaffoldValidationIssue, WidgetTreeSpecNode } from "../types.js";

const SCROLL_TYPES = new Set(["SingleChildScrollView", "ListView", "GridView"]);

function selectorFromPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "$";
  }
  let out = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      out += `.${segment}`;
    }
  }
  return out;
}

export function validateScaffoldTree(input: {
  recipe: PageRecipeId;
  children: WidgetTreeSpecNode[];
  requiredRoles: string[];
}): { valid: boolean; issues: ScaffoldValidationIssue[] } {
  const issues: ScaffoldValidationIssue[] = [];
  if (input.children.length === 0) {
    issues.push({
      code: "layout.invalid_root",
      severity: "error",
      message: "Scaffold recipe produced no body widgets.",
      path: "$.children"
    });
    return { valid: false, issues };
  }

  const foundRoles = new Set<string>();

  const walk = (
    node: WidgetTreeSpecNode,
    path: Array<string | number>,
    ancestors: WidgetTreeSpecNode[]
  ): void => {
    const selector = selectorFromPath(path);
    if (node.meta?.role && typeof node.meta.role === "string") {
      foundRoles.add(node.meta.role);
    }

    if (node.type === "Expanded") {
      const hasScrollAncestor = ancestors.some((ancestor) => SCROLL_TYPES.has(ancestor.type));
      if (hasScrollAncestor) {
        issues.push({
          code: "layout.expanded_under_scroll",
          severity: "error",
          message: "Expanded cannot be nested under a scrollable ancestor.",
          path: selector,
          role: node.meta?.role
        });
      }
    }

    if (SCROLL_TYPES.has(node.type)) {
      const hasExpandedDescendant = (node.children ?? []).some((child) => child.type === "Expanded");
      if (hasExpandedDescendant) {
        issues.push({
          code: "layout.parent_child_invalid",
          severity: "error",
          message: `${node.type} should not contain Expanded children directly.`,
          path: selector,
          role: node.meta?.role
        });
      }
    }

    if (node.type === "Row" && (node.children ?? []).length === 0) {
      issues.push({
        code: "layout.parent_child_invalid",
        severity: "warning",
        message: "Row has no children.",
        path: selector,
        role: node.meta?.role
      });
    }

    if (node.type === "Column" && (node.children ?? []).length === 0) {
      issues.push({
        code: "layout.parent_child_invalid",
        severity: "warning",
        message: "Column has no children.",
        path: selector,
        role: node.meta?.role
      });
    }

    (node.children ?? []).forEach((child, index) => {
      walk(child, [...path, "children", index], [...ancestors, node]);
    });
  };

  input.children.forEach((child, index) => {
    walk(child, ["children", index], []);
  });

  for (const requiredRole of input.requiredRoles) {
    if (foundRoles.has(requiredRole)) {
      continue;
    }
    issues.push({
      code: "layout.required_role_missing",
      severity: "error",
      message: `Required scaffold role missing: ${requiredRole}`,
      path: "$.children",
      role: requiredRole
    });
  }

  if (input.recipe === "list.cards.search" && !foundRoles.has("listRegion")) {
    issues.push({
      code: "layout.required_role_missing",
      severity: "error",
      message: "List recipe requires a listRegion role under an Expanded container.",
      path: "$.children",
      role: "listRegion"
    });
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}

export function computeTreeDepth(children: WidgetTreeSpecNode[]): number {
  if (children.length === 0) {
    return 0;
  }
  const depth = (node: WidgetTreeSpecNode): number => {
    const childDepth = (node.children ?? []).map((child) => depth(child));
    return childDepth.length > 0 ? 1 + Math.max(...childDepth) : 1;
  };
  return Math.max(...children.map((child) => depth(child)));
}
