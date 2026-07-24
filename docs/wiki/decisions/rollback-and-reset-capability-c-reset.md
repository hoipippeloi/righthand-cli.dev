---
type: Decision
title: Rollback and reset capability (C-RESET)
description: Context
tags: [architecture, righthand, rollback, safety, pillars, c-reset]
status: proposed
timestamp: "2026-07-24T11:14:20.508Z"
---

# Rollback and reset capability (C-RESET)

## Context

During the PRD interview, the phrase "reset codebase" was ambiguous. The user **clarified it means "rollback from the last changes,"** not a factory nuke of the repo. This refined the C-RESET capability from "wipe everything" to **rollback-first**, with factory reset demoted to the extreme escape hatch.

C-RESET was framed as the **universal safety net** that closes Topic 3 (Scope & Boundaries): scope is "all in, nothing out," delivered in dependency order, with rollback/factory-reset underneath everything. It pairs directly with [[self-recursive-self-building-agent]] — *the LLM can write code into righthand, and you can always roll it back* — which is what makes the self-builder safe to ship.

## Choice (scope refined + locked; implementation mechanism proposed, not yet confirmed)

**Scope — locked (user clarification this turn):**

- **Rollback (primary):** undo the last change(s) righthand made — a generated plugin install, a config edit, a state mutation, a self-builder generation. Granular surfaces:
  - `righthand rollback` — revert the last change
  - `righthand rollback --steps N` — revert the last N changes
  - `righthand rollback <change-id>` — revert one specific change
- **Factory reset (the extreme):** wipe righthand's *entire managed footprint* (config, plugins, state, history) back to fresh-install. **Preserves application code always.**
- **Safety guarantees (locked):** app code is never touched without an explicit command; every write is journaled/snapshotted **before** it is applied; `--dry-run` previews a rollback.

**Implementation mechanism — proposed (lean for the Technical Approach section), NOT user-confirmed:**

- righthand journals/snapshots every change to its managed footprint *before* applying it; rollback = revert to the prior snapshot.
- Recommended: **borrow git semantics** (keep righthand's footprint under an internal version store) rather than invent a custom VCS. This is a *recommendation*, awaiting user confirmation.

## Alternatives considered

- **Factory nuke as the primary meaning of "reset"** — rejected by the user's clarification: the intent was granular rollback, not a wholesale wipe.
- **Invent a custom change-tracking/VCS scheme** — rejected as the recommendation: a git-style version store reuses proven semantics and is less to build than a bespoke journal+revert engine. (Noted as proposed; final call pending.)
- **Per-caller guards instead of journaled writes** — rejected: journaling once at the write boundary is the smaller, root-cause fix and makes rollback universally available, vs. teaching every caller to be reversible.

## Rationale

- The user's clarification was the explicit driver: rollback is primary, factory reset is the escape hatch.
- App-code-preservation + journaled-before-apply are the non-negotiables that make the self-builder (Pillar 5) safe — without a reliable undo, letting an LLM write into righthand is too risky to ship.
- "Borrow git semantics over a custom VCS" is the lazy/reuse-first recommendation (don't reinvent version control).

## Consequences

- Every write path in righthand (plugin install, config edit, state mutation, self-builder generation) **must journal a snapshot before applying** — this is now a cross-cutting requirement, not an afterthought.
- App code is inviolable by rollback/reset by design; factory reset touches only righthand's managed footprint.
- Pairs with [[self-recursive-self-building-agent]]: rollback is the safety net that justifies letting the LLM modify righthand.
- Still open: (1) user confirmation of the **git-semantics / internal version store** mechanism vs. a custom one; (2) the exact snapshot/journal storage format and location; (3) change-id scheme.

## Status

**Proposed (scope refined + locked; mechanism proposed).** Scope (rollback primary + factory-reset secondary, granular, app code preserved) and safety guarantees (journaled-before-apply, `--dry-run`) are **locked by the user's clarification this turn**. The implementation mechanism (git-style internal version store over custom VCS) is the assistant's **recommendation**, not yet user-confirmed — resolve before spec. This is a capability decision; see [[righthand-cli]] for the full capability index.
