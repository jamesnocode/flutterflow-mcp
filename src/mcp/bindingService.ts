import YAML from "yaml";
import { orbitId } from "../util/ids.js";

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeTriggerType(value: string): string {
  const normalized = normalizeToken(value);
  return normalized || "ON_TAP";
}

export function triggerNodeId(triggerType: string): string {
  const normalized = triggerType.trim();
  if (/^id-/i.test(normalized)) {
    return normalized;
  }
  return `id-${normalizeTriggerType(normalized)}`;
}

export function ensureActionNodeId(value?: string): string {
  const trimmed = (value || "").trim();
  if (trimmed) {
    return /^id-/i.test(trimmed) ? trimmed : `id-${trimmed}`;
  }
  return `id-${orbitId("action").replace(/^id-/, "")}`;
}

export function keyFromNodeId(nodeId: string): string {
  return nodeId.replace(/^id-/, "");
}

export function buildTriggerYaml(args: {
  triggerType: string;
  rootActionKey?: string;
  actionNodeId: string;
  action: Record<string, unknown>;
}): string {
  const triggerType = normalizeTriggerType(args.triggerType);
  const actionKey = keyFromNodeId(args.actionNodeId);
  const rootActionKey = args.rootActionKey && args.rootActionKey.trim().length > 0
    ? args.rootActionKey.trim()
    : orbitId("root");
  const triggerPayload = {
    rootAction: {
      key: rootActionKey,
      action: {
        ...args.action,
        key: actionKey
      }
    },
    trigger: {
      triggerType
    }
  };
  return YAML.stringify(triggerPayload, { lineWidth: 0 });
}

export function buildActionYaml(actionNodeId: string, action: Record<string, unknown>): string {
  const actionKey = keyFromNodeId(actionNodeId);
  return YAML.stringify(
    {
      ...action,
      key: actionKey
    },
    { lineWidth: 0 }
  );
}

export function parseTriggerAndActionFromYaml(
  triggerYaml: string,
  fallbackActionFileKey?: string
): {
  triggerType?: string;
  actionType?: string;
  actionNodeId?: string;
  navigateTargetPageId?: string;
  action?: Record<string, unknown>;
} {
  let parsed: unknown;
  try {
    parsed = YAML.parse(triggerYaml);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const root = parsed as Record<string, unknown>;
  const trigger = root.trigger && typeof root.trigger === "object" && !Array.isArray(root.trigger)
    ? (root.trigger as Record<string, unknown>)
    : {};
  const rootAction = root.rootAction && typeof root.rootAction === "object" && !Array.isArray(root.rootAction)
    ? (root.rootAction as Record<string, unknown>)
    : {};
  const actionObj = rootAction.action && typeof rootAction.action === "object" && !Array.isArray(rootAction.action)
    ? (rootAction.action as Record<string, unknown>)
    : {};
  const navigate = actionObj.navigate && typeof actionObj.navigate === "object" && !Array.isArray(actionObj.navigate)
    ? (actionObj.navigate as Record<string, unknown>)
    : {};
  const pageRef = navigate.pageNodeKeyRef && typeof navigate.pageNodeKeyRef === "object" && !Array.isArray(navigate.pageNodeKeyRef)
    ? (navigate.pageNodeKeyRef as Record<string, unknown>)
    : {};
  const pageKey = typeof pageRef.key === "string" ? pageRef.key : "";
  const actionKey = typeof actionObj.key === "string"
    ? actionObj.key
    : (fallbackActionFileKey?.match(/\/action\/(id-[^/.]+)(?:\.ya?ml)?$/i)?.[1]?.replace(/^id-/, "") || "");
  const actionNodeId = actionKey ? `id-${actionKey.replace(/^id-/, "")}` : undefined;
  const actionType = Object.keys(actionObj).find((key) => key !== "key");
  return {
    triggerType: typeof trigger.triggerType === "string" ? trigger.triggerType : undefined,
    actionType,
    actionNodeId,
    navigateTargetPageId: pageKey ? (pageKey.startsWith("id-") ? pageKey : `id-${pageKey}`) : undefined,
    action: Object.keys(actionObj).length > 0 ? actionObj : undefined
  };
}
