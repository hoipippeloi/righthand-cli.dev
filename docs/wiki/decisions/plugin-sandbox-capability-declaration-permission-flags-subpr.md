---
type: Decision
title: "Plugin sandbox: capability declaration + permission flags, subprocess isolation for untrusted"
description: Context
tags: [security, plugins, permissions, v1]
status: accepted
timestamp: "2026-07-24T11:32:03.156Z"
---

# Plugin sandbox: capability declaration + permission flags, subprocess isolation for untrusted

## Context
[[righthand-cli]] is a distributed plugin host — it runs third-party and LLM-generated commands, so plugin trust varies from trusted-first-party to fully untrusted. This is the top risk (R1/R2) for a subprocess CLI that any coding agent shells out to. We need a v1 security baseline plus a hardening roadmap. Relates to [[extensible-plugin-system-is-a-first-class-architectural-pill]].

## Choice
- **Capability declaration (shared foundation):** every command/plugin declares capabilities in its manifest — `fs`, `network`, `exec`, `llm-cost` — plus a `destructive` boolean and a `cost_tier`.
- **v1 baseline enforcement:** capability-declaration + Node/Bun process permission flags (deny by default; grant per capability).
- **Approval gating:** destructive or high-cost runs require approval (interactive prompt), or `--yes` + logged warning in agent/non-interactive mode. Read-only/cheap runs execute freely.
- **v1 roadmap hardening:** subprocess isolation (separate process/seat for untrusted plugins — third-party + LLM-generated).

## Alternatives considered
- Pure allowlist of approved commands only — rejects the self-builder/extensibility narrative (C5/C2).
- Full sandbox-everything-from-day-one (separate process per plugin always) — too heavy for v1 trusted-first-party commands; deferred to hardening.
- No capability model, trust by convention — unacceptable for a host of untrusted code.

## Rationale
Capability declaration is the shared spine: it drives both sandbox enforcement AND approval gating with one mechanism (mirrors what ops MCP servers converged on). Permission flags give v1 teeth without a heavyweight sandbox; subprocess isolation layers on later for the genuinely untrusted set without re-architecting.

## Consequences
- Plugin manifests MUST declare capabilities (contract for [[command-authoring-and-scaffolding]]).
- Self-built ([[self-recursive-self-building-agent]]) commands land in the untrusted set until promoted.
- Agent mode needs a deterministic approval path (`--yes`) so non-interactive runs don't hang.
