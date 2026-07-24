---
type: Learning
title: config set must JSON-coerce arrays/objects — the layered merge silently drops wrong-typed values
description: What happened
tags: [config, capabilities, bug, gotcha]
timestamp: "2026-07-24T16:49:08.432Z"
---

# config set must JSON-coerce arrays/objects — the layered merge silently drops wrong-typed values

## What happened
While validating [[setup-md-llm-onboarding-runbook]] Step 5, `righthand config set permissions.allow '["net:llm"]'` was stored as the **string** `["net:llm"]`. The layered config merge only accepts `permissions.allow` as an **array**, so the string value was **silently dropped** — the capability grant vanished and `llm ask` exited `6` (capability-denied) even though the user thought they'd granted it. `config set` returned exit 0 with no warning.

## Root cause
`coerceValue()` in `src/config.ts` only handled `true`/`false`/integers/else-string; JSON-looking strings were never parsed, so `[...]`/`{...}` landed as strings. The merge step (`mergeConfig`/layering) is **type-strict** — it discards a value whose shape doesn't match the schema, with no error and no log line.

## Fix
`coerceValue` now best-effort JSON-parses any value that starts with `[`/`{` and ends with `]`/`}` (falls through to string on parse failure). +1 regression test (`config set` array round-trip). Re-verified the SETUP flow end-to-end: the grant persists and `llm ask` proceeds past the capability gate (exit 4, not 6). 174/174 tests pass.

## Durable gotcha (still true)
The **layered config merge silently drops type-mismatched values**. The coercion fix means `config set` now produces the right type for literals, but code that writes config directly (or a future regression) can still hit this. When a `config set` "succeeds" but a grant/flag has no effect:
- array keys (`permissions.allow`, etc.) must land as a real JSON array,
- object keys as a JSON object literal,
- always `config get <key>` after `set` to confirm the **stored type** (not just presence).

This also matters because capabilities are deny-by-default ([[plugin-sandbox-capability-declaration-permission-flags-subpr]]) — a dropped `permissions.allow` entry looks exactly like a denied command, masking the real cause.

## Source
- `src/config.ts` — `coerceValue()` (~line 162) and `setPath()` (~line 157)
- `SETUP.md` Step 5 — the capability-grant flow that surfaced the bug
