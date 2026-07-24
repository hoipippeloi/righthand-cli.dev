---
type: Entity
title: Publish build pipeline
description: **The publish build pipeline** compiles the TypeScript source in `src/` into ESM JavaScript in `dist/` at publish time, so the published npm package's `bin` is 
tags: [packaging, build, npm, distribution, esbuild]
timestamp: "2026-07-24T17:55:54.767Z"
---

# Publish build pipeline

**The publish build pipeline** compiles the TypeScript source in `src/` into ESM JavaScript in `dist/` at publish time, so the published npm package's `bin` is plain `.js` (not `.ts`). It is the mechanism behind [publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n](./publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n.md) and exists solely because Node refuses to type-strip any `.ts` whose path is under `node_modules` ([err-unsupported-node-modules-type-stripping-published-bin-must-be-js-never-ts](./err-unsupported-node-modules-type-stripping-published-bin-mu.md)).

Dev is untouched: `node bin/righthand.ts` still runs source directly ([no-build-step-run-typescript-source-directly](./no-build-step-run-typescript-source-directly.md)). The build runs only on publish / `npm pack` / git install, never on a consumer registry install.

## Details

- **Location**: `scripts/build.mjs` (the compiler) + the `prepare`/`build` npm scripts in `package.json`; output `dist/` (gitignored build artifact, listed in `files`).
- **Interface / npm scripts**:
  - `npm run build` → `node scripts/build.mjs`
  - `npm prepare` → same (runs automatically on `npm pack`, `npm publish`, and `npm install <git-url>`, so the tarball always ships a prebuilt `dist/`).
  - `bin.righthand` → `./dist/cli.js` (the published entry).
- **Compiler**: `esbuild` (`transform`, per-file) — a **devDependency only**. Runtime deps stay `citty` + `isomorphic-git`. If esbuild is unresolvable (e.g. `prepare` runs where devDeps are absent), `build.mjs` **no-ops** — the tarball must already contain a prebuilt `dist/`.
- **What it does, step by step**: wipe `dist/`; walk `src/`; `transform` each `.ts` 1:1 to `.js` (target `node20`, ESM); rewrite relative import specifiers `.ts`→`.js` (scoped regex — skips bare `.ts`/`"cmd.ts"` runtime logic); prepend the shebang to `cli.ts`→`cli.js`; copy non-TS assets verbatim (currently only `src/web/app.html`, which `src/web/server.ts` reads `HERE`-relative via `import.meta.url`).
- **Per-file, not bundled** — load-bearing: [command-auto-discovery-one-file-per-command-plugin-handlers-](./command-auto-discovery-one-file-per-command-plugin-handlers.md) dynamically `import()`s command files discovered at runtime; bundling can't see them. A one-line `src/discover.ts` change (accept `.ts`||`.js`; `import.meta.url` resolves `HERE` to `src/` in dev, `dist/` compiled) keeps a single discovery path working in both.

## Relationships

- [publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n](./publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n.md) — the decision this implements (the *why*: per-file vs bundle, alternatives rejected).
- [no-build-step-run-typescript-source-directly](./no-build-step-run-typescript-source-directly.md) — the dev principle this pipeline is the *single exception* to (publish only).
- [command-auto-discovery-one-file-per-command-plugin-handlers-](./command-auto-discovery-one-file-per-command-plugin-handlers.md) — the constraint that forces per-file compile over bundling.
- [lock-success-criteria-measurable-metrics-never-break-bars](./lock-success-criteria-measurable-metrics-never-break-bars.md) — defended: compiled cold-start ≈80ms (vs ~115ms source), under the 200ms bar.

## Lifecycle

- **First added: 2026-07-24** — to fix `npm install -g hoipippeloi/righthand-cli.dev` crashing on every call (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Commit `181404b` (code) + `4eef979` (docs).
- **Known follow-up**: a single-file bundle build is a possible later optimization (would need replacing dynamic discovery with a static import map); deferred — per-file already improved cold start.

## Source

- `scripts/build.mjs` — the compiler (per-file, scoped specifier rewrite, no-op fallback).
- `package.json` — `bin`, `files: ["dist"]`, `prepare`/`build` scripts, `esbuild` devDep.
- `src/discover.ts` — location-aware core command discovery (the one-line `.ts`||`.js` change).
