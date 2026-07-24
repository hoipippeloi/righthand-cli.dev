---
type: Learning
title: Wrapped-CLI ops commands must surface non-zero exits — ci had the bug, logs/tasks/docs likely do too
description: The gotcha
tags: [ops-commands, c8, bug-class, shell, runcli, exit-codes, e2e]
timestamp: "2026-07-24T13:48:19.072Z"
---

# Wrapped-CLI ops commands must surface non-zero exits — ci had the bug, logs/tasks/docs likely do too

## The gotcha

Ops commands that wrap an external CLI via `runCli()` (`src/shell.ts`) get back
`{ ok, code, stdout, stderr }`. A handler that **ignores `ok`** and returns a
benign default (e.g. `"none"`) on every path silently turns a *real failure* —
non-zero exit, not a git repo, not authed, CLI broken — into a **false success**
(`ok:true`, exit 0). That is worse than a raw dump: it is an *invisible* failure.

## Where it bit us

`src/commands/ci.ts` — `ci status` / `ci logs` swallowed `gh` failures as
`"none"` / exit 0. Surfaced by the first real end-to-end harness run (41 checks)
because `gh` was installed-but-failing ("not a git repo") and the command
reported success anyway. Fixed by adding a `ghFailed()` envelope (`ok:false`,
last stderr line as `summary`) and guarding each `runCli` call:

```ts
const res = runCli("gh", args);
if (!res.ok) return ghFailed("status", res);   // surface, don't swallow
```

## Forward-looking: sweep the other C8 domains

`logs`, `tasks`, `docs`, `admin` all wrap the same `runCli` and are the prime
suspects for the same anti-pattern. Sweep them before any ships against a live
backend. This is exactly the class of defect end-to-end testing catches that
unit tests miss — unit tests inject a fake runner that always "succeeds", so a
missing `!res.ok` guard never fires.

## Why it matters

Violates [[compress-don-t-relay]] (compression that hides failures is worse than
relay) and breaks the [[command-output-envelope-and-exit-codes]] contract
(`ok:true` implies success). Also relates to [[self-extending-safe-undo-loop]]'s
sibling fix for structured-error handling.

## Source

- `src/commands/ci.ts` — `ghFailed()` + the `runCli` guards (the fix).
- `src/shell.ts` — `runCli()` return shape.
- `.work/e2e.mjs` — the harness that caught it (one-shot, not committed to `test/`).
