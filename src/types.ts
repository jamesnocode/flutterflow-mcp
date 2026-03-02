export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface FileKeyEntry {
  fileKey: string;
  hash?: string;
}

export interface ProjectVersionInfo {
  partitionerVersion?: string;
  projectSchemaFingerprint?: string;
}

export interface FileUpdate {
  fileKey: string;
  yaml: string;
}

export interface PushResult {
  ok: boolean;
  message?: string;
  details?: unknown;
}

export interface ApplyResult {
  applied: boolean;
  reason?: string;
  preview?: ChangesetPreview;
  manualPayload?: ManualApplyPayload;
  pushResult?: unknown;
  instructions?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  statusCode?: number;
}

export interface SnapshotRecord {
  snapshotId: string;
  projectId: string;
  name: string;
  createdAt: string;
  refreshedAt: string;
}

export interface SnapshotFile {
  snapshotId: string;
  fileKey: string;
  yaml: string;
  sha256: string;
  updatedAt: string;
}

export interface OrbitSymbol {
  snapshotId: string;
  symbolId: string;
  kind: "page" | "component" | "action" | "widget";
  name: string;
  fileKey: string;
  nodePath: string;
  tags: string[];
}

export interface OrbitEdge {
  snapshotId: string;
  kind: "nav" | "usage";
  fromId: string;
  toId: string;
  fileKey: string;
  metadata?: Record<string, unknown>;
}

export type SafeMode = "readOnly" | "guidedWrite" | "fullWrite";

export interface OrbitPolicy {
  allowProjects: string[];
  allowFileKeyPrefixes: string[];
  denyFileKeyPrefixes: string[];
  maxFilesPerApply: number;
  maxLinesChanged: number;
  requireManualApproval: boolean;
  allowPlatformConfigEdits: boolean;
  safeMode: SafeMode;
}

export interface PreviewFileDiff {
  fileKey: string;
  oldSha256: string;
  newSha256: string;
  linesChanged: number;
  diff: string;
  warnings: string[];
}

export interface ChangesetPreview {
  changesetId: string;
  files: PreviewFileDiff[];
  riskScore: number;
  impact: {
    filesTouched: number;
    linesChanged: number;
    highRiskFiles: string[];
  };
  staleSnapshotWarning?: string;
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  fileKey?: string;
}

export interface ChangesetValidation {
  changesetId: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ManualApplyPayload {
  snapshotId: string;
  projectId: string;
  changesetId: string;
  generatedAt: string;
  updates: FileUpdate[];
}

export type PatchSpec =
  | {
      type: "yaml-merge";
      selector: string;
      value: unknown;
    }
  | {
      type: "jsonpath";
      selector: string;
      value: unknown;
    }
  | {
      type: "replace-range";
      start: number;
      end: number;
      replacement: string;
    };

export interface ChangesetRecord {
  changesetId: string;
  snapshotId: string;
  title: string;
  intent: string;
  status: "draft" | "validated" | "applied" | "dropped";
  createdAt: string;
  updatedAt: string;
}

export interface ChangesetEntry {
  entryId: string;
  changesetId: string;
  fileKey: string;
  patchSpec: PatchSpec;
  note?: string;
  createdAt: string;
}

export interface OrbitCommandInput {
  cmd: string;
  args?: Record<string, unknown>;
  snapshot?: string;
  format?: "json" | "explain";
}

export interface OrbitCommandResult {
  ok: boolean;
  cmd: string;
  data?: unknown;
  warnings?: string[];
  errors?: string[];
}

export type TreeIssueCode =
  | "tree.missing_node_file"
  | "tree.orphan_node_file"
  | "tree.duplicate_key"
  | "tree.invalid_parent_ref"
  | "tree.root_mismatch";

export interface PlacementArgs {
  parentNodeId?: string;
  beforeNodeId?: string;
  afterNodeId?: string;
  index?: number;
}

export interface ResolvedPlacement {
  parentNodeId: string;
  index: number;
}

export interface WidgetFilterSpec {
  type?: string;
  nameContains?: string;
  textContains?: string;
  nodeIds?: string[];
}

export interface WidgetUpdateSpec {
  text?: string;
  keyValuePairs?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}

export interface IntentRunResult {
  mappedCommand?: string;
  mappedArgs?: Record<string, unknown>;
  clarify?: {
    message: string;
    choices?: Array<{ label: string; value: string }>;
    suggestedNext?: { cmd: string; args?: Record<string, unknown> };
  };
  result?: unknown;
}

export interface ClipboardEntry {
  clipboardId: string;
  snapshotId: string;
  pageId: string;
  rootNodeId: string;
  createdAt: string;
  keys: string[];
  nodeYamls: Record<string, string>;
  treeNode: unknown;
}

export type ActionBindMode = "upsert" | "replace" | "delete";

export type RouteValidationIssueCode =
  | "route.target_missing"
  | "route.self_loop"
  | "route.trigger_missing_action"
  | "route.action_missing_trigger"
  | "route.orphan_action_file"
  | "route.unindexed_navigation";

export interface WidgetActionSummary {
  trigger: string;
  triggerNodeId: string;
  triggerFileKey: string;
  actionNodeId?: string;
  actionFileKey?: string;
  actionType?: string;
  navigateTargetPageId?: string;
  selection?: {
    pageId: string;
    nodeId: string;
    fileKey: string;
  };
}

export interface WidgetManyResult {
  snapshotId: string;
  page: {
    pageId: string;
    name: string;
    fileKey: string;
  };
  totalRequested: number;
  totalFound: number;
  missingNodeIds: string[];
  widgets: Array<Record<string, unknown>>;
}

export interface RouteUpsertArgs {
  nameOrId?: string;
  pageId?: string;
  id?: string;
  fileKey?: string;
  nodeId?: string;
  toPageNameOrId?: string;
  trigger?: string;
  allowBack?: boolean;
  navigateBack?: boolean;
  passedParameters?: Record<string, unknown>;
  changesetId?: string;
  preview?: boolean;
  apply?: boolean;
  remoteValidate?: boolean;
}

export interface ApplySafeAttempt {
  phase?: "initial" | "remote-validate-retry" | "rate-limit-retry";
  remoteValidate: boolean;
  applied: boolean;
  reason?: string;
  waitMs?: number;
}

export interface ApplySafeResult {
  applied: boolean;
  phase: "preview" | "validate" | "apply";
  attempts: ApplySafeAttempt[];
  reason?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  nextRetryAt?: string;
  preview?: ChangesetPreview;
  validation?: ChangesetValidation;
  applyResult?: unknown;
  manualPayload?: ManualApplyPayload;
  instructions?: string;
}

export type PageRecipeId =
  | "auth.login"
  | "auth.signup"
  | "settings.basic"
  | "list.cards.search"
  | "detail.basic";

export type PageScaffoldParams = Record<string, unknown>;

export interface WidgetTreeSpecNode {
  type: string;
  name?: string;
  props?: Record<string, unknown>;
  children?: WidgetTreeSpecNode[];
  meta?: {
    role?: string;
    [key: string]: unknown;
  };
}

export type ScaffoldValidationCode =
  | "layout.expanded_under_scroll"
  | "layout.parent_child_invalid"
  | "layout.required_role_missing"
  | "layout.invalid_root";

export interface ScaffoldValidationIssue {
  code: ScaffoldValidationCode;
  severity: "error" | "warning";
  message: string;
  path: string;
  role?: string;
}

export interface PageScaffoldRequest {
  pageId: string;
  name: string;
  recipe: PageRecipeId;
  params?: PageScaffoldParams;
  wireActions?: boolean;
}

export interface PageScaffoldResult {
  pageId: string;
  name: string;
  recipe: PageRecipeId;
  params: PageScaffoldParams;
  files: Array<{ fileKey: string; yaml: string }>;
  nodeCount: number;
  treeDepth: number;
  roleNodeIds: Record<string, string>;
  warnings: string[];
  suggestedNext?: { cmd: string; args?: Record<string, unknown> };
}

export interface WidgetMoveManyArgs {
  nameOrId?: string;
  pageId?: string;
  id?: string;
  fileKey?: string;
  nodeIds: string[];
  parentNodeId?: string;
  beforeNodeId?: string;
  afterNodeId?: string;
  index?: number;
  preserveOrder?: boolean;
  changesetId?: string;
  preview?: boolean;
  apply?: boolean;
  remoteValidate?: boolean;
}

export interface WidgetMoveManyResult {
  snapshotId: string;
  page: {
    pageId: string;
    name: string;
    fileKey: string;
  };
  movedCount: number;
  moved: Array<{
    nodeId: string;
    from: { parentNodeId?: string; index?: number };
    to: { parentNodeId?: string; index?: number };
  }>;
  changesetId: string;
  preview?: ChangesetPreview;
  validation?: ChangesetValidation;
  applyResult?: unknown;
}

export interface SnapshotEnsureFreshResult {
  snapshotId: string;
  projectId: string;
  wasRefreshed: boolean;
  staleBefore: boolean;
  staleAfter: boolean;
  reason: string;
  refreshResult?: unknown;
  warnings?: string[];
}

export interface RollbackRequest {
  changesetId?: string;
  snapshotId?: string;
  latestApplied?: boolean;
  confirm: boolean;
  preview?: boolean;
  apply?: boolean;
  remoteValidate?: boolean;
  newTitle?: string;
  newIntent?: string;
}

export interface RollbackResult {
  rollbackChangesetId: string;
  sourceChangesetId: string;
  filesReverted: string[];
  preview?: ChangesetPreview;
  validation?: ChangesetValidation;
  applyResult?: unknown;
}

export interface SchemaDoc {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export interface SchemaSnippet {
  id: string;
  title: string;
  tags: string[];
  code: string;
  notes?: string;
}
