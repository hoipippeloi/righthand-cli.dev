---
type: Decision
title: "CLI framework: citty over crust.js (proposed)"
description: Context
tags: [architecture, cli, framework, citty, crust, righthand, dependencies, bun]
status: proposed
timestamp: "2026-07-24T11:23:13.191Z"
---

# CLI framework: citty over crust.js (proposed)

## Context

The user's answer to PRD open question #1 (from
[[technical-approach-proposed-architecture]]) was: *"use citty or
https://crustjs.com/ whichever is better."* This named two candidates and asked
for an informed pick. The choice matters because righthand's plugin system,
JSON-manifest discovery, and MCP-shaped `tools --json` surface are **our own
framework-independent design** — so the framework is only the parsing/dispatch/
help layer, and for a product *distributed to others* with *third-party plugin
authors*, **stability is the decisive factor**.

This required real research: **crust.js** is ambiguous (two distinct "crust"
projects exist). The user means **chenxin-yan/crust** (crustjs.com) — a
Bun-native TS CLI framework — **not** the Polkadot blockchain API.

## Choice (PROPOSED — awaiting user confirmation)

**citty** (unjs) as the CLI parsing/dispatch/help layer.

## Comparison (the research that decides it)

| | **citty** (unjs) | **crust** (chenxin-yan) |
|---|---|---|
| Runtime | Node + **Bun** ✅ | **Bun-native** ✅ (Node mostly works) |
| Maturity | **Stable**, battle-tested (UnJS/Nuxt), widely used | **Alpha** (core v0.0.19, <400★, 4mo old, "expect breaking changes before 1.0") |
| Size | zero-dep, tiny | zero-dep, ~3.6kB core |
| Type DX | typed args via inference | **compile-time validation** (catches flag/alias/variadic bugs pre-runtime) |
| Standout modules | just the CLI builder | `@crustjs/skills`, `@crustjs/store`, `@crustjs/crust` (compile → binary) |
| Binary dist | n/a (npm JS) | via Bun `--compile` → **58–109MB binaries** |

## Alternatives considered

- **crust.js** — rejected (for now): Bun-native + compile-time validation is
  genuinely nicer author DX, but it is an **alpha dependency** with breaking
  changes promised before 1.0. Unacceptable risk for a shipped product others
  build plugins against. The `skills`/`store`/plugin modules it offers are ones
  we're building better-fit versions of ourselves anyway, so they don't tip the
  balance. Documented as the documented alternative with a real upside.
- **Hand-roll minimal dispatch** (the Ponytail-lean original proposal) — still
  viable and was the prior default; `citty` adds free typed parsing/help at
  near-zero cold-start cost, so it's a net win over hand-rolling.
- **oclif / Nx** — rejected earlier (cold-start weight; dispatch is trivial).

## Rationale

- Satisfies the "must support Bun" constraint (runs on Bun; `node:util`
  `parseArgs` is Bun-implemented).
- **Stable** — critical when third parties build plugins against righthand and
  when righthand is installed widely.
- Lighter distribution (npm JS on the user's existing runtime) than Bun
  binaries.
- Keeps righthand Node+Bun portable, not Bun-locked → broader reach. See
  [[bun-support-is-a-hard-constraint-npm-only-distribution]].

## Consequences

- Compile-time flag/alias validation (crust's nicest feature) is foregone;
  runtime tests must cover arg parsing instead.
- crust.js stays documented as the alternative; revisit once it hits 1.0 stable.
- This choice is flagged in the PRD as a **key technical decision / risk**.

## Status

**Proposed — NOT yet user-confirmed.** The turn ended with *"Confirm citty (or
override to crust)"*. Pending the user's lock before this graduates to
`accepted`. Resolves open question #1 on
[[technical-approach-proposed-architecture]].
