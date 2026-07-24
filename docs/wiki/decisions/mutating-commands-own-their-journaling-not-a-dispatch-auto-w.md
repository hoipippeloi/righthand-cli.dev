---
type: Decision
title: Mutating commands own their journaling (not a dispatch auto-wrap)
description: Context
tags: [c7, journal, rollback, dispatch]
status: accepted
timestamp: "2026-07-24T12:21:28.795Z"
---

# Mutating commands own their journaling (not a dispatch auto-wrap)

## Context

C7 requires every righthand mutation to be reversible via before/after git snapshots keyed by a `change_id`. The task suggested dispatch auto-wraps any command with `descriptor.mutates` in `journal()`. But mutating commands (config set, reset, rollback) must also honor `--dry-run` (mutate nothing) and interactive `--yes`/confirm — and dispatch can't know those semantics before the command runs.

## Choice

**Mutating commands own their journaling.** `descriptor.mutates` stays as a declarative hint (visible in `tools`, documents intent) but `dispatch` does **not** auto-wrap. Each mutating command calls `journal(scope, summary, mutate)` itself around exactly the work it actually performs, after it has resolved scope + checked dry-run/confirm. The returned `change_id` is set on `env.meta.change_id`.

`journal()` flow: ensure footprint dirs + isomorphic-git store → snapshot `before:<id>` → run mutate → snapshot `after:<id>` → return id.

## Alternatives considered

- **Dispatch auto-wrap on `descriptor.mutates`.** Rejected: it snapshots *before* the command decides (via dry-run/confirm) whether to mutate, producing empty/no-op change entries and orphan `before` commits on refusals. Also can't pick the correct scope (e.g. `init` must target `project` even when no project footprint exists yet, which `resolveActiveScope` would mis-route to `user`).

## Consequences

- `config set`, `init`, `reset`, and `rollback` (via `revertTo`, which is itself journaled — undo-the-undo) each call `journal()` internally.
- History append stays in `dispatch` (always-on for recorded dispatches); it reads `env.meta.change_id` so the history row links to the change.
- A mutating command that throws mid-mutation leaves an orphan `before` commit (no `after`); `listChanges` filters incomplete pairs, so it never appears as a rollbackable change. Acceptable for v1.

See [[rollback-and-reset-capability-c-reset]], [[decisions/rollback-version-store-isomorphic-git-pure-js-over-system-gi]].
