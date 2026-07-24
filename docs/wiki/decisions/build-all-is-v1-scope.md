---
type: Decision
title: Full vision is v1 scope — phasing is build order, not a scope cut
description: Context
tags: [scope, phasing, prd, righthand]
status: accepted
timestamp: "2026-07-24T11:13:11.822Z"
---

# Full vision is v1 scope — phasing is build order, not a scope cut

## Context

During PRD scoping, the open question was whether to **phase** righthand's vision (pick ONE ops domain for a minimal first release) or **build everything**. The user explicitly said **"build all."**

## Choice

The **entire vision is v1 scope** — Pillars P1–P5, C-AUTHOR, all five ops domains (D1–D5), and D6 research. **Nothing is feature-gated out.**

However, *scope = all* does **not** mean simultaneous delivery. The PRD's **Phasing** section becomes a **build sequence (dependency order)**, not a scope cut. Example: the self-builder (Pillar 5 / [[self-recursive-self-building-agent]]) cannot be built before the command contract (C-AUTHOR) it generates against exists. Everything ships, in dependency order.

## Alternatives considered

- **Single proof domain for a minimal first release** — rejected: the user said "build all."
- **Phased scope gating** (ship a subset now, gate the rest behind a later release) — rejected: nothing is out.

## Rationale

The user's explicit call, not the spec author's default. Recording it prevents future sessions from pruning features as "later / P2" — every part of the vision ships; sequencing is about **build order only**. The build-sequence-vs-scope-cut distinction matters because it reframes "phasing" from "what's deferred" to "what's sequenced."

## Consequences

- No feature is cut for v1; the PRD Phasing section is a **build-sequence plan**, not a scope cut.
- Build order still matters for **dependency** reasons (e.g. C-AUTHOR proven stable before the self-builder targets it).
- The full surface area raises the bar for the first usable release — it is larger than a single-domain MVP by design.

## Status

**Accepted** — scope stance locked by the user ("build all"). The build *sequence* is derived, to be finalized in the PRD Phasing section.
