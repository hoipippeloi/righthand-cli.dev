---
type: Learning
title: ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — published bin must be .js, never .ts
description: What happened
tags: [packaging, node, typescript, npm, distribution]
timestamp: "2026-07-24T17:47:55.108Z"
---

# ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — published bin must be .js, never .ts

## What happened

`npm install -g hoipippeloi/righthand-cli.dev` succeeded but every `righthand` call threw at startup:

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
unsupported for files under node_modules, for ".../node_modules/righthand/bin/righthand.ts"
```

## Root cause

Node's native TypeScript type-stripping (unflagged since Node 22.6+/23+) is **deliberately disabled for any file whose path contains `node_modules`**. It's a location guard, not a version gate — the *same* `.ts` file runs fine until its path goes under `node_modules`. **No flag overrides it** (`--experimental-strip-types` is already on by default and still throws; there is no `--allow` for it).

The package shipped `"bin": { "righthand": "./bin/righthand.ts" }` (a raw `.ts`) with no build step, so the global install pointed Node at a `.ts` under `node_modules` → throws on every call. Dev was unaffected because `node bin/righthand.ts` runs from the repo (not under `node_modules`).

## Fix

Publish-time per-file compile to `dist/` (esbuild, devDep-only) wired to npm `prepare`; `bin` → `./dist/cli.js`. See [[publish-time-build-to-dist-via-npm-prepare]]. Runtime deps stay `citty` + `isomorphic-git`; cold start actually *improved* (~115ms → ~80ms) because compiled JS skips the stripping pass.

## Rule of thumb

A published npm package's `bin`/entry must be `.js`. `.ts` entries only work for repo-local / `npm link`-from-source workflows. If you depend on running TypeScript source, compile for publish — don't ship a transpiler as a runtime dep just to paper over it.
