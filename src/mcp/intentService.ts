export type ParsedIntent =
  | { kind: "widgets.list"; page?: string; type?: string }
  | { kind: "widgets.find"; page?: string; type?: string; nameContains?: string; textContains?: string }
  | { kind: "widgets.findText"; page?: string; text: string }
  | { kind: "widget.getMany"; page?: string; nodeIds: string[] }
  | { kind: "widget.setText"; page?: string; fromText?: string; toText?: string; nodeId?: string; text?: string }
  | { kind: "widget.bindData"; page?: string; nodeId?: string; key?: string; binding?: string }
  | { kind: "widget.wrap"; page?: string; nodeId?: string; wrapperType?: string }
  | { kind: "widget.unwrap"; page?: string; nodeId?: string }
  | { kind: "widget.move"; page?: string; nodeId?: string; beforeNodeId?: string; afterNodeId?: string }
  | {
      kind: "widget.moveMany";
      page?: string;
      nodeIds: string[];
      parentNodeId?: string;
      beforeNodeId?: string;
      afterNodeId?: string;
      index?: number;
    }
  | { kind: "widget.insert"; page?: string; type: string; beforeNodeId?: string; afterNodeId?: string; parentNodeId?: string }
  | { kind: "widget.deleteSubtree"; page?: string; nodeId?: string }
  | { kind: "widget.duplicate"; page?: string; nodeId?: string }
  | { kind: "widget.action.list"; page?: string; nodeId?: string }
  | { kind: "widget.action.get"; page?: string; nodeId?: string; trigger?: string }
  | { kind: "routes.listByPage"; page?: string; direction?: "outgoing" | "incoming" | "both" }
  | { kind: "routes.validate"; page?: string; strict?: boolean }
  | { kind: "routes.upsert"; page?: string; nodeId?: string; toPageNameOrId?: string; trigger?: string }
  | { kind: "routes.delete"; page?: string; nodeId?: string; trigger?: string }
  | {
      kind: "page.scaffold";
      recipe?: "auth.login" | "auth.signup" | "settings.basic" | "list.cards.search" | "detail.basic";
      name?: string;
      params?: Record<string, unknown>;
    }
  | { kind: "page.remove"; nameOrId?: string }
  | { kind: "page.clone"; nameOrId?: string; newName?: string }
  | { kind: "snapshots.ensureFresh"; staleMinutes?: number; force?: boolean }
  | { kind: "snapshots.refresh"; mode?: "incremental" | "full" }
  | { kind: "changeset.rollback"; changesetId?: string; latestApplied?: boolean }
  | { kind: "unknown" };

function dequote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseIntentText(input: string): ParsedIntent {
  const text = input.trim();
  if (!text) {
    return { kind: "unknown" };
  }

  let match =
    text.match(/^(list|show)\s+(all\s+)?(text fields|textfield|textfields|buttons|texts|widgets)(?:\s+on\s+(.+))?$/i) ??
    text.match(/^(list|show)\s+(.+)\s+(text fields|textfield|textfields|buttons|texts|widgets)$/i);
  if (match) {
    const rawType = (match[3] || "").toLowerCase();
    const page = (match[4] || match[2] || "").trim() || undefined;
    const type =
      rawType.includes("text field") || rawType.includes("textfield")
        ? "TextField"
        : rawType.includes("button")
        ? "Button"
        : rawType.includes("text")
        ? "Text"
        : undefined;
    return { kind: "widgets.list", page, type };
  }

  match = text.match(/^find\s+widgets(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widgets.find", page: match[1]?.trim() };
  }

  match = text.match(/^find\s+(text|button|textfield|widget)s?\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    const rawType = (match[1] || "").toLowerCase();
    const type = rawType === "textfield" ? "TextField" : `${rawType[0]?.toUpperCase() ?? ""}${rawType.slice(1)}`;
    return { kind: "widgets.find", type, textContains: dequote(match[2] || ""), page: match[3]?.trim() };
  }

  match = text.match(/^get\s+widgets?\s+((?:id-[\w-]+\s*,?\s*)+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    const nodeIds = (match[1] || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => /^id-[\w-]+$/i.test(entry));
    if (nodeIds.length > 0) {
      return { kind: "widget.getMany", nodeIds, page: match[2]?.trim() };
    }
  }

  match = text.match(/^find\s+text\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widgets.findText", text: dequote(match[1]!), page: match[2]?.trim() };
  }

  match = text.match(/^change\s+(.+?)\s+to\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.setText",
      fromText: dequote(match[1]!),
      toText: dequote(match[2]!),
      page: match[3]?.trim()
    };
  }

  match = text.match(/^bind\s+(id-[\w-]+)\s+(.+?)\s+to\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.bindData",
      nodeId: match[1],
      key: dequote(match[2] || ""),
      binding: dequote(match[3] || ""),
      page: match[4]?.trim()
    };
  }

  match = text.match(/^(set|update)\s+(id-[\w-]+)\s+to\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.setText",
      nodeId: match[2],
      text: dequote(match[3]!),
      page: match[4]?.trim()
    };
  }

  match = text.match(/^wrap\s+(id-[\w-]+|this|that)(?:\s+in\s+(a\s+)?(\w+))?(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.wrap",
      nodeId: /^id-/i.test(match[1] || "") ? match[1] : undefined,
      wrapperType: match[3] ? capitalize(match[3]) : "Row",
      page: match[4]?.trim()
    };
  }

  match = text.match(/^unwrap\s+(id-[\w-]+|this|that)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.unwrap",
      nodeId: /^id-/i.test(match[1] || "") ? match[1] : undefined,
      page: match[2]?.trim()
    };
  }

  match = text.match(/^move\s+(id-[\w-]+)\s+(before|after)\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    const direction = (match[2] ?? "").toLowerCase();
    return {
      kind: "widget.move",
      nodeId: match[1],
      beforeNodeId: direction === "before" ? match[3] : undefined,
      afterNodeId: direction === "after" ? match[3] : undefined,
      page: match[4]?.trim()
    };
  }

  match = text.match(/^move\s+\[([^\]]+)\]\s+(before|after)\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    const nodeIds = (match[1] || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => /^id-[\w-]+$/i.test(entry));
    if (nodeIds.length > 0) {
      const direction = (match[2] || "").toLowerCase();
      return {
        kind: "widget.moveMany",
        nodeIds,
        beforeNodeId: direction === "before" ? match[3] : undefined,
        afterNodeId: direction === "after" ? match[3] : undefined,
        page: match[4]?.trim()
      };
    }
  }

  match = text.match(/^move\s+\[([^\]]+)\]\s+into\s+(id-[\w-]+)(?:\s+at\s+(\d+))?(?:\s+on\s+(.+))?$/i);
  if (match) {
    const nodeIds = (match[1] || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => /^id-[\w-]+$/i.test(entry));
    if (nodeIds.length > 0) {
      const index = match[3] ? Number.parseInt(match[3], 10) : undefined;
      return {
        kind: "widget.moveMany",
        nodeIds,
        parentNodeId: match[2],
        index: Number.isFinite(index) ? index : undefined,
        page: match[4]?.trim()
      };
    }
  }

  match = text.match(/^insert\s+(\w+)(?:\s+(before|after)\s+(id-[\w-]+)|\s+into\s+(id-[\w-]+))(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "widget.insert",
      type: capitalize(match[1]!),
      beforeNodeId: match[2]?.toLowerCase() === "before" ? match[3] : undefined,
      afterNodeId: match[2]?.toLowerCase() === "after" ? match[3] : undefined,
      parentNodeId: match[4] || undefined,
      page: match[5]?.trim()
    };
  }

  match = text.match(/^delete\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widget.deleteSubtree", nodeId: match[1], page: match[2]?.trim() };
  }

  match = text.match(/^duplicate\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widget.duplicate", nodeId: match[1], page: match[2]?.trim() };
  }

  match = text.match(/^list\s+actions\s+on\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widget.action.list", nodeId: match[1], page: match[2]?.trim() };
  }

  match = text.match(/^get\s+action\s+(?:for\s+)?(id-[\w-]+)\s+trigger\s+([A-Za-z0-9_]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return { kind: "widget.action.get", nodeId: match[1], trigger: match[2], page: match[3]?.trim() };
  }

  match = text.match(/^list\s+routes(?:\s+(incoming|outgoing|both))?(?:\s+on\s+(.+))?$/i);
  if (match) {
    const direction = (match[1] || "both").toLowerCase();
    return {
      kind: "routes.listByPage",
      direction: direction === "incoming" || direction === "outgoing" ? direction : "both",
      page: match[2]?.trim()
    };
  }

  match = text.match(/^validate\s+routes(?:\s+strict)?(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "routes.validate",
      strict: /strict/i.test(text),
      page: match[1]?.trim()
    };
  }

  match = text.match(/^(route|navigate|connect)\s+(id-[\w-]+)\s+to\s+(.+?)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "routes.upsert",
      nodeId: match[2],
      toPageNameOrId: dequote(match[3] || ""),
      page: match[4]?.trim()
    };
  }

  match = text.match(/^(remove|delete)\s+route(?:\s+on)?\s+(id-[\w-]+)(?:\s+on\s+(.+))?$/i);
  if (match) {
    return {
      kind: "routes.delete",
      nodeId: match[2],
      page: match[3]?.trim()
    };
  }

  match = text.match(
    /^create\s+(?:a\s+)?(login|signup|settings|list|detail)\s+page(?:\s+(?:called|named|as)\s+([A-Za-z0-9_-]+))?(?:\s+with\s+(.+))?$/i
  );
  if (match) {
    const raw = (match[1] || "").toLowerCase();
    const recipe =
      raw === "login"
        ? "auth.login"
        : raw === "signup"
        ? "auth.signup"
        : raw === "settings"
        ? "settings.basic"
        : raw === "list"
        ? "list.cards.search"
        : "detail.basic";
    const name = match[2]?.trim();
    const params: Record<string, unknown> = {};
    const withPart = (match[3] || "").toLowerCase();
    if (recipe === "list.cards.search" && withPart.includes("search")) {
      params.searchPlaceholder = "Search";
    }
    if (recipe === "auth.login" && withPart.includes("sign in")) {
      params.primaryCta = "Sign In";
    }
    if (recipe === "auth.signup" && withPart.includes("sign up")) {
      params.primaryCta = "Create Account";
    }
    return { kind: "page.scaffold", recipe, name, params };
  }

  match = text.match(/^create\s+page(?:\s+(?:called|named|as)\s+([A-Za-z0-9_-]+))?(?:\s+for\s+(\w+))?$/i);
  if (match) {
    const name = match[1]?.trim();
    const kindHint = (match[2] || "").toLowerCase();
    const recipe =
      kindHint === "login"
        ? "auth.login"
        : kindHint === "signup"
        ? "auth.signup"
        : kindHint === "settings"
        ? "settings.basic"
        : kindHint === "list"
        ? "list.cards.search"
        : kindHint === "detail"
        ? "detail.basic"
        : undefined;
    return { kind: "page.scaffold", recipe, name };
  }

  match = text.match(/^(delete|remove)\s+page\s+(.+)$/i);
  if (match) {
    return { kind: "page.remove", nameOrId: dequote(match[2] || "") };
  }

  match = text.match(/^clone\s+page\s+(.+?)\s+(?:as|to)\s+(.+)$/i) ?? text.match(/^clone\s+(.+?)\s+(?:as|to)\s+(.+)$/i);
  if (match) {
    return { kind: "page.clone", nameOrId: dequote(match[1] || ""), newName: dequote(match[2] || "") };
  }

  match = text.match(/^ensure\s+fresh\s+snapshot(?:\s+(\d+)\s*min(?:ute)?s?)?(?:\s+force)?$/i);
  if (match) {
    const staleMinutes = match[1] ? Number.parseInt(match[1], 10) : undefined;
    return {
      kind: "snapshots.ensureFresh",
      staleMinutes: Number.isFinite(staleMinutes) ? staleMinutes : undefined,
      force: /force/i.test(text)
    };
  }

  match =
    text.match(
      /^(?:refresh|sync|update)\s+(?:the\s+)?(?:flutterflow\s+)?snapshot(?:\s+from\s+flutterflow)?(?:\s+(full|incremental))?(?:\s+now)?$/i
    ) ??
    text.match(/^(full|incremental)\s+snapshot\s+refresh(?:\s+from\s+flutterflow)?$/i);
  if (match) {
    const rawMode = (match[1] || "").toLowerCase();
    return {
      kind: "snapshots.refresh",
      mode: rawMode === "full" ? "full" : rawMode === "incremental" ? "incremental" : undefined
    };
  }

  match = text.match(/^rollback\s+(chg_[\w-]+)$/i);
  if (match) {
    return { kind: "changeset.rollback", changesetId: match[1] };
  }
  match = text.match(/^rollback\s+latest(?:\s+applied)?(?:\s+changeset)?$/i);
  if (match) {
    return { kind: "changeset.rollback", latestApplied: true };
  }

  return { kind: "unknown" };
}

function capitalize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}
