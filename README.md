# flutterflow-mcp

`flutterflow-mcp` is an original FlutterFlow MCP server built around a command-palette model.

## What Orbit Is

Orbit is different from multi-tool MCP servers by design:

- One primary tool: `orbit`
- Command palette verbs inside `cmd` (`help`, `snapshots.create`, `changeset.apply`, etc.)
- SQLite snapshot cache with persisted indices/graphs
- Policy engine (`orbit.policy.json` + env overrides)
- Transactional ChangeSet flow: `new -> add -> preview -> validate -> apply`

## Features

- Node.js 18+ TypeScript strict implementation
- MCP stdio transport for Claude Desktop/Cursor/Windsurf
- Separate HTTP health/status/policy service on port `8080`
- FlutterFlow API adapter (set `FLUTTERFLOW_API_TOKEN` for remote reads/writes)
- SQLite snapshot store (files, hashes, symbols, edges)
- Navigation + component usage graph index
- Safe editing policy engine with manual-approval mode
- Orbit schema pack resources:
  - `orbit://schema/index`
  - `orbit://schema/doc/{id}`
  - `orbit://schema/snippet/{id}`

## Quick Start

### 1) Install

```bash
npm i
```

### 2) Configure env (optional for local startup)

```bash
export FLUTTERFLOW_API_TOKEN=your_token_here
```

Without a token, the MCP server still starts, but commands that call FlutterFlow APIs (for example `projects.list`, `snapshots.create`, `snapshots.refresh`) will return a missing-token error until you set it.

Optional API path overrides:

```bash
export FLUTTERFLOW_API_BASE_URL=https://api.flutterflow.io/v2
export FLUTTERFLOW_API_LIST_PROJECTS_PATH=/l/listProjects
export FLUTTERFLOW_API_LIST_PARTITIONED_FILES_PATH=/listPartitionedFileNames
export FLUTTERFLOW_API_PROJECT_YAMLS_PATH=/projectYamls
export FLUTTERFLOW_API_VALIDATE_PROJECT_YAML_PATH=/validateProjectYaml
export FLUTTERFLOW_API_UPDATE_PROJECT_YAML_PATH=/updateProjectByYaml
export FLUTTERFLOW_API_MIN_INTERVAL_MS=1000
```

### 3) Run

```bash
npm start
```

This starts:

- MCP server over stdio
- HTTP server on `http://localhost:8080`

Endpoints:

- `GET /health`
- `GET /status`
- `GET /policy`

If the HTTP port is already in use, Orbit now continues with MCP stdio and logs a warning to stderr.
You can disable HTTP endpoints entirely with:

```bash
export ORBIT_HTTP_ENABLED=0
```

## MCP Client Setup

Use `npm start` as your MCP command.

### Claude Desktop example

```json
{
  "mcpServers": {
    "flutterflow-mcp": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/absolute/path/to/flutterflow-mcp",
      "env": {
        "FLUTTERFLOW_API_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

### Cursor / Windsurf

Add an MCP server entry pointing to:

- command: `npm`
- args: `["start"]`
- cwd: repository root
- env: `FLUTTERFLOW_API_TOKEN`

## Orbit Command Palette

Primary tool signature:

```ts
orbit({
  cmd: string,
  args?: object,
  snapshot?: string,
  format?: "json" | "explain"
})
```

Discover commands:

```ts
orbit({ cmd: "help" })
```

Core groups:

- Discovery: `projects.list`, `snapshots.create`, `snapshots.refresh`, `snapshots.refreshSlow`, `snapshots.ensureFresh`, `snapshots.info`, `snapshots.ls`
- API capabilities: `api.capabilities`
- Query: `search`, `page.create`, `page.scaffold`, `page.get`, `page.update`, `page.preflightDelete`, `page.remove` (recommended), `page.delete` (low-level), `page.clone`, `component.get`, `component.extractFromWidget`, `component.instance.insert`, `tree.locate`, `tree.subtree`, `tree.find` (alias), `tree.validate`, `tree.repair`, `graph.nav`, `graph.usage`, `pages.list`, `textfields.list`, `widget.get`, `widget.getMany`, `widgets.list`, `widgets.find`, `widgets.findText`, `widgets.updateMany`, `widgets.copyPaste`, `widget.create`, `widget.insert`, `widget.wrap`, `widget.unwrap`, `widget.duplicate`, `widget.deleteSubtree`, `widget.replaceType`, `widget.removeChildren`, `widget.move`, `widget.moveMany`, `widget.reorder`, `widget.action.list`, `widget.action.get`, `widget.bindAction`, `widget.bindData`, `widget.set`, `widget.delete`, `selection.get`, `selection.clear`, `intent.run`, `routes.list`, `routes.listByPage`, `routes.validate`, `routes.upsert`, `routes.delete`, `settings.get`
- Summaries: `summarize.page`, `summarize.component`, `summarize.project`
- Editing: `changeset.new`, `changeset.add`, `changeset.preview`, `changeset.validate`, `changeset.apply`, `changeset.applySafe`, `changeset.rollback`, `changeset.revert`, `changeset.drop`
- Schema: `schema.search`, `schema.read`, `schema.snippet`

### High-ROI recipes

- Generate best-practice pages with deterministic recipes (preview-first):
  - `orbit({ cmd:"page.scaffold", args:{ name:"login2", recipe:"auth.login", preview:true } })`
  - `orbit({ cmd:"page.scaffold", args:{ name:"preferences", recipe:"settings.basic", params:{ toggles:["Notifications","Dark mode"] }, apply:true } })`
  - `orbit({ cmd:"intent.run", args:{ text:"create a list page called products with search", preview:true } })`
- Duplicate a widget twice:
  - `orbit({ cmd:"widget.duplicate", args:{ nameOrId:"login", nodeId:"id-Text_a", count:2, apply:true } })`
- Insert a widget in one call:
  - `orbit({ cmd:"widget.insert", args:{ nameOrId:"login", type:"Divider", beforeNodeId:"id-Button_b", apply:true } })`
- Batch-update text widgets:
  - `orbit({ cmd:"widgets.updateMany", args:{ nameOrId:"login", filter:{ type:"Text" }, set:{ text:"James NC" }, apply:true } })`
- Find widgets with one canonical search command:
  - `orbit({ cmd:"widgets.find", args:{ nameOrId:"login", type:"TextField", textContains:"Password" } })`
- Batch get exact widgets:
  - `orbit({ cmd:"widget.getMany", args:{ nameOrId:"login", nodeIds:["id-Text_a","id-Button_b"] } })`
- Route a button to another page:
  - `orbit({ cmd:"routes.upsert", args:{ nameOrId:"login", nodeId:"id-Button_b", toPageNameOrId:"DailyDashboard", apply:true } })`
- Inspect and validate page routes:
  - `orbit({ cmd:"routes.listByPage", args:{ nameOrId:"login", direction:"both" } })`
  - `orbit({ cmd:"routes.validate", args:{ nameOrId:"login", strict:true } })`
- Batch move and unwrap widgets:
  - `orbit({ cmd:"widget.moveMany", args:{ nameOrId:"login", nodeIds:["id-Text_b","id-Text_c"], afterNodeId:"id-Button_b", apply:true } })`
  - `orbit({ cmd:"widget.unwrap", args:{ nameOrId:"login", nodeId:"id-Row_wrap", apply:true } })`
- List/get widget trigger actions:
  - `orbit({ cmd:"widget.action.list", args:{ nameOrId:"login", nodeId:"id-Button_b" } })`
  - `orbit({ cmd:"widget.action.get", args:{ nameOrId:"login", nodeId:"id-Button_b", trigger:"ON_TAP" } })`
- Ensure snapshot freshness before read/write:
  - `orbit({ cmd:"snapshots.ensureFresh", args:{ staleMinutes:30 } })`
- Use sticky selection in conversational follow-ups:
  - `orbit({ cmd:"selection.get" })`
  - `orbit({ cmd:"intent.run", args:{ text:"unwrap this", apply:true } })`
- Safe apply orchestration:
  - `orbit({ cmd:"changeset.applySafe", args:{ changesetId:"chg_x", confirm:true } })`
- Rollback latest applied changeset:
  - `orbit({ cmd:"changeset.rollback", args:{ latestApplied:true, confirm:true, apply:true } })`
- Safer page delete flow:
  - `orbit({ cmd:"page.preflightDelete", args:{ nameOrId:"login2" } })`
  - `orbit({ cmd:"page.remove", args:{ nameOrId:"login2", apply:true } })`
  - `page.remove` attempts hard delete first, and can fall back to archive mode if FlutterFlow rejects delete payloads.
- Validate/repair tree integrity:
  - `orbit({ cmd:"tree.validate", args:{ nameOrId:"login" } })`
  - `orbit({ cmd:"tree.repair", args:{ nameOrId:"login", fixOrphans:true, fixMissingNodes:true, apply:true } })`

Optional support tools:

- `orbit_policy_get`
- `orbit_policy_set` (disabled unless `ORBIT_ALLOW_POLICY_WRITE=1`)
- `orbit_export_changeset`

## Snapshot Workflow

1. `orbit({cmd:"projects.list"})`
2. `orbit({cmd:"snapshots.create", args:{projectId:"..."}})`
3. Query against `snapshot` id
4. Run `snapshots.refresh` before sensitive changes to avoid stale decisions (now throttled by default to reduce 429s)

Orbit snapshots are point-in-time and may be stale.
When FlutterFlow returns `versionInfo` (`partitionerVersion`, `projectSchemaFingerprint`), Orbit stores it and uses it for smarter incremental refresh decisions.
If FlutterFlow is rate-limiting refresh (`429`), prefer budgeted crawl mode:
- `orbit({ cmd:"snapshots.refreshSlow", args:{ passes:4, pauseMs:15000, maxFetch:25, concurrency:1, sleepMs:250 } })`
- `orbit({ cmd:"snapshots.refresh", args:{ mode:"full", fetchStrategy:"bulk" } })` for low-request full sync attempts

## Safe Editing Workflow

1. `changeset.new`
2. `changeset.add` (one or many patches)
3. `changeset.preview` (diff + risk)
4. `changeset.validate` (YAML + structure + policy)
5. `changeset.apply` with `confirm:true` (includes remote `validateProjectYaml` checks before push)

If policy requires manual approval, apply is refused and a manual payload is returned.

## Policy Engine

Default file: `orbit.policy.json`

Fields:

- `allowProjects`
- `allowFileKeyPrefixes`
- `denyFileKeyPrefixes`
- `maxFilesPerApply`
- `maxLinesChanged`
- `requireManualApproval`
- `allowPlatformConfigEdits`
- `safeMode`: `readOnly | guidedWrite | fullWrite`

Env overrides:

- `ORBIT_POLICY_ALLOW_PROJECTS`
- `ORBIT_POLICY_ALLOW_FILE_PREFIXES`
- `ORBIT_POLICY_DENY_FILE_PREFIXES`
- `ORBIT_POLICY_MAX_FILES_PER_APPLY`
- `ORBIT_POLICY_MAX_LINES_CHANGED`
- `ORBIT_POLICY_REQUIRE_MANUAL_APPROVAL`
- `ORBIT_POLICY_ALLOW_PLATFORM_CONFIG_EDITS`
- `ORBIT_POLICY_SAFE_MODE`
- `ORBIT_ALLOW_POLICY_WRITE=1` (to enable `orbit_policy_set`)

## Fly.io Deployment

```bash
flyctl launch
flyctl secrets set FLUTTERFLOW_API_TOKEN=your_token_here
flyctl deploy
```

`fly.toml` is configured with auto-suspend:

- `auto_start_machines = true`
- `auto_stop_machines = "suspend"`
- `min_machines_running = 0`

## Development

```bash
npm run build
npm test
npm start
```

## Security Notes

- Keep `FLUTTERFLOW_API_TOKEN` only in environment variables or secret managers.
- Snapshot DB can include full project YAML and should be treated as sensitive data.
- `orbit.policy.json` should be code-reviewed because it controls write boundaries.
- Built-in read-only guards deny direct apply for custom code and unlocked `lib/main.dart`.

## FlutterFlow Project APIs Coverage

Orbit supports all currently documented FlutterFlow Project APIs (v2) through the adapter layer:

- `POST/GET /l/listProjects`
- `GET /listPartitionedFileNames`
- `GET /projectYamls` (including `projectYamlBytes` base64 zip decoding)
- `POST /validateProjectYaml`
- `POST /updateProjectByYaml`
