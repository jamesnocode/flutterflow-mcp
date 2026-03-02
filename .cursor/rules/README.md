# FF Orbit Cursor Rules

This directory contains an FF-Orbit-specific Cursor rule pack to improve AI reliability and shorten prompt requirements.

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

## Purpose

These rules teach AI assistants to:

1. Use first-class Orbit commands before low-level patching
2. Handle snapshot freshness and fallback correctly
3. Perform page and widget CRUD through deterministic flows
4. Respect policy/approval boundaries
5. Debug command/schema/path mismatches quickly
6. Interpret short user prompts into robust command sequences

## Notes

- `page.delete` is treated as soft-delete in this integration.
- For critical writes, use preview/validate/apply with explicit confirmation.
- Prefer non-strict page listing unless the user asks for strict pinned snapshot behavior.
