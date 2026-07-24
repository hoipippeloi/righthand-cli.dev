---
type: Concept
title: Command output envelope and exit codes
description: What is it?
tags: [contract, io, envelope, exit-codes, c1, agent-interface]
timestamp: "2026-07-24T11:40:55.593Z"
---

# Command output envelope and exit codes

## What is it?

The **bounded output contract** every righthand command returns: a single standard **JSON envelope** on stdout (when piped) plus a small, fixed **exit-code** set. Defined in `.specs/core-runtime/spec.md` (C1) as the shared contract every other capability (C2/C3/C7/C9/ops domains) references. It is how a coding agent reliably consumes righthand's result without parsing free-form text, and how automation branches on success/failure.

Envelope shape:

```jsonc
{ "ok": true, "command": "ci.status", "summary": "main: 2 failed, 1 running",
  "result": { /* structured, command-specific */ },
  "needs_human": null,
  "meta": { "version", "duration_ms", "change_id": null, "tokens_used": 0 } }
```

Exit codes: `0` success · `1` generic failure · `2` usage/arg error · `3` `NEEDS_HUMAN` (agent must escalate) · `4` auth/credential · `5` dependency missing · `6` capability denied.

## Why does it matter?

- It is the **I/O contract between righthand and the agent that calls it** — previously an open question on [[righthand-cli]] ("exact command surface & I/O contract"), now locked by C1.
- The `summary` field is the **single highest-leverage output**: it is what an agent reads *instead of* ingesting raw logs. This is the whole point of righthand — keep the main agent's context free of ops noise (see the [[compress-don-t-relay]] rule).
- Non-zero exits **still emit the envelope** (with `ok:false`), so an agent gets structured failure context, not just a process exit.
- Exit code 3 (`NEEDS_HUMAN`) + a non-null `needs_human` reason are the paired mechanism by which righthand signals "I can't finish this autonomously — escalate."

## Key rules / properties

- **Output mode:** JSON envelope by default when stdout is **piped**; human-readable when a **TTY**. `--json` / `--quiet` / `--full` / `--raw` flags override. `--raw` replaces the envelope with untransformed underlying-tool output (escape hatch).
- **`summary` ≤ ~120 chars**, decision-ready in one line; full detail lives in `result`.
- **`meta.change_id`** is set only when the command mutated state — it carries the ULID that links into [[rollback-and-reset-capability-c-reset]]'s version store and the C9 history log. Null for read-only commands.
- **Exit codes map 1:1 to envelope state** (e.g. `needs_human != null` ⇒ exit 3; capability refused ⇒ exit 6). Codes propagate everywhere, so they were the C1 review focus.

## Relationships

- [[righthand-cli]] — this is the I/O contract the product exposes to calling agents; resolves the entity's open "I/O contract" question.
- [[rollback-and-reset-capability-c-reset]] — `meta.change_id` (ULID) is the cross-link into the version store / history.
- [[stateless-subprocess-invocation]] — the envelope is the stateless hand-back: no session, no daemon, just stdin → stdout per task.
- [[compress-don-t-relay]] — `summary` is the compression surface that rule operates on.

## Source

- `.specs/core-runtime/spec.md` (C1) — "Bounded output contract" + "Exit codes" + "Discovery: `righthand tools --json`" sections. Authoritative.
