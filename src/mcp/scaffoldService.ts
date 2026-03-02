import YAML from "yaml";
import { orbitId } from "../util/ids.js";
import type { PageScaffoldRequest, PageScaffoldResult, WidgetTreeSpecNode } from "../types.js";
import { buildScaffoldRecipe, isPageRecipeId, listPageRecipes } from "./scaffoldRecipes.js";
import { computeTreeDepth, validateScaffoldTree } from "./scaffoldValidator.js";

function keyFromNodeId(nodeId: string): string {
  return nodeId.replace(/^id-/, "");
}

function normalizeNodeId(value: string): string {
  return value.startsWith("id-") ? value : `id-${value}`;
}

function defaultNodeIdForType(type: string): string {
  const normalizedType = type.replace(/[^A-Za-z0-9]+/g, "") || "Widget";
  return `id-${normalizedType}_${orbitId("n").slice(-8)}`;
}

function buildPageRootYaml(pageId: string, name: string): string {
  return YAML.stringify({
    name,
    description: "",
    node: {
      key: keyFromNodeId(pageId),
      classModel: {}
    }
  }, { lineWidth: 0 });
}

function buildWidgetNodeYaml(nodeId: string, type: string, name: string | undefined, props: Record<string, unknown>): string {
  return YAML.stringify({
    key: keyFromNodeId(nodeId),
    type,
    ...(name ? { name } : {}),
    props,
    parameterValues: {}
  }, { lineWidth: 0 });
}

interface CompiledNode {
  spec: WidgetTreeSpecNode;
  nodeId: string;
  key: string;
  children: CompiledNode[];
}

function compileSpecTree(
  nodes: WidgetTreeSpecNode[],
  roleNodeIds: Record<string, string>
): CompiledNode[] {
  const compileNode = (node: WidgetTreeSpecNode): CompiledNode => {
    const nodeId = normalizeNodeId(defaultNodeIdForType(node.type));
    if (node.meta?.role && !roleNodeIds[node.meta.role]) {
      roleNodeIds[node.meta.role] = nodeId;
    }
    const children = (node.children ?? []).map((child) => compileNode(child));
    return {
      spec: node,
      nodeId,
      key: keyFromNodeId(nodeId),
      children
    };
  };
  return nodes.map((node) => compileNode(node));
}

function toTreeEntries(nodes: CompiledNode[]): Array<Record<string, unknown>> {
  return nodes.map((node) => ({
    key: node.key,
    ...(node.children.length > 0 ? { children: toTreeEntries(node.children) } : {})
  }));
}

function flattenCompiledNodes(nodes: CompiledNode[]): CompiledNode[] {
  const out: CompiledNode[] = [];
  const walk = (node: CompiledNode) => {
    out.push(node);
    node.children.forEach((child) => walk(child));
  };
  nodes.forEach((node) => walk(node));
  return out;
}

function buildWireActionFiles(pageId: string, roleNodeIds: Record<string, string>, recipe: string): Array<{ fileKey: string; yaml: string }> {
  const primaryNodeId = roleNodeIds.primaryCta;
  if (!primaryNodeId) {
    return [];
  }
  const triggerId = "id-ON_TAP";
  const actionNodeId = `id-ACTION_${orbitId("act").slice(-8)}`;
  const actionKey = keyFromNodeId(actionNodeId);
  const message = recipe === "auth.signup" ? "Signup action placeholder" : "Login action placeholder";
  const basePath = `page/${pageId}/page-widget-tree-outline/node/${primaryNodeId}/trigger_actions/${triggerId}`;
  const triggerYaml = YAML.stringify({
    rootAction: {
      key: `root_${orbitId("root").slice(-8)}`,
      action: {
        key: actionKey,
        actionType: "SHOW_SNACKBAR"
      },
      trigger: {
        triggerType: "ON_TAP"
      }
    }
  }, { lineWidth: 0 });
  const actionYaml = YAML.stringify({
    key: actionKey,
    actionType: "SHOW_SNACKBAR",
    snackBar: {
      message
    }
  }, { lineWidth: 0 });
  return [
    { fileKey: `${basePath}.yaml`, yaml: triggerYaml },
    { fileKey: `${basePath}/action/${actionNodeId}.yaml`, yaml: actionYaml }
  ];
}

function fillSuggestedNext(
  suggested: { cmd: string; args?: Record<string, unknown> } | undefined,
  pageId: string,
  roleNodeIds: Record<string, string>
): { cmd: string; args?: Record<string, unknown> } | undefined {
  if (!suggested) {
    return undefined;
  }
  const args = { ...(suggested.args ?? {}) };
  for (const [key, value] of Object.entries(args)) {
    if (value !== "<new-page-id>" && value !== "<primary-cta-node-id>") {
      continue;
    }
    if (value === "<new-page-id>") {
      args[key] = pageId;
    } else {
      args[key] = roleNodeIds.primaryCta || "<primary-cta-node-id>";
    }
  }
  return {
    cmd: suggested.cmd,
    args
  };
}

export function pageRecipeIds(): string[] {
  return listPageRecipes();
}

export function compilePageScaffold(input: PageScaffoldRequest): PageScaffoldResult {
  if (!isPageRecipeId(input.recipe)) {
    throw new Error(`SCAFFOLD_RECIPE_UNKNOWN: recipe must be one of ${listPageRecipes().join(", ")}`);
  }

  const built = buildScaffoldRecipe(input.recipe, input.params ?? {});
  const validation = validateScaffoldTree({
    recipe: built.recipe,
    children: built.children,
    requiredRoles: built.requiredRoles
  });
  if (!validation.valid) {
    const summary = validation.issues.map((issue) => `${issue.code}@${issue.path}`).slice(0, 5).join(", ");
    throw new Error(`SCAFFOLD_LAYOUT_INVALID: ${summary}`);
  }

  if (input.wireActions && !built.supportsWireActions) {
    throw new Error(`SCAFFOLD_ACTION_WIRING_UNSUPPORTED: recipe ${input.recipe} does not support wireActions in v1`);
  }

  const roleNodeIds: Record<string, string> = {};
  const compiledChildren = compileSpecTree(built.children, roleNodeIds);
  const flattened = flattenCompiledNodes(compiledChildren);
  const tree = {
    node: {
      key: keyFromNodeId(input.pageId),
      children: toTreeEntries(compiledChildren)
    }
  };

  const files: Array<{ fileKey: string; yaml: string }> = [
    {
      fileKey: `page/${input.pageId}.yaml`,
      yaml: buildPageRootYaml(input.pageId, input.name)
    },
    {
      fileKey: `page/${input.pageId}/page-widget-tree-outline.yaml`,
      yaml: YAML.stringify(tree, { lineWidth: 0 })
    },
    {
      fileKey: `page/${input.pageId}/page-widget-tree-outline/node/${input.pageId}.yaml`,
      yaml: buildWidgetNodeYaml(input.pageId, "Scaffold", undefined, { scaffold: {} })
    }
  ];

  for (const node of flattened) {
    files.push({
      fileKey: `page/${input.pageId}/page-widget-tree-outline/node/${node.nodeId}.yaml`,
      yaml: buildWidgetNodeYaml(node.nodeId, node.spec.type, node.spec.name, node.spec.props ?? {})
    });
  }

  if (input.wireActions) {
    files.push(...buildWireActionFiles(input.pageId, roleNodeIds, input.recipe));
  }

  return {
    pageId: input.pageId,
    name: input.name,
    recipe: input.recipe,
    params: built.params,
    files,
    nodeCount: flattened.length + 1,
    treeDepth: computeTreeDepth(built.children) + 1,
    roleNodeIds,
    warnings: validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}: ${issue.message}`),
    suggestedNext: fillSuggestedNext(built.suggestedNext, input.pageId, roleNodeIds)
  };
}
