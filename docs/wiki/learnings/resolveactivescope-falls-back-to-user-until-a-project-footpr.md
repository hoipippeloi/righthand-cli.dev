---
type: Learning
title: resolveActiveScope falls back to "user" until a project footprint exists
description: `resolveActiveScope()` in `src/footprint.ts` returns **"project"** only when `./.righthand/` (or `.git/`) exists in the project root; otherwise it returns **"us
tags: [testing, footprint, scope, righthand, gotcha]
timestamp: "2026-07-24T12:46:44.926Z"
---

# resolveActiveScope falls back to "user" until a project footprint exists

`resolveActiveScope()` in `src/footprint.ts` returns **"project"** only when `./.righthand/` (or `.git/`) exists in the project root; otherwise it returns **"user"**. This is intended (project-scoped ops require an initialized project) but it is a quiet footgun for mutating-command tests.

**Symptom:** a test calls a mutating command's `run(ctx)` with `flags = { yes: true }` (no `scope`), then asserts on the PROJECT footprint — and the mutation silently landed in the USER footprint instead. `config.json` appears "missing" (ENOENT) because it was written to `~/.righthand` (or the test's USER temp root), not the project temp root.

**Why:** `scopeFrom()` helpers in commands like `src/commands/plugins.ts` and `src/commands/reset.ts` call `resolveActiveScope(ctx.flags)` only when `ctx.flags.scope` is unset — so before `init`, the resolved scope is "user".

**Fix in tests:** pass `scope` explicitly. e.g. default the test ctx to `{ scope: "project", ...flags }` (as `test/plugins.test.ts` does). This also makes scope resolution deterministic regardless of footprint state. (Compare `src/commands/new.ts`, which hard-codes `scope = "user" : "project"` and so never hits this path.)

**Rule of thumb:** mutating-command tests should never rely on `resolveActiveScope`'s implicit default — set the scope explicitly.
