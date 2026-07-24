---
type: Decision
title: Bun support is a hard constraint; npm-only distribution
description: Context
tags: [architecture, runtime, bun, node, distribution, npm, righthand, cold-start]
status: accepted
timestamp: "2026-07-24T11:23:13.191Z"
---

# Bun support is a hard constraint; npm-only distribution

## Context

The user's answer to PRD open question #4 (from
[[technical-approach-proposed-architecture]]) was: *"must support bun."* This
hardens the runtime posture beyond the existing
[[node-typescript-is-the-runtime-for-righthand]] decision (which picked plain
"Node, with TypeScript"). Bun support was previously an *open question*; it is
now a *constraint*. The turn also reframes distribution: Bun gives single-binary
compilation for free, but at a cost (see Consequences).

## Choice

**Target Bun, stay Node-compatible (runtime-agnostic JS).** Distribute via **npm
only** (`npx righthand`, `npm i -g`); Bun `--compile` single-binary distribution
is a **Phase-2 nicety, not the default.**

## Alternatives considered

- **Bun-locked (Bun-only runtime)** — rejected: narrows reach for a tool meant
  to be distributed to others; many users/agents have Node, not Bun.
- **Default to Bun-binary distribution** — rejected: Bun `--compile` produces
  **58–109MB binaries** (Bun runtime bundled in). Too heavy as a default
  install story; npm JS on the user's existing runtime is far lighter.

## Rationale

- User explicitly required Bun support.
- Staying Node-compatible maximizes reach while satisfying the Bun requirement
  — runtime-agnostic JS costs little and blocks neither.
- npm distribution is lightweight and universal; the binary path is available
  later without committing to its size penalty now.

## Consequences

- **Every dependency must be Bun-compatible** — this is now a hard selection
  gate. Native modules (e.g. `keytar` for OS keychain in the proposed
  credentials layer) are a known risk on Bun and must be verified or swapped
  for a Bun-safe alternative. Flagged as an open risk.
- Distribution model is settled: npm primary. Binary compilation deferred to
  Phase-2.
- Cold-start budget still governed by [[stateless-subprocess-invocation]]
  (righthand is spawned fresh per task); Bun's fast boot helps here but does
  not remove the "keep plugins lazy" rule.

## Status

Accepted — derived from the user's Topic-6 answer #4 ("must support bun").
Extends (does not supersede) [[node-typescript-is-the-runtime-for-righthand]].
Resolves open question #4 on
[[technical-approach-proposed-architecture]].
