---
type: Decision
title: "Rollback version store: isomorphic-git (pure-JS) over system git or a custom VCS"
description: Context
tags: [architecture, rollback, version-store, git, isomorphic-git, c7, dependency]
status: proposed
timestamp: "2026-07-24T11:40:55.594Z"
---

# Rollback version store: isomorphic-git (pure-JS) over system git or a custom VCS

## Context

The [[rollback-and-reset-capability-c-reset]] decision locked *rollback-first scope* (app code preserved, journaled-before-apply, `--dry-run`) but left the **implementation mechanism proposed and unconfirmed**, with three open questions: (1) git-semantics store vs a custom VCS, (2) the snapshot/journal storage format and location, (3) the change-id scheme. [[righthand-core-architecture]] later accepted "managed footprint under an internal git-semantics store; reuse git, don't invent a VCS" — but did not name *which* git implementation.

The Phase 0 spec `.specs/rollback-reset/spec.md` (C7) concretizes all three open questions. This decision records the key, non-obvious call: **which git implementation backs the version store**.

## Choice (proposed in the C7 spec)

- **Version store implementation: `isomorphic-git`** (pure-JavaScript git). **No dependency on a system-installed `git` binary.**
- **Snapshot granularity: the whole managed footprint, per change.** Simplest correct strategy — the footprint is small (config, manifest, plugins, history), so per-file diffing isn't worth the complexity. Each change produces a before + after commit.
- **Rollback is itself journaled ("undo-the-undo"):** reverting a change writes its own snapshot/change_id, so a rollback is itself reversible. Keeps the "you can always undo it" philosophy symmetric.
- **change_id = ULID**, carried in the output envelope `meta.change_id` and the history log, linking the C7 version store ↔ the C9 history log ↔ the command envelope (see [[command-output-envelope-and-exit-codes]]).
- **v1 ships undo-manifest *creation*** (snapshot + change_id on every mutation); `righthand restore` (replay/re-apply a prior change) is a **proposed follow-up**, not v1.

## Alternatives considered

- **Shell out to the system `git` binary** — rejected: requires `git` installed on the host (not guaranteed in sandboxes/containers/CI runners that don't bake it in); adds a hard external dependency and cross-platform process/path overhead. isomorphic-git removes that dependency entirely.
- **A heavier native git library (e.g. nodegit)** — rejected: native bindings break the "runs identically on Bun + Node, cross-platform, no compilation" constraint ([[bun-support-is-a-hard-constraint-npm-only-distribution]]).
- **Custom journal + revert engine** — rejected (already): reinventing version control; more to build and verify than reusing proven git semantics ([[rollback-and-reset-capability-c-reset]]).

## Rationale

isomorphic-git is the realization of "reuse git, don't invent a VCS" with the **fewest external dependencies**: pure JS, no system binary, no native compile, identical behavior on Bun and Node. Whole-footprint snapshots trade a little disk for a lot of simplicity (no per-file diff bookkeeping) — the right lazy trade at this footprint size. Journaled rollback preserves the safety philosophy symmetrically.

## Consequences

- Resolves the three open mechanism questions on [[rollback-and-reset-capability-c-reset]]; that decision's "proposed, not user-confirmed" mechanism is now concretized (still **proposed** pending the user's Phase-0 review).
- Adds `isomorphic-git` as a runtime dependency.
- Every mutating write path must snapshot-before-apply + mint a ULID change_id.
- `righthand restore` (replay) is explicitly deferred to a follow-up.
