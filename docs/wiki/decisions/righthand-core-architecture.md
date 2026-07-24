---
type: Decision
title: righthand core architecture
description: Context
tags: [architecture, righthand, cli, agent-tools]
status: accepted
timestamp: "2026-07-24T11:32:30.759Z"
---

# righthand core architecture

## Context

Greenfield project at `E:/righthand.cli`. Goal (defined in the PRD at `.prds/righthand-cli/prd.md`): a CLI that any AI coding agent (Claude Code, Cursor, Copilot/Codex, Aider, pi, etc.) shells out to as a **subprocess per task** to offload all non-coding operational work (CI/CD, logging, docs, tasks, admin, web research), returning a compressed, schema'd result so the agent's context window stays free for writing code.

## Choice

- **Runtime & CLI layer:** Node + TypeScript, targeting **Bun** while staying Node-compatible; **citty** as the CLI layer. Distribute via npm (Bun-binary compilation deferred — 58–109MB too heavy for the default install).
- **Lifecycle:** spawned per task, **stateless per invocation**; cross-task state on disk. No daemon, no live MCP server.
- **Plugin model:** static JSON-manifest fragments, MCP-shaped descriptors; handlers imported lazily (cold-start ≤200ms). 3 tiers: core / user-global / project-local. (Borrows oclif's manifest idea + MCP's descriptor shape, adopts neither framework nor transport.)
- **Ops backend:** wrap existing CLIs (`gh`, `kubectl`, `terraform`, `aws`, …) and compress their `--json` output. Universal coverage, no vendor-API reimplementation.
- **Rollback:** managed footprint under internal git-semantics store (`~/.righthand/.git` + `./.righthand/.git`); rollback = revert to prior snapshot. Reuse git, don't invent a VCS.
- **LLM providers:** OpenAI-compatible base (`type`, user-defined `baseURL`/`apiKey`/`model`/params — covers OpenAI/OpenRouter/Ollama/Groq/Together/local/vLLM) + native Anthropic; commands pick a provider by name.
- **Self-recursive self-builder:** an LLM writes new commands into righthand (Model A — persisted plugin, show-and-confirm install, project or user location), mandatory smoke-test-before-install, full rollback. Leads the design narrative; built last in the dependency sequence.

## Alternatives considered

- **MCP server** — rejected as primary: market is saturated (~3,700-line awesome-list) and **host-bound** (needs an MCP-aware client + JSON registration). A subprocess CLI is the only model reaching every agent (they all have a shell tool). righthand borrows MCP's *descriptor shape*, not its transport.
- **crust (chenxin-yan/crust)** as CLI layer — rejected over citty: Bun-native and nicer compile-time validation, but **alpha** (<400★, 4mo old, breaking changes expected) — wrong foundation for a distributed product + third-party plugin authors. righthand's plugin system is framework-independent, so crust's `skills`/`store` modules aren't needed.
- **oclif / Nx** as CLI/plugin framework — rejected: too heavy / wrong abstraction (Nx is build-orchestration, not discrete ops tasks; fights cold-start).
- **Raw CLIs only (no righthand)** — rejected: universal but context-expensive (the documented pain).

## Rationale

The empty quadrant in the landscape = one agent-invoked subprocess CLI that is plugin-extensible, stateless-per-task, owns ops tasks end-to-end, host-agnostic, and zero-config-first. Nothing occupies it. Every choice above maximizes universal reach + stability + reuse of proven mechanisms, and protects the two differentiators (plugin extensibility + the self-builder) with a rollback safety net.

See `.prds/righthand-cli/prd.md` for the full PRD and `research_righthand_problem/research_report.md` for the evidence base.
