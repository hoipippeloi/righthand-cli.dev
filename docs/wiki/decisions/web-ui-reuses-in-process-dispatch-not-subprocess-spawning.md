---
type: Decision
title: Web UI reuses in-process dispatch (not subprocess spawning)
description: Context
tags: [architecture, web-ui, dispatch, c-web, righthand]
status: accepted
timestamp: "2026-07-24T14:20:18.120Z"
---

# Web UI reuses in-process dispatch (not subprocess spawning)

## Context

`righthand web` (C-web) introduces an alternate command surface: a self-contained SPA served by a stdlib `node:http` server, backed by two endpoints (`GET /api/tools`, `POST /api/run`). The question was how `/api/run` actually executes a command.

## The choice

The web server imports `dispatch` from `src/runtime.ts` and calls it **in-process** — the exact same code path the CLI uses. `POST /api/run` builds a `CommandContext` (`loadConfig()` + request args/flags, `isTTY:false`, `recordHistory:true`) and calls `dispatch(command, ctx)`, returning `{ envelope, exitCode }`.

## Alternatives considered

- **Spawn a `righthand` subprocess per request** (the agent-facing model). Rejected: every request re-parses layered config, re-discovers the manifest, and adds process-spawn latency. Worse, it would re-implement arg/flag plumbing outside the shared contract.
- **Reimplement dispatch inside the web layer** (parse args, run handlers directly). Rejected: guaranteed drift between CLI and web behavior, and doubles the surface for capability/rollback bugs.

## Rationale

By sharing one `dispatch()`:
- **Config layering** (`project > user > env`) is identical — the web UI sees the same providers/permissions as the CLI.
- **Capability gates** (deny-by-default, exit 6) apply identically; the UI can't bypass `net:llm` / `exec:*` grants.
- **Rollback/journaling** works through the web layer unchanged — verified E2E (`new` → `rollback` cycle driven entirely via `/api/run`).
- **Approval gate** still holds: the human clicking *Run* is the consent path, but genuinely destructive/expensive ops still escalate to `needs_human` unless the UI sends `--yes`. The click is consent; the gate is not removed.

It also preserves the **stateless-per-invocation model**: `righthand web` is a foreground one-shot server (Ctrl+C stops it), not a daemon — consistent with [[stateless-subprocess-invocation]].

## Consequences

- One bug-fix or behavior change in `src/runtime.ts` / `src/discover.ts` / `src/config.ts` / `src/capabilities.ts` flows to both surfaces for free.
- The server **refuses to run `web` inside itself** (`POST /api/run {command:"web"}` → 400) to prevent recursive server spawning; the SPA hides `web` from the command list.
- `src/web/server.ts` carries no framework and no build step (vanilla SPA in `app.html`) — matches [[no-build-step-run-typescript-source-directly]] and [[bun-support-is-a-hard-constraint-npm-only-distribution]].
- No new runtime dependency added; the web layer is pure stdlib.
