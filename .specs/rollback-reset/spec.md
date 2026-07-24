# Spec: C7 — Rollback & Reset

**Status:** Draft · **Priority:** Must (foundational safety — must exist before C5) · **Depends on:** C1, C9 · **Blocks:** C5 (self-builder is unsafe without this)

## Goal

The universal safety net: every change righthand makes is **reversible**. Provide
`rollback` (undo the last N changes / a specific change), `reset` (factory reset
of a scope), and `changes` (browse the change log). Implementation reuses **git
semantics** over the righthand footprint — no custom VCS invented.

This is load-bearing for the self-builder (C5): "the LLM can write code into
righthand, and you can always roll it back." It must exist *before* C5.

## Core design: the footprint is a git repo

Each righthand footprint dir (`~/.righthand/` and `./.righthand/`) is initialized
as a **git repository** (internal — never the user's project repo). righthand
performs its mutations as **versioned commits** on this repo:

- **Before** a mutating command applies its changes, the runtime takes a snapshot
  of the current footprint state (an auto-commit keyed to the upcoming `change_id`).
- **After** the changes are applied, another auto-commit records the new state,
  tagged with the same `change_id`.
- Rollback = `git revert`/`reset` to the pre-change commit. The two-commit
  pattern (before/after) lets us undo cleanly even when a single command makes
  many file changes.

> **Implementation note:** use `isomorphic-git` (pure-JS, runs on Bun + Node, no
> shelling out to `git`) so the version store works without a system `git` and
> stays cross-platform. This is the "reuse git, not a custom VCS" decision.

### What lives in the version store

Tracked (snapshotted on mutation): `config.json`, `manifest.json`, `plugins/`,
generated command code, any plugin-authored state files.

**Not tracked / excluded** (`.gitignore` equivalent): `history.jsonl` (append-only
log, managed separately by C9), `credentials` (keychain-backed, never in repo),
`.git/` itself.

## `change_id` (shared contract)

A ULID assigned by the dispatch flow (C1, step 5) to every invocation that
mutates state. Format: `chg_01H...`. Recorded in:

- the `history.jsonl` row (C9),
- the version-store commit message/metadata,
- the command's output envelope `meta.change_id`,
- the change log browsable via `changes`.

## Commands

### `righthand changes [--last N] [--since <ts>] [--json]`

List the change log (the recorded `change_id`s in reverse-chronological order):
what command made the change, when, scope (project/user), and a one-line summary
of files touched. `--json` → envelope with `result.changes: Change[]`. This is
the "what did righthand just do" view.

### `righthand rollback [--steps N] [--to <change-id>] [--dry-run] [--scope project|user]`

Undo changes:

- **Default (`rollback`):** undo the single most recent change (revert to its
  pre-change snapshot).
- `--steps N`: undo the last N changes.
- `--to <change-id>`: roll forward/back to the state *just before* that change.
- `--dry-run`: print the exact files that would change (diff summary) without
  mutating. Always honored.
- `--scope`: which footprint store to act on (default: project if it exists, else user).

Rollback itself is **a mutation** → it journals its own new `change_id`, so a
rollback is itself rollback-able (undo-the-undo). The before/after snapshot pair
is preserved.

### `righthand reset [<scope-target>] [--dry-run] [--keep-manifest]`

Factory reset — wipe a footprint back toward fresh-install. **Always preserves
the user's application source code** (righthand never touches it; the version
store only covers the footprint). Targets:

- `reset plugins` — remove all installed/generated plugins, rebuild manifest.
- `reset config` — restore `config.json` to defaults (credentials untouched).
- `reset history` — clear `history.jsonl`.
- `reset all` — all of the above (back to fresh-install state).

Behavior:

- `--dry-run` (default-safe): list everything that would be deleted, **and write
  an undo manifest first** (see below). Refuse to run non-dry without explicit
  confirmation (or `--yes`).
- `--keep-manifest`: in `reset plugins`, keep the merged manifest cache (rebuild
  only, don't delete plugin code references) — niche escape hatch.

## Undo manifest (safety)

Before any **reset** actually deletes files, righthand writes an **undo
manifest**: a tarball (`.tar.gz`) of everything being deleted, plus a JSON index,
saved to `<footprint>/._resets/<timestamp>/`. This guarantees even a factory
reset is recoverable for a grace window. Retention: keep last 5 undo manifests,
then age out (configurable). A future `righthand restore <undo-id>` can replay
from an undo manifest (deferred to a follow-up; note as open question).

## Behavior & flows

- **Mutation detection:** the runtime (C1) decides if a command mutated state
  (config write, plugin install, generated code, etc.). Mutating commands call
  into this spec's `journal()` before applying.
- **journal(change_id, summary):** snapshot-before → apply → snapshot-after →
  record in change log.
- **Rollback path:** resolve target snapshot from `change_id` → `--dry-run` diff
  → (confirm) → `isomorphic-git` reset to that commit → journal a new change
  recording the rollback → emit envelope summarizing restored files.
- Non-mutating commands (e.g. `ci status`) create no change and never touch the
  version store.

## Security

- The version store is scoped **strictly to the righthand footprint**. A
  `reset --all` deletes footprint contents only; it cannot reach the user's app
  code (enforced by the same root-guard as C1).
- Credentials excluded from the store and from reset targets (never deleted by
  reset; managed by C4/keychain).
- `reset` without `--dry-run`/`--yes` requires interactive confirmation; in agent
  mode (`--yes`) it logs a prominent warning to history.

## Error handling & exit codes

- Use C1's exit codes. Unknown `change_id` → exit 2. Snapshot/restore failure
  (corrupt store) → exit 1 with a clear message pointing at the undo manifest.
- If the version store itself is corrupt, `reset`/`rollback` must degrade safely:
  never delete the only copy of anything without the undo manifest existing first.

## Testing strategy

- **Unit:** before/after snapshot pairing; `change_id` round-trip; `--dry-run`
  diff correctness; undo-manifest creation + content integrity.
- **Integration:** make a mutating change → `changes` shows it → `rollback` →
  assert state matches pre-change → `rollback` again (undo-the-undo) → assert
  restored. This is the load-bearing test: **rollback correctness is the
  trust foundation for C5.**
- **Reset safety:** `reset all` must not delete anything outside the footprint
  (assert via a sentinel file in the parent dir surviving).
- **Self-check:** a `__main__` that performs a fake mutation + rollback and
  asserts byte-equality of the footprint.

## Open questions

- `righthand restore <undo-id>` (replay from undo manifest) — in-scope for v1 or
  follow-up? Propose: follow-up; v1 ships undo-manifest *creation* only.
- Whether `rollback --steps N` should require confirmation beyond `--dry-run`
  (propose: same confirm rules as `reset`).
- Snapshot granularity: per-file vs whole-footprint commit. Propose: whole-
  footprint commit per change (simplest correct; footprint is small).

## Out of scope

- Dispatch flow / mutation detection → **C1** (this spec provides `journal()`,
  C1 calls it).
- History log *format/write* → **C9** (this spec writes the *change log*; both
  share the `change_id`).
- Self-builder's generated-code lifecycle → **C5** (relies on this spec's rollback).
