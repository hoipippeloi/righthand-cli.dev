---
type: Decision
title: Web research / search as a capability (D6)
description: Context
tags: [architecture, research, web-search, llm, pillars, righthand, scope]
status: accepted
timestamp: "2026-07-24T11:08:59.748Z"
---

# Web research / search as a capability (D6)

## Context

The user stated a new requirement: **"the cli can do research or search the web when needed."** They pointed at two reference skills as the methodology to match:

- `E:\skills.te9.dev\web-research` — **shallow**: decompose into subtopics → fan out parallel searches → write findings to files → synthesize. Fast, good for "look this up."
- `C:\Users\PTW\.pi\agent\skills\websearch-deep` — **deep**: 6-phase (problem decomposition → multi-query generation, 3–5 variations per sub-question, parallel batches → evidence synthesis with source ranking by credibility/freshness/relevance → numbered clickable citations → structured 250–350 line report → iterative refinement). Good for "decide this architecture."

Tasks handed to righthand sometimes need external knowledge (current best practices, library options, API facts, status pages) that the main coding agent would otherwise pull into its own context window to gather.

## Choice

Add **web research / search as a capability (D6)** to righthand's scope, supporting **two flavors**:

- **Shallow research** — subtopic decomposition + parallel search + synthesis. The "look this up" path.
- **Deep research** — the full 6-phase pipeline with source ranking and a structured cited report. The "decide this" path.

righthand performs the searching and synthesis itself and returns a compressed, cited summary — the noisy gathering and reading stays out of the caller's context window.

This slots into the scope picture as a **Phase 2** capability: it **depends on Pillar 4 ([[llm-augmented-commands-as-a-first-class-pillar]])** — synthesis needs an LLM, so research lands wherever the LLM pillar does.

## Alternatives considered

- **No web research — main agent searches itself** — rejected: contradicts the user's explicit requirement and burns the main agent's context window on gathering, the exact noise righthand exists to absorb.
- **Shallow-only** — rejected as the sole mode: the user pointed at a deep-research skill explicitly, signalling both "look up" and "decide this" are wanted.
- **Built-in search provider** (hardcode one engine) — deferred: see open question below; a pluggable backend is more in line with the [[extensible-plugin-system-is-a-first-class-architectural-pill]] pillar.

## Rationale

- Explicit user requirement.
- Reinforces righthand's core thesis: *keep noisy, context-heavy work out of the main LLM's window.* Web gathering is among the noisiest work there is.
- Two existing, proven methodologies were handed to us — no need to invent the approach, only to implement it as a command/capability.

## Consequences

- **Search backend must be chosen** — open question for the Technical Approach section. Candidates: SearXNG (self-hostable), DuckDuckGo, Brave Search API, Tavily, Serper, etc. Choice trades off self-hostability / privacy / cost / result quality.
- **Phasing dependency**: D6 is gated on P4 (LLM config). If P4 is Phase 2, D6 is Phase 2.
- Deep research writes a structured, cited report — this reuses the same "return compressed/summarized output" contract described in the compress-don't-relay principle.
- Feeds the [[self-recursive-self-building-agent]] capability (Pillar 5): a self-building righthand can research how to build its own new features.

## Status

Accepted as a scope capability (stated requirement). Phasing (Phase 2, behind P4) and search-backend selection remain open. Shapes the command surface and config (LLM provider + search provider) until superseded.
