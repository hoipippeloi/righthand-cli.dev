---
type: Artifact
title: righthand CLI PRD
description: "The initiative-level Product Requirements Document for [[righthand-cli]] — the why, scope, and 10 high-level capabilities, written so a spec-writer can expand e"
tags: [prd, planning, righthand-cli]
timestamp: "2026-07-24T11:32:03.160Z"
---

# righthand CLI PRD

The initiative-level Product Requirements Document for [[righthand-cli]] — the why, scope, and 10 high-level capabilities, written so a spec-writer can expand each into an implementation spec.

## What it documents
- [[righthand-cli]] — the product this PRD defines.
- The headline narrative: righthand = a subprocess CLI any coding agent shells out to, that owns all non-coding ops work, compresses the result out of the agent's context, is plugin-extensible, and grows its own command surface via an LLM — safely, because everything is rollback-able.
- **13 spec candidates** (what a spec-writer creates next): Core Runtime & Dispatch (C1), Plugin System (C2), Plugin Sandbox & Permissions (R1/R2), Authoring & Scaffolder (C3), Rollback & Reset (C7), Lifecycle & Config (C9), LLM Provider Integration (C4), Ops Domains (C8.1–C8.5), Web Research (C6), Self-Builder (C5), Doctor (C10).

## Details
- **Location**: `.prds/righthand-cli/prd.md`
- **Format**: Markdown (rendered in-browser for review)
- **Companion**: `.prds/righthand-cli/transcript.md` — the design-decision interview that locked 8 open questions.
- **Evidence base**: `research_righthand_problem/` — 3 findings files + synthesis report (see [righthand-problem-research-report](./righthand-problem-research-report.md)).
- Generated from: a structured new-PRD interview that resolved 8 delegated design questions into opinionated best-practice calls.

## Lifecycle
- First added: 2026-07 — initiative-level PRD, produced after problem research + design interview.
