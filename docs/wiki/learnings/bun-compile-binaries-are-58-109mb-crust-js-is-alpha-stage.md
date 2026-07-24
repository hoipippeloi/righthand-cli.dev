---
type: Learning
title: Bun --compile binaries are 58–109MB; crust.js is alpha-stage
description: Two non-obvious facts surfaced while evaluating the CLI framework (see
tags: [bun, distribution, crust, cli, dependencies, righthand]
timestamp: "2026-07-24T11:23:13.191Z"
---

# Bun --compile binaries are 58–109MB; crust.js is alpha-stage

Two non-obvious facts surfaced while evaluating the CLI framework (see
[[cli-framework-citty-over-crust-js-proposed]]) and runtime/distribution
([[bun-support-is-a-hard-constraint-npm-only-distribution]]) for righthand:

## Bun `--compile` produces 58–109MB binaries

Single-file binary compilation (Bun's selling point for CLI distribution)
bundles the entire Bun runtime into the executable, landing at **58–109MB**
per binary. This is far heavier than the typical npm-JS install story. Decision
impact: default to **npm distribution**, treat Bun-binary compilation as a
Phase-2 nicety only. Revisit if binary size improves or per-platform stripping
becomes practical.

## crust.js (chenxin-yan/crust, crustjs.com) is alpha

Not to be confused with the Polkadot blockchain "crust" API. The CLI framework
is at **core v0.0.19, <400★, ~4 months old**, with an explicit "expect breaking
changes before 1.0" warning. It is genuinely Bun-native and offers compile-time
flag/alias validation (nicer DX than citty's runtime inference), plus modules
for agent-skill gen, typed persistence, and compile-to-binary. But its maturity
makes it an unsuitable dependency for a shipped product others build plugins
against. Revisit once it hits stable 1.0.

**When this matters:** any future session considering Bun-binary distribution
or re-evaluating crust.js as the CLI framework.
