---
type: Decision
title: Publish-time build to dist/ via npm prepare (compiled JS for npm, source for dev)
description: Context
tags: [packaging, distribution, build, npm, cold-start]
status: accepted
timestamp: "2026-07-24T17:47:55.108Z"
---

# Publish-time build to dist/ via npm prepare (compiled JS for npm, source for dev)

## Context

The published npm package was broken: its `bin` pointed at `./bin/righthand.ts` and Node refuses to type-strip any `.ts` under `node_modules` ([[err-unsupported-node-modules-type-stripping-published-bin-must-be-js-never-ts]]). The project's source uses `.ts`-extension imports (`allowImportingTsExtensions: true`, `noEmit: true`) so it can be run directly via `node bin/righthand.ts` in dev — a first-class DX decision ([[no-build-step-run-typescript-source-directly]]).

## The choice

Compile `src/` → `dist/` (ESM `.js`) at publish time only, wired to npm `prepare` (runs on git install, `npm pack`, `npm publish` — NOT on consumer registry installs, so it's safe without devDeps there). `bin` → `./dist/cli.js`. `files: ["dist"]` ships a lean tarball. Dev is unchanged — still runs source directly, no build step.

Compiler is **esbuild, per-file (not bundled)**, with a scoped `.ts`→`.js` specifier rewrite. Per-file (not bundle) is load-bearing: `src/discover.ts` dynamically `import()`s command files by scanning a directory at runtime — bundling can't see those. Per-file + a one-line `discover.ts` change (accept `.ts`||`.js`, since `import.meta.url` resolves `HERE` to `src/` in dev and `dist/` when compiled) keeps a **single discovery path** that works identically in both. Footprint/user commands stay `.ts` (they live outside `node_modules`, so Node strips them fine).

## Alternatives considered

- **tsx runtime shim** (bin = a `.js` that imports `tsx` to run the source): smallest code change, keeps `.ts` everywhere, but adds a heavy runtime dep (esbuild via tsx) and ~+50–100ms cold start — likely blowing the locked 200ms C1 bar ([[lock-success-criteria-measurable-metrics-never-break-bars]]) and breaking the "only citty + isomorphic-git" ethos. Rejected.
- **Bundle to one file**: cleanest artifact + fastest startup, but requires replacing dynamic command discovery with a build-time static import map — a bigger refactor of a first-class pillar ([[command-auto-discovery-one-file-per-command-plugin-handlers-]]). Deferred (possible later optimization; per-file already improved cold start to ~80ms).
- **`tsc` emit**: blocked — `allowImportingTsExtensions` (required by the source's `.ts` imports) forces `noEmit`. esbuild tolerates `.ts` specifiers.

## Consequences

- `npm install -g hoipippeloi/righthand-cli.dev` now works.
- Zero new runtime deps. esbuild is devDep-only.
- Cold start *improved*: ~80ms median (vs ~115ms source) — compiled JS skips type-stripping.
- Adds `scripts/build.mjs` + `prepare`/`build` npm scripts + a `dist/` gitignored artifact.
- Clarifies (does NOT supersede) [[no-build-step-run-typescript-source-directly]]: "no build step" applies to the **development/runtime-from-source** experience; the **published npm artifact** is compiled JS. Both are true simultaneously.
