---
type: Concept
title: Factory reset capability (C-RESET)
description: What is it?
tags: [capability, safety, reset, righthand]
timestamp: "2026-07-24T11:13:11.822Z"
---

# Factory reset capability (C-RESET)

## What is it?

**Factory reset (C-RESET)** is a first-class capability that returns righthand to a clean / known state, **undoing what righthand itself has built or configured.** It is the safety valve behind righthand's core design philosophy:

> righthand can do anything, but you can always undo it.

It is especially load-bearing now that the **self-builder ([[self-recursive-self-building-agent]], Pillar 5) writes code into righthand** — a reset is how you walk back generated / installed plugins to a clean baseline.

## Why does it matter?

- **It is the trust foundation for every powerful capability.** The self-builder writes code, plugins get installed, config mutates. Without a reliable undo, "righthand can do anything" becomes a liability. C-RESET is what makes that power safe to grant.
- **It de-risks the self-recursive self-builder** — generated/installed plugins can always be rolled back to a clean baseline.
- For a **distributable tool adopted by third parties**, a credible "return to known-good" path is table stakes for trust (see [[righthand-cli]]).

## Key rules / properties

- **Design philosophy (locked):** *righthand can do anything, but you can always undo it.* C-RESET instantiates this.
- **Proposed design (pending user confirmation):** graduated reset — e.g. `righthand reset plugins` / `config` / `history` / `all`, **defaulting to `--dry-run`** (show what *would* be wiped before doing it).
- **Preserves the user's actual application codebase.** It resets **righthand's own footprint**: config, LLM keys, all generated/installed plugins (project-local `.righthand/` + user-global `~/.righthand/`), manifest cache, history logs — *not* the user's project files.
- **Proposed safety (pending confirmation):** every reset writes an **undo manifest first** (a tarball of what is being deleted), so even a reset is recoverable.
- **Open:** the exact destructive scope is pending user confirmation. The assistant's recommendation is **footprint-reset + dry-run + undo-manifest**; touching the user's application codebase is assumed **not** intended.

## Relationships

- [[self-recursive-self-building-agent]] — the capability that makes reset most *necessary*: generated/installed plugins must be roll-backable to a clean baseline.
- [[righthand-cli]] — C-RESET is a lifecycle command of the product (e.g. `righthand reset ...`).
- [command-authoring-and-scaffolding](./command-authoring-and-scaffolding.md) — a sibling first-class capability (C-AUTHOR); both are load-bearing CLI capabilities with documented contracts.

## Source

- PRD scoping turn (this session) — the user requested a reset-to-factory-defaults capability ("all is allowed, but a user should be able to reset to factory defaults"). Recorded as capability **C-RESET** with the "undoable by design" philosophy. Exact mechanism pending user confirmation. No code committed yet.
