---
type: Learning
title: Ops commands declaring capabilities are capability-gated before they run — tests must grant caps
description: "When implementing the C8 ops command groups (`ci`, `logs`, `docs`, `tasks`, `admin`), each command declares `capabilities` (e.g. `["exec:gh","net:api.github.com"
tags: [c8, ops, capabilities, testing, dispatch, shell]
timestamp: "2026-07-24T12:41:58.777Z"
---

# Ops commands declaring capabilities are capability-gated before they run — tests must grant caps

When implementing the C8 ops command groups (`ci`, `logs`, `docs`, `tasks`, `admin`), each command declares `capabilities` (e.g. `["exec:gh","net:api.github.com"]`, `["fs:read"]`, `["exec:*","net:*"]`) as required by the spec. **`runtime.ts` dispatch enforces these BEFORE the handler runs** (`checkCapabilities` against `config.permissions`): a declared cap is permitted only when (a) no `deny` pattern matches AND (b) some `allow` pattern matches (or `allow` holds `"*"`).

Consequences that bit during C8:
- `DEFAULT_CONFIG.permissions.allow = []`, so **every declared capability is denied → exit 6 (CAPABILITY_DENIED)** — not exit 5. The handler never runs.
- Tests that dispatch these commands must use a config with `permissions: { allow: ["*"], ... }`, otherwise they fail with exit 6 (looks like a `6 !== 0` assertion failure).
- **Two distinct graceful-degrade axes for ops commands:** (1) *capability denied* → exit 6 (security gate; user hasn't granted the cap); (2) *wrapped binary missing* (ENOENT) → exit 5 (DEP_MISSING) with `needs_human` (the command throws `CommandError(EXIT.DEP_MISSING, msg, needsHuman)`). On a fresh install with default config, ops commands hit exit 6 before ever probing for `gh`/`kubectl`. Reaching the exit-5 path requires caps be granted (via `righthand init`/config/`doctor`).

How a command emits exit 5: `throw new CommandError(EXIT.DEP_MISSING, "gh not found", "install gh and run gh auth login")`. The dispatch `catch` maps a `CommandError` to `{ exitCode: e.exitCode, needs_human: e.needsHuman }` — so exit 5 AND a populated `needs_human` both come out of one throw. This is the ONLY path to a non-{0,1,2,3} exit, because the normal envelope→exit mapping is `needs_human?3 : ok?0 : 1`.

The `runCli` test seam lives in `src/shell.ts`: `runCli(bin, args, { runner })` where `runner` defaults to `spawnSync`-wrapping `defaultRunner`. There's also a module-level `setRunnerForTest`/`resetRunnerForTest` so commands that call `runCli(bin, args)` with no opts (all of them) can be faked end-to-end through `dispatch`. A missing binary is signalled by the runner throwing an error with `code: "ENOENT"`; `runCli` catches it → `{ ok:false, code:-1, missing:true }`.
