---
type: Concept
title: Ops domain commands (C8)
description: What is it?
tags: [c8, ops, ci, logs, docs, tasks, admin]
timestamp: "2026-07-24T12:42:16.268Z"
---

# Ops domain commands (C8)

## What is it?

The five **C8 ops command groups** — `ci`, `logs`, `docs`, `tasks`, `admin` — are the actual operational surface a coding agent shells out to. Each wraps an existing CLI (`gh`, `kubectl`, `aws`, `markdownlint`…) and **compresses** its output into the standard bounded `Envelope` (the core righthand value prop: the agent gets a decision-ready summary, never a raw log dump). They are auto-discovered core commands — one file each under `src/commands/`.

## Why does it matter?

This is righthand's end-user value: "compress, don't relay." Every group returns `{ ok, command, summary, result, needs_human, meta }` and degrades gracefully — a missing wrapped binary yields exit 5 (`DEP_MISSING`) with a `needs_human` install hint, never a crash.

## Key rules / properties

- One file per group at `src/commands/<name>.ts`, exporting `descriptor` + `run` + `cli`. Picked up by [righthand-core-architecture](./righthand-core-architecture.md) auto-discovery — **no shared-file edits** to add one.
- Each declares `capabilities` + `costTier: "free"`. Declared caps are enforced by dispatch (see [ops-commands-declaring-capabilities-are-capability-gated-bef](./ops-commands-declaring-capabilities-are-capability-gated-bef.md)): denied/ungranted → exit 6 before the handler runs.
- Missing wrapped binary → `throw new CommandError(EXIT.DEP_MISSING, …, needsHuman)` → exit 5 + `needs_human`.
- All subprocess work goes through `src/shell.ts` `runCli`, which has a runner test seam (`opts.runner` / module-level `setRunnerForTest`).

## The five groups

- `ci status [--branch]` / `ci logs [--run]` — wraps `gh run list` / `gh run view --log`. Compresses to `"main: 2 failed, 1 running"` + `{runs:[…]}`; logs to tail + error lines. caps `["exec:gh","net:api.github.com"]`.
- `logs tail [--source]` — picks first present of `kubectl logs` / `aws logs tail`; none → exit 5. caps `["exec:*","net:*"]`.
- `docs lint [--path]` — runs `markdownlint-cli2`/`markdownlint` if present, else a naive `.md` TODO/FIXME scan. caps `["fs:read"]`.
- `tasks list` — wraps `gh issue list --json`; compresses to `{open, items}`. caps `["exec:gh","net:api.github.com"]`.
- `admin env [--name]` — reads `process.env` + project `.env`; **values fully redacted** (`maskValue`), only keys + set-ness + a masked value emitted (bar #4). caps `["fs:read"]`.

## Relationships

- [righthand-cli](./righthand-cli.md) — the product these belong to.
- [ops-commands-declaring-capabilities-are-capability-gated-bef](./ops-commands-declaring-capabilities-are-capability-gated-bef.md) — why tests grant `allow:["*"]` and how exit 5 vs exit 6 split.
- [command-output-envelope-and-exit-codes](./command-output-envelope-and-exit-codes.md) — the envelope + exit-code contract every group returns.

## Source

- `src/shell.ts` — shared `runCli` subprocess helper + test seam + `hasBinary` presence check.
- `src/commands/{ci,logs,docs,tasks,admin}.ts` — the five groups.
- `test/shell.test.ts`, `test/ops.test.ts` — coverage with injected fake runners (no real `gh`/`kubectl` needed).
