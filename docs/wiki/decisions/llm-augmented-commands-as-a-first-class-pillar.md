---
type: Decision
title: LLM-augmented commands as a first-class pillar
description: Context
tags: [architecture, llm, commands, pillars, righthand]
status: accepted
timestamp: "2026-07-24T10:59:58.754Z"
---

# LLM-augmented commands as a first-class pillar

## Context

The user requested that **the CLI be able to use an LLM when tasks/commands require one.** This was named alongside the existing pillars (run on Node, fast, extensible plugin system) — i.e. a core requirement, not an optional capability.

Some handed-off chores are pure ops ("run this, return the output"), but a meaningful class needs **reasoning over the result**: summarize CI failures, triage logs, draft docs from diffs, classify issues, suggest fixes. A CLI with no LLM can only do the first class; the second is what makes "the right hand" actually useful on messy output.

## Choice

Make **LLM-augmented commands a first-class architectural pillar (Pillar 4):**

- righthand has its **own** LLM provider/config (separate from the main coding agent that hands off to it).
- The command surface splits into two tiers: **"do the ops"** (pure execution) and **"do the ops *and reason about it*"** (ops + an LLM pass over the output).
- An LLM-configured righthand can be invoked mid-task to reason; with no LLM configured, righthand degrades gracefully to pure-ops commands.

This is the **fourth** pillar, after: (1) stateless subprocess invocation, (2) Node + TypeScript runtime, (3) extensible plugin system.

## Alternatives considered

- **LLM on every command (no pure-ops tier)** — rejected: overkill, adds latency/cost to trivial ops, and makes the tool unusable without an LLM configured.
- **No LLM at all (pure ops CLI)** — rejected: directly contradicts the user's stated requirement and leaves the high-value reasoning chores unhandled.

## Rationale

- Explicit user requirement.
- The chores righthand exists to absorb are disproportionately "messy output that needs interpretation"; reasoning is what turns raw ops into an answer the main agent can act on.

## Consequences

- righthand needs a **dedicated LLM config surface** (provider, model, key, maybe per-command overrides) distinct from any caller's config.
- Command authoring/spec must let a command declare "needs reasoning" vs "pure ops."
- Cost, latency, and offline behavior become first-class concerns — a reasoning command must degrade gracefully when no LLM is configured rather than hard-failing.
- Feeds into [[self-recursive-self-building-agent]] (Pillar 5), which is itself an LLM-augmented capability turned on righthand's own surface.

## Status

Accepted — stated by the user; framed as a new pillar during the PRD interview. Shapes the config surface and command-author contract until superseded.
