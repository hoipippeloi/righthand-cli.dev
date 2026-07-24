---
type: Decision
title: Technical approach — proposed architecture
description: Context
tags: [architecture, righthand, technical-approach, proposed, ops-backend, git-state, credentials, distribution, llm-provider, search]
status: accepted
timestamp: "2026-07-24T11:18:06.670Z"
---

# Technical approach — proposed architecture

## Context

Topic 6 (Technical Approach) of the PRD interview. The assistant made **opinionated calls grounded in the prior research** ([[righthand-problem-research-report]]) and the Ponytail reuse-first principle, presenting a complete proposed architecture for how righthand is built. The user has **not yet confirmed** it — the turn ended with **4 explicit open questions** ("answer these 4, or say 'your calls' to lock all recommendations"). This ADR captures the proposed direction + rationale + the open questions so future sessions have it even before final sign-off.

## Choice (PROPOSED — pending user confirmation on 4 calls)

Layer-by-layer proposed decisions:

| Layer | Proposed decision | Rationale |
|---|---|---|
| **CLI framework** | Hand-roll minimal dispatch (or `citty` for free TS-native parsing) — *not* oclif/Nx | Dispatch is trivial; frameworks add cold-start weight. Keep righthand thin. |
| **Ops integrations** | **Shell out to existing CLIs** (`gh`, `kubectl`, `terraform`, `aws`, `flyctl`…) as the universal backend, then **compress their `--json` output** | Universal + zero-reimplementation. Plugins can add direct-API backends later. Reinforces [[compress-don-t-relay]]. |
| **State + rollback** | righthand's managed footprint lives under an **internal git repo** (`~/.righthand/.git` + `./.righthand/.git`); rollback = git operations | Reuse proven versioning instead of inventing a VCS. **This is the implementation mechanism for** [[rollback-and-reset-capability-c-reset]] (previously noted there as a recommendation). |
| **Config** | layered: project `./.righthand/config.json` → user `~/.righthand/config.json` → env vars (env wins) | Standard precedence; zero-config default degrades gracefully. |
| **Credentials** | **OS keychain** (keytar) where available → env var fallback → never plaintext files, never stdout/logs/args | Security bar. |
| **Distribution** | **npm primary** (`npx righthand`, `npm i -g`); standalone binary (single-file bundle) as Phase-2 nicety | Node-native install; reach every agent via `righthand` on PATH. |
| **LLM provider** (Pillar 4) | **Provider abstraction**: OpenAI-compatible (covers OpenAI, Ollama, OpenRouter, most local) + native Anthropic; model + key in config/env | Covers the vast majority of setups with one abstraction. See [[llm-augmented-commands-as-a-first-class-pillar]]. |
| **Search backend** (Pillar 3/C6) | **Pluggable**, default to an agent-friendly paid API (**Tavily** or **Brave**) with a free fallback (**SearXNG** self-hosted / **DuckDuckGo** html) | Deep research needs a real backend; zero-config fallback for no-key users. See [[web-research-search-as-a-capability-d6]]. |

The **already-locked foundations** (Node+TS runtime, plugin model = static JSON manifest fragments / MCP-shaped descriptors with handlers imported on invocation, `righthand tools --json` MCP tool-descriptor surface, bounded-schema'd output contract, spawned-per-task stateless lifecycle) are recorded in their own ADRs ([[node-typescript-is-the-runtime-for-righthand]], [[extensible-plugin-system-is-a-first-class-architectural-pill]], [[stateless-subprocess-invocation]]) and are **not** re-decided here.

## Alternatives considered

- **Adopt a CLI framework (oclif/Nx)** — rejected: cold-start weight; dispatch is trivial.
- **Call vendor APIs directly instead of wrapping CLIs** — rejected: massively more code; loses universal coverage. Trade-off: depends on those CLIs being installed (open question #3).
- **Invent a custom change-tracking/VCS** — rejected: git-style internal store reuses proven semantics (also recorded in [[rollback-and-reset-capability-c-reset]]).
- **Bun runtime / native modules concerns** — explicitly surfaced as open question #4 (any hard constraints to honor).

## Rationale

- Reuse-first (Ponytail): wrap proven CLIs, borrow git semantics, lean on npm + OS keychain — build the minimum that covers the space.
- The provider + search abstractions deliberately cover the vast majority of real setups with one implementation each, with zero-config fallbacks so the distributable tool works for no-key users (see [[righthand-cli]] onboarding concern).

## Consequences / open questions (the 4 calls — all UNRESOLVED as of this turn)

1. **CLI framework** — hand-roll minimal, or adopt `citty`? (lean: hand-roll for cold-start; `citty` is tiny + free help/parsing.)
2. **Search backend default** — Tavily / Brave / Serper / self-hosted SearXNG / DuckDuckGo? Sets C6's out-of-box behavior.
3. **Ops backend stance** — confirm **wrap existing CLIs** over calling vendor APIs directly (trade-off: depends on those CLIs being installed).
4. **Hard tech constraints** — e.g. must support Bun, no native modules (keytar is native), air-gapped, "avoid framework X"?

## Status

**Proposed — NOT user-confirmed.** All 8 layer decisions and the 4 open calls are pending the user's response (or a "your calls" lock). Resolve before spec. Once confirmed, the locked layers should graduate to their own focused ADRs (or this one flips to `accepted`) and the open questions close.
