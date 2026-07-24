---
type: Decision
title: No build step — run TypeScript source directly
description: Context
tags: [architecture, toolchain, typescript, node, bun, build, righthand]
status: accepted
timestamp: "2026-07-24T11:50:40.108Z"
---

# No build step — run TypeScript source directly

## Context

The runtime was locked to Node + TypeScript ([[node-typescript-is-the-runtime-for-righthand]]), but the *build approach* was left open — that decision tentatively named `tsc` / `esbuild` as the build tooling. During the Phase 0 implementation we wanted the absolute minimum toolchain: no transpile step, no watcher, no emitted `dist/`. Node 22+/24 runs `.ts` directly via native type-stripping, and Bun (a hard constraint — see [[bun-support-is-a-hard-constraint-npm-only-distribution]]) strips the same way. So a build step is not required for either target.

## Choice

**Run the TypeScript source directly. No build step, no transpiler, no emitted output.** `bin/righthand.ts` is executed as-is by Node (and Bun). `tsc --noEmit` is used only as an optional *typecheck* gate (not wired into CI yet) — it never emits.

## Alternatives considered

- **`tsc` emit to `dist/`** — adds a build step, a watcher, a `dist/` to gitignore + package, and a "did I rebuild?" failure mode. Tax on every iteration.
- **`esbuild` / `tsup` bundle** — fast, but still a build step + bundler dependency; overkill for a CLI that imports lazily.
- **`tsx` / `ts-node` runtime loader** — extra runtime dependency; Node 24's native stripping makes it redundant.

## Rationale

- **Native platform feature over a dependency** (ponytail): Node's type-stripping is built in and zero-config.
- **Instant iteration** — edit `.ts`, re-run; nothing to rebuild. Serves the per-task subprocess cold-start loop.
- **Single source of truth** — the file you read is the file that runs; no stale `dist/`.
- **Bun-compatible by construction** — Bun strips TS the same way, so the no-build choice also satisfies the Bun hard constraint with zero extra work.

## Consequences

- **Source must stay strip-only-clean.** Only *type-only* syntax is stripped; anything requiring *transformation* breaks at load time with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Concretely banned: **parameter properties** (`constructor(public x:)`), **`enum`**, **`namespace`**. See [[node-strip-only-typescript-rejects-parameter-properties-enum]] (the gotcha + the `as const` pattern we use for `EXIT` in `src/contracts.ts`).
- `tsc --noEmit` becomes a *lint/typecheck* tool, not a build tool.
- This **refines the build-tooling consequence** of [[node-typescript-is-the-runtime-for-righthand]] (which named `tsc`/`esbuild`); it supersedes that one line — the Node+TS runtime choice itself is unchanged.

## Verified (Phase 0 slice, 2026-07-24)

`bin/righthand.ts` runs directly under Node 24 with zero build step; 8/8 `node --test` tests green; cold-start 94ms (under the 200ms C1 target).
