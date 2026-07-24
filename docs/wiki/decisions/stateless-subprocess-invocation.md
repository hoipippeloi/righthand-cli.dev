---
type: Decision
title: "Subprocess-per-task invocation: righthand is stateless, not a daemon"
description: Context
tags: [architecture, invocation-model, stateless, righthand]
status: accepted
timestamp: "2026-07-24T10:30:15.771Z"
---

# Subprocess-per-task invocation: righthand is stateless, not a daemon

## Context

righthand is a CLI that a main coding LLM shells out to in order to offload
non-coding tasks (admin, CI/CD, docs, task tracking, etc.). An open design
question was: **how does the LLM talk to righthand, and how long does a
righthand process live?** This is foundational — it determines where state can
live and how the whole system is built.

## Choice

The LLM invokes righthand **as a subprocess via the terminal** for each task
(`righthand <command> ...`). The process is **spawned when a task starts and
torn down when the task finishes**. righthand is therefore **stateless per
invocation** — it is NOT a long-running daemon or background server.

## Alternatives considered

- **Long-running daemon/server** the LLM connects to over a socket / IPC, holding
  cross-task state in memory.
- **In-process library** linked into the main agent's runtime.

## Rationale

- Simplest possible invocation and teardown — no lifecycle management of a
  background process, no port/socket discovery the agent has to coordinate.
- Clean failure isolation: each task gets a fresh process; a crash in one task
  can't corrupt another's state in memory.
- Matches the "always-available CLI" identity already on record for
  [[righthand-cli]].

## Consequences

- **Any state that must survive across tasks — task history, progress, config,
  accumulated results — CANNOT live in process memory.** It must persist to disk
  (files or a DB) and be reloaded on every invocation.
- This shapes the storage and state-management design for the entire project:
  every piece of cross-task continuity is a persistence problem, not a global
  variable.
- Startup cost per task is paid every time, so cold-start latency matters (keep
  it fast).

## Status

Stated by the user during the Phase-1 PRD brainstorm as the current invocation
model. Treat as the working architectural baseline until a spec supersedes it.
