---
type: Decision
title: General-purpose persona targeting
description: Context
tags: [product, positioning, personas, scoping, righthand]
status: accepted
timestamp: "2026-07-24T11:00:28.375Z"
---

# General-purpose persona targeting

## Context

PRD-interview persona question (Q5): which user(s) is righthand primarily for? The four candidate personas were indie/hobbyist, pro developer, DevOps/SRE, and general.

## Choice

**righthand targets a general-purpose audience — all four personas matter.** They share one core need (offload non-coding chores from the coding agent), so v1 is not gated on a single persona.

Within that, the **pro developer with real ops tooling is the sharpest design target** — they have the most chore-surface to offload (real CI/CD, logging, releases, issue triage), so when design decisions conflict, optimize for their case as the reference user.

## Alternatives considered

- **Gate v1 on one persona (e.g. indie-only or SRE-only)** — rejected: narrows scope prematurely and excludes users with the same underlying need.
- **All personas equal, no design target** — rejected: no focus point makes prioritization arbitrary and bloats v1 trying to please everyone.

## Rationale

- The core need (hand off the non-coding "rest") is shared across all four; a single persona gate would solve the same problem fewer times.
- Naming a reference persona keeps tradeoffs grounded: when "what would a pro dev with real ops expect?" conflicts with a simpler indie default, the pro-dev answer wins for v1, and the simpler path is a future simplification, not the design center.

## Consequences

- Features serve the shared core need; persona-specific deep-dives wait.
- Pro-dev-with-ops is the default reference user in design/scope debates.
- Onboarding/first-run must still stay low-friction for the general audience (see [[righthand-cli]] distribution concerns).

## Status

Accepted — locked during the PRD interview (Q5). Pro-dev-with-ops is the design target; general-purpose is the audience.
