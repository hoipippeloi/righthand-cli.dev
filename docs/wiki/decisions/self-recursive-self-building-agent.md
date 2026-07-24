---
type: Decision
title: Self-recursive self-building agent
description: Context
tags: [architecture, self-recursive, agent, code-generation, pillars, righthand]
status: proposed
timestamp: "2026-07-24T11:05:07.820Z"
---

# Self-recursive self-building agent

## Context

The user wants: **with an LLM configured, a user can tell righthand's LLM what features it wants, and the LLM then builds those features into righthand itself.** righthand becomes its own developer — a **self-recursive / self-building agent**.

This was flagged as the **riskiest, most novel pillar (Pillar 5).** It interacts tightly with [[extensible-plugin-system-is-a-first-class-architectural-pill]] — the self-builder is effectively the ultimate plugin author.

The broader generation mechanism is **not yet fully pinned down** (see Status), but its two safety-rail sub-questions were **resolved in Q5c** (see below).

## Choice (as a goal — mechanism narrowed, not fully locked)

righthand can **grow its own command surface via its LLM.** Three design models are on the table:

- **Model A — Persistent plugin generation (most ambitious):** the LLM writes real code — a new plugin/command file — saves it to disk, registers it in the manifest, and it becomes a first-class reusable command forever after. righthand literally grows new capabilities.
- **Model B — One-off ad-hoc tasks:** the LLM reasons + calls existing tools to accomplish the ask *this once*, but persists no new command. "Build me a feature" really means "do this thing for me now."
- **Model C — Hybrid (propose → diff → approve → install):** the LLM proposes new command code, a human reviews/approves the diff, then it's registered and run.

### Two safety-rail sub-questions — RESOLVED (Q5c, 2026-07-24)

1. **Auto-run vs. approve → RESOLVED: show-and-confirm before install.** Generated command code is shown to the human and confirmed **before** it is installed and made runnable — it is **never** auto-installed/auto-run. This rejects auto-run (the highest-risk option) and aligns with the **Model C** propose → diff → **approve** → install flow. Fast, but not invisible.
2. **Where generated code lives → RESOLVED: both locations, picked at generation time.** Generated code may target either **project-local** (in-repo, version-controlled) or **user-global** (`~/.righthand/plugins/`, shared across projects); the choice is made **per-generation**, not locked to one fixed root or a global default.

## Alternatives considered

- **Defer / drop the self-builder entirely** — rejected: it is an explicit user requirement and the most novel differentiator; it should at least be scoped, not silently dropped.
- **Commit to Model A (auto-run) now** — rejected: auto-installing LLM-generated code is a trust/safety decision, and the user explicitly chose show-and-confirm-before-install (Q5c), ruling out auto-run for v1.

## Rationale

- Explicit user requirement, and the single most differentiating feature vs. ordinary ops CLIs.
- The approval stance was the **user's explicit call (Q5c)**, not the spec author's default — the safe option was chosen deliberately. Recording it here means the generation→install flow must ship with a confirm gate, not grow one later.

## Consequences

- With the approval stance and code location resolved, the spec **can now define** the generation → show → confirm → install flow and the dual-target (project-local / user-global) storage path.
- The generation flow **must include a show-and-confirm gate before install**; auto-install/auto-run of LLM-generated code is out for v1.
- Storage **must support both project-local and user-global targets**, chosen at generation time (not a single fixed root).
- Still open: the precise generation **model** (A persistent vs B ad-hoc vs C hybrid) — narrowed toward C by the approval gate, but not formally locked.
- Whatever the model, it builds on [[extensible-plugin-system-is-a-first-class-architectural-pill]] (generated commands are plugins) and [[llm-augmented-commands-as-a-first-class-pillar]] (the builder is itself an LLM-augmented capability).

## Status

**Proposed (partially resolved).** Requirement accepted. **Approval stance = show-and-confirm-before-install** and **code location = both, picked at generation time** are **locked (Q5c, this session)**. The generation model (A/B/C, narrowed toward C) remains open — resolve before spec.
