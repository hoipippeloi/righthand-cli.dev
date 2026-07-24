---
type: Concept
title: Command authoring and scaffolding
description: What is it?
tags: [architecture, extensibility, plugin-system, authoring, scaffolding, righthand]
timestamp: "2026-07-24T11:10:19.413Z"
---

# Command authoring and scaffolding

## What is it?

**Command authoring & scaffolding (C-AUTHOR)** is the *explicit, documented, first-class* path for a human to create a new task/command for [[righthand-cli]]. Rather than leaving "how do I write a plugin" buried in a README, righthand ships a built-in command (e.g. `righthand new` / `righthand authoring`) that **states, defines, and shows** how to create a command: the file layout, the manifest-fragment schema, worked examples, **and a scaffolder that generates a starter command**.

It is the **complement** to the *autonomous* authoring path — [[self-recursive-self-building-agent]] (Pillar 5), where the LLM writes commands itself. The two share one contract: C-AUTHOR is the load-bearing, human-legible definition that Pillar 5 later generates against.

## Why does it matter?

- It is **foundational to the plugin system** ([[extensible-plugin-system-is-a-first-class-architectural-pill]], Pillar 3): you cannot have a plugin ecosystem whose authoring story is not first-class. A tool whose "write a plugin" path is a command (not a doc) is dramatically easier to grow an ecosystem around.
- It is the **contract the self-builder (Pillar 5) generates against.** A code generator needs a stable spec to generate against — C-AUTHOR *is* that spec. This is why the self-builder is sequenced *after* C-AUTHOR is proven stable: shipping a code generator before the contract it targets exists builds a generator with no spec.
- It keeps human-authored and LLM-authored commands **indistinguishable** at the contract level — both produce the same manifest-fragment + handler shape.

## Key rules / properties

- **Manifest-fragment schema** each command declares: `name` / `description` / `inputSchema` / `handler`.
- **Includes a scaffolder** that generates a working starter command (not just docs) — lowers the activation energy for new authors.
- **Explicit, not buried**: the authoring story is an invokable command, the complement to discovery (`righthand tools --json`).
- **Shared contract**: the same fragment schema + handler contract that C-AUTHOR documents is what [[self-recursive-self-building-agent]] (Pillar 5) generates against — one contract, two authors (human + LLM).
- **Verb is `new`** (implemented): `righthand new <name> [--scope project|user] [--desc <text>] [--dry-run] [--force]`. MVP — foundational (can't ship Pillar 2's plugin story without it).
- **Generated command follows the core auto-discovery pattern** (export `descriptor` + `run`, optional `cli`) — not a separate JSON manifest fragment (that's the C2 plugin model). `plugin: "@local"`, `costTier: "free"`. Written as **strip-only TS** using *only* `import type`, so the file is dynamically importable from any location with no runtime resolution of `../contracts.ts` (see [[node-strip-only-typescript-rejects-parameter-properties-enum]]).
- **Mutating + journaled**: the write is wrapped in `journal()` (snapshot before/after) and sets `meta.change_id`, so a scaffolded command is rollback-able ([[rollback-and-reset-capability-c-reset]]). Honors `--dry-run` (returns full content, writes nothing) and `--force` (overwrite gate; refuses otherwise).
- **Scope**: project → `./.righthand/commands/<name>.ts`; user → `~/.righthand/commands/<name>.ts`. Name validated as kebab-case (rejects path traversal by construction).

## Relationships

- [[extensible-plugin-system-is-a-first-class-architectural-pill]] — Pillar 3: C-AUTHOR is the human-facing half of extensibility; plugins can't exist without an authoring story.
- [[self-recursive-self-building-agent]] — Pillar 5: the *autonomous* authoring path; generates against the C-AUTHOR contract. C-AUTHOR must be proven/stable before the self-builder can reliably target it.
- [[righthand-cli]] — the product C-AUTHOR extends; a core lifecycle command of the CLI.

## Source

- PRD scoping turn — user requested an explicit "how to create new tasks/commands" capability; recorded as foundational capability C-AUTHOR.
- `src/scaffold.ts` — `renderCommand()` template renderer + `validateName()` kebab-case/path-traversal guard.
- `src/commands/new.ts` — the `new` command: validates, renders, writes into the footprint commands dir inside a journaled mutation.
- `test/scaffold.test.ts` — strip-only smoke (dynamic import), dry-run no-write, journaled write, user scope, overwrite refusal/`--force`, invalid-name.
