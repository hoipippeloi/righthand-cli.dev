---
type: Decision
title: citty is the CLI layer
description: Decision
tags: [cli, dependencies, technical-approach]
status: accepted
timestamp: "2026-07-24T11:23:22.549Z"
---

# citty is the CLI layer

## Decision

**Use [`citty`](https://github.com/unjs/citty) (UnJS) as righthand-cli's command-line framework** for parsing, subcommand dispatch, and argument handling — instead of hand-rolling a minimal dispatcher or adopting another CLI library.

Locked in the PRD brainstorm when the user confirmed "citty is okay."

## Context

The [[technical-approach-proposed-architecture]] decision listed the CLI dispatch layer as a choice between *hand-rolling minimal dispatch* or *`citty` for free TS-native parsing*. The cold-start and plugin-manifest constraints (JSON-only discovery, lazy handler import, sub-200ms dispatch) made hand-rolled parsing attractive on paper, but every subcommand still needs arg parsing, help text, and type-safe options regardless.

righthand-cli runs on the **Node + TypeScript runtime** ([[node-typescript-is-the-runtime-for-righthand]]); citty is TS-native with first-class type inference, which fits that stack directly.

## Alternatives considered

1. **Hand-roll a minimal dispatcher** — smallest dependency footprint, full control, but re-implements arg parsing + help generation + validation per command. Moves cost from "one dep" to "N commands of bespoke code," and bespoke parsing is a common bug surface.
2. **`commander`** — mature, ubiquitous, but JS-first (looser typing) and heavier API surface for a plugin-heavy tool.
3. **`yargs`** — feature-rich but historically large and complex for our needs.
4. **`clipanion`** — typed and class-based (used by yarn), but heavier mental model than citty's function style.

## Rationale

- **TS-native type inference** — subcommand options are inferred at compile time, matching the project's TS-first runtime and reducing `as`/manual typing.
- **Tiny + dependency-light** — aligns with the cold-start budget (R5) and the "fewest deps" instinct; citty is minimal compared to commander/yargs.
- **Function-based, composable API** — fits righthand's plugin model: each plugin command is a small function export, not a class hierarchy.
- **UnJS ecosystem** — well-maintained, stable, commonly paired with TS tooling.
- Resolves the open "hand-roll vs citty" option from [[technical-approach-proposed-architecture]] in favor of reuse over re-implementation (the codebase-already-solves-it / stdlib-first instinct).

## Consequences

- One runtime dependency added to righthand-cli's core.
- Plugin authors author commands in citty's define-command shape (document in the plugin authoring guide).
- Arg parsing/help generation/validation come "for free" — no bespoke code to maintain or test.
- If citty's dispatch proves slower than the cold-start budget allows, the seam (commands as function exports) is narrow enough to swap without rewriting commands.
