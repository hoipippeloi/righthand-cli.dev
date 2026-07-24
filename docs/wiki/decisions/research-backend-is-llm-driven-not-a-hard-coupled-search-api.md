---
type: Decision
title: Research backend is LLM-driven, not a hard-coupled search API
description: Context
tags: [architecture, research, web-search, llm, search-backend, righthand, scope]
status: accepted
timestamp: "2026-07-24T11:23:13.191Z"
---

# Research backend is LLM-driven, not a hard-coupled search API

## Context

[[web-research-search-as-a-capability-d6]] left "search backend must be chosen"
as an open question, with proposed candidates (Tavily / Brave / Serper /
self-hosted SearXNG / DuckDuckGo) and a default leaning toward "pluggable,
default an agent-friendly paid API." This turn **revises** that: the user's
answer #2 pointed at the `E:\skills.te9.dev\web-research` skill methodology and
specified riding **the configured LLM's own web features when available.**

## Choice

C6 web research is **LLM-driven**, following the `web-research` skill
methodology (decompose → parallel search → findings → synthesize), and rides
**the configured LLM's own web-access features when available.** **No
hard-coupled search API** is part of the core. A direct search-API plugin can be
added later via the [[extensible-plugin-system-is-a-first-class-architectural-pill]].

Research quality **scales with the provider** — a model with strong native web
access produces better research than one without.

## Alternatives considered

- **Pick one search provider as the core default** (the earlier proposed
  direction: Tavily/Brave default + SearXNG/DDG fallback) — superseded by this
  decision. Adds a hard vendor dependency + key/config burden the LLM path
  avoids.
- **Hardcode a search engine** — rejected: contradicts the pluggable principle
  and the LLM-driven intent.

## Rationale

- User explicitly pointed at the skill methodology + LLM's own web features.
- Avoids a hard dependency on a search vendor and its API key/config onboarding
  friction — better zero-config story.
- LLMs increasingly ship native web access, so riding the provider is forward-
  compatible and needs no extra plumbing in core.

## Consequences

- The earlier "search backend must be chosen" open question on D6 is
  **closed** — answer: the LLM is the backend by default; a search-API plugin
  is optional and additive, not a core requirement.
- D6's Phase-2 dependency on Pillar 4 ([[llm-augmented-commands-as-a-first-class-pillar]]) still holds — research needs an LLM regardless.
- Deep-research output still reuses the compress-don't-relay contract
  ([[compress-don-t-relay]]).

## Status

Accepted — derived from the user's Topic-6 answer #2 (web-research skill + LLM
web features). Revises/resolves the search-backend open question on
[[web-research-search-as-a-capability-d6]] without superseding the capability
itself.
