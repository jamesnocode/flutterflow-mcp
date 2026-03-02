# FF Orbit Agent Playbook

Use this repo as the canonical source for Orbit MCP rules and setup templates.

## 1) Add MCP server (local)

Use the matching template:
- Cursor/Windsurf/Claude Desktop: `templates/mcp-config.local.json`
- Claude Code project config: `templates/claude-code.mcp.json` (save as `.mcp.json` in your project)
- Codex: `templates/codex-config.toml` (merge into `~/.codex/config.toml`)

Set:
- `cwd` to the absolute path of this repository.
- `FLUTTERFLOW_API_TOKEN` to a valid token.

CLI alternatives:
- Claude Code: `claude mcp add -s project -e FLUTTERFLOW_API_TOKEN=YOUR_TOKEN ff_orbit_mcp -- npm start`
- Codex: `codex mcp add ff_orbit_mcp --env FLUTTERFLOW_API_TOKEN=YOUR_TOKEN -- node /absolute/path/to/ff-mcp/dist/main.js` (run `npm run build` first)

## 2) Verify startup

Run:
1. `orbit({cmd:"help"})`
2. `orbit({cmd:"projects.list"})`

If either fails, check token, `cwd`, and command (`npm start`).

## 3) Refresh snapshot safely

Start conservative:

```json
{"cmd":"snapshots.refresh","args":{"mode":"incremental","fetchStrategy":"auto","maxFetch":25,"concurrency":1,"sleepMs":250},"format":"json"}
```

Severe throttling:

```json
{"cmd":"snapshots.refreshSlow","args":{"passes":1,"maxFetch":5,"concurrency":1,"sleepMs":2000,"pauseMs":20000},"format":"json"}
```

Authoritative full attempt:

```json
{"cmd":"snapshots.refresh","args":{"mode":"full","fetchStrategy":"bulk","concurrency":1,"sleepMs":2000},"format":"json"}
```

Treat snapshot as authoritative only when refresh output reports `authoritative:true` and `pruneApplied:true`.

## 4) Apply safely under 429

```json
{"cmd":"changeset.applySafe","args":{"changesetId":"chg_x","confirm":true,"rateLimitRetries":3,"rateLimitBaseMs":1500,"rateLimitMaxWaitMs":90000},"format":"json"}
```

Success requires `applied:true`. If `rateLimited:true`, wait until `nextRetryAt` before retrying.

## 5) Keep rule pack current

Whenever command behavior changes:
- Update `.cursor/rules/*` in the same commit.
- Update templates if setup/env changes.
- Keep this playbook examples aligned with current command args.
