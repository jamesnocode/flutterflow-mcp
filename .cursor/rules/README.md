# FF Orbit Rule Pack

This directory is the canonical Cursor/agent rule pack for `flutterflow-mcp`.
It is versioned with the MCP server so rules and command behavior stay in sync.

## Included files

- `common.mdc`
- `ff-orbit-mcp-architecture.mdc`
- `ff-orbit-snapshots-freshness.mdc`
- `ff-orbit-pages-crud.mdc`
- `ff-orbit-widgets-crud.mdc`
- `ff-orbit-changesets-apply.mdc`
- `ff-orbit-policy-guardrails.mdc`
- `ff-orbit-search-schema-debugging.mdc`
- `ff-orbit-short-prompt-mapping.mdc`
- `orbit-setup-and-config.mdc`

## Rules maintenance contract

When command behavior changes in `src/mcp/orbitTool.ts` or adapter behavior changes in `src/ff/*`, update this rules pack in the same PR/commit.

Minimum update checklist:

1. Command help examples reflect current args/defaults.
2. Snapshot guidance reflects current throttling behavior.
3. Apply guidance reflects current `changeset.applySafe` behavior.
4. Natural language mapping reflects current `intent.run` aliases.
5. Setup docs reflect current required env vars and startup behavior.

## Companion docs and templates

- `docs/agent-playbook.md` for one-page operator guidance.
- `templates/mcp-config.local.json`, `templates/mcp-config-remote.json`, `templates/claude-code.mcp.json`, and `templates/codex-config.toml` for client-specific setup.
- `scripts/install-cursor-rules.sh` to install this pack into another repository.
