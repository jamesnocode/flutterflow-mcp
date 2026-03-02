# AGENTS.md

This file defines repository-specific behavior for AI coding agents working on `flutterflow-mcp`.

## Scope
- Applies to the whole repository.
- Prefer these rules over generic habits when interacting with Orbit MCP commands.
- Applies to both local coding tasks and live MCP tool usage.

## Rule Loading Order
- Treat this file and `.cursor/rules/*.mdc` as the primary playbook for FF Orbit behavior.
- Before exploratory calls, prefer the closest matching first-class command from the rules.
- Use `help { cmd }` only when the command shape is still unclear.

## Primary Goal
- Use deterministic, first-class Orbit commands so user requests are handled in minimal calls with predictable output.
- Prefer "short user request -> 1 deterministic command" whenever possible.

## Command-First Policy
- Prefer first-class commands over exploratory schema probing.
- For routine operations, do **not** call `schema.search` / `schema.snippet` / `schema.read` just to learn command args.
- Use `help` (including `help` with `cmd`) and direct command execution.
- Do **not** call `api.capabilities` for routine reads/writes unless debugging connectivity/adapter issues.

## Default Workflow
1. Resolve scope with the smallest useful read command.
2. Execute the target operation with a first-class command (avoid manual patch flows if a command exists).
3. For writes, run changeset preview/validate/apply unless command already encapsulates this.
4. Return concise result with exact IDs/file keys and `applied` state.

## Fast Path Command Selection
- Page inventory: `pages.list`
- Page details: `page.get`
- Widget inventory: `widgets.list` (use `type`/`include` filters)
- Text field inventory: `textfields.list`
- Single widget read: `widget.get`
- Text update: `widget.updateText` (or `widget.set` when explicit key path required)
- Wrap/reparent helpers: `widget.wrap`, `widget.insert`, `widget.move`, `widget.reorder`
- Batch widget edits: `widgets.updateMany`
- Natural language routing: `intent.run`

## Snapshot & Freshness Rules
- Default to current/latest snapshot unless user pins one.
- `pages.list` may fallback to a fuller same-project snapshot unless `strictSnapshot:true`.
- If results look incomplete, check warnings and run `snapshots.refresh`.
- Do not infer deletion from partial refreshes / 429-heavy runs.

## Page Commands
- CRUD commands:
  - `page.create`
  - `page.get`
  - `page.update`
  - `page.delete`
  - `pages.list`
- `page.delete` is soft-delete behavior in this integration.
- Deleted pages are hidden by default from `pages.list`; use `includeDeleted:true` to show.

## Widget Commands
- CRUD commands:
  - `widget.create`
  - `widget.get`
  - `widget.set`
  - `widget.delete`
  - `widgets.list`
- Fast specialized read:
  - `textfields.list`
- Always pass page selector (`nameOrId` / `pageId` / `fileKey`) and `nodeId` when required.
- In non-split page YAML, selector resolution must be node-scoped before key set/delete operations.

## Performance / UX Rules
- Prefer 1-call or 2-call patterns.
- Avoid N+1 `widget.get` loops when a list command with filters can answer directly.
- Use `widgets.list` with `type` and `include` to reduce payload.
- Use `textfields.list` for “all text fields on page” requests.
- Avoid help/capability/schema fishing loops after a command already returns a shape/validation error with guidance.
- If a follow-up request says “this/that/it”, reuse prior `selection`/resolved IDs instead of rediscovery.

## Changeset Rules
- For writes, follow:
  1. create/add
  2. `changeset.preview`
  3. `changeset.validate`
  4. `changeset.apply` with `confirm:true`
- Only claim success if `applyResult.applied === true`.
- If blocked/fails, surface `reason` and the next concrete action.
- If command supports `apply:true`, prefer that command-level flow instead of re-implementing manual changeset orchestration.

## Policy Rules
- Respect `orbit.policy.json` boundaries.
- If writes fail due to policy, report blocked file key and policy reason.
- `orbit_policy_set` may be disabled unless environment permits policy writes.

## Prompt-to-Command Mapping (Preferred)
- “List pages” -> `pages.list`
- “List widgets on login” -> `widgets.list { nameOrId: "login" }`
- “All text fields on login” -> `textfields.list { nameOrId: "login" }`
- “Rename page X to Y” -> `page.update`
- “Update widget text” -> `widget.updateText` (fallback `widget.set`)
- “Delete widget id-... on page ...” -> `widget.delete`
- “Wrap widget in row/column” -> `widget.wrap`
- “Insert widget before/after ...” -> `widget.insert`
- “Move widget under ...” -> `widget.move`
- “Duplicate widget/subtree” -> `widget.duplicate`
- “Find and replace text on a page” -> `widget.renameText` or `widgets.updateMany`

## Output Expectations
- Return concise, structured answers.
- Include resolved identifiers (`snapshotId`, `pageId`, `nodeId`, `fileKey`) for traceability on write operations.
