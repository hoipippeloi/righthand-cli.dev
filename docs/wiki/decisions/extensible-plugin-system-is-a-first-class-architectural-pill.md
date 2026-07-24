---
type: Decision
title: Extensible plugin system is a first-class architectural pillar
description: Context
tags: [architecture, extensibility, plugin-system, modularity, righthand]
status: accepted
timestamp: "2026-07-24T10:36:46.515Z"
---

# Extensible plugin system is a first-class architectural pillar

## Context

The user's third stated want for righthand was: **"easily extensible/modular so
others can build tasks/commands into it as well."** This was not a side request —
it was named alongside "run on node" and "fast" as a core requirement, and the
interviewer flagged it as significant: "it'll shape the command interface,
discovery, and the spec we hand off."

Because [[righthand-cli]] is a standalone, third-party-distributable product
(own repo, installable by outside users), third-party extensibility is core to
its adoption and longevity — not a feature to bolt on after v1.

## Choice

Make a **modular plugin / extension system a first-class architectural pillar**:
third parties can author and register their own tasks/commands that righthand
discovers and dispatches just like built-in ones. Extensibility is a design
constraint from day one, not an afterthought.

## Alternatives considered

- **Monolithic built-in command set** — ship only first-party tasks; no external authoring. Rejected: directly contradicts the user's requirement.
- **Extensibility deferred to later** — build closed first, "add plugins someday." Rejected: retrofitting a plugin seam onto a closed dispatch core is painful and tends to leak internals.

## Rationale

- Explicit user requirement — extensibility was named as a core want, not derived.
- righthand is distributed to others; the value of "the right hand" compounds when the community can grow the task surface beyond what the core team ships.
- Deciding this now (before the spec) means the command interface, the discovery mechanism, and the task-author contract are designed *around* external authors rather than retrofitted.

## Consequences

- The **command interface, plugin discovery, registration, and the task-author contract/spec must all be designed for external authors** — these are now first-class design problems, not follow-ups.
- Tension to manage with the lazy-loading cold-start rule from [[node-typescript-is-the-runtime-for-righthand]]: the discovery layer must find plugins cheaply, but load each one only on demand.
- The spec handed off downstream must include a plugin-author section.

## Status

Accepted — stated by the user during the Phase-2 PRD interview (Q3). Shapes the
spec and everything downstream until superseded.
