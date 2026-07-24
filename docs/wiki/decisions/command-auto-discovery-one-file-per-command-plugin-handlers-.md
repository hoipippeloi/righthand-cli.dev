---
type: Decision
title: "Command auto-discovery: one file per command, plugin handlers stay lazy"
description: Context
tags: [c1, discovery, manifest, plugins, cold-start]
status: accepted
timestamp: "2026-07-24T12:21:13.377Z"
---

# Command auto-discovery: one file per command, plugin handlers stay lazy

## Context

C1 needed a registration model where adding a command requires **no edits to shared files** (manifest/registry/cli), and the lazy-import guarantee must still hold for **plugins** (cold-start-critical), even though bundled core commands can be imported at discovery.

## Choice

- Each core command = ONE file `src/commands/<name>.ts` exporting `descriptor: ToolDescriptor` + `run`.
- `src/discover.ts` scans `src/commands/*.ts`, dynamically imports each, builds an in-memory table `{ name, descriptor, run }`. Built lazily on first access (`discoverCore()`, memoized) and awaited by `manifest.getMergedManifest()` / `runtime.dispatch`.
- Plugin manifest fragments are read as **JSON only** (`discoverPluginFragments`); their handler modules are lazy-imported on dispatch via `loadPluginHandler`. `registry.ts` now just tracks which plugin handlers have actually imported (assertable).
- `getMergedManifest` / `findTool` became **async** as a result.

## Alternatives considered

- **Top-level await** in discover.ts to keep manifest sync. Rejected: `node --test` flags any top-level await anywhere in a test file's import graph as "unsettled" and fails the whole file. Lazy memoized async init avoids that with minimal ripple.
- Hardcoded handler map (the old `registry.ts` `LAZY_HANDLERS`). Rejected: every new command needed edits to registry + manifest — exactly what we wanted to eliminate.

## Consequences

- Adding a command = drop a file in `src/commands/`. `cli.ts` still needs a citty subcommand entry to expose it on the CLI surface (that's the one remaining edit — citty owns argv routing).
- The old "dispatching tools doesn't load hello/version" test no longer holds for core commands (they're bundled+imported at discovery). Replaced with a test that a **fake plugin's** handler is not imported by discovery — the lazy guarantee now protects the thing that matters (plugins).

See [[decisions/cli-framework-citty-over-crust-js-proposed]], [[righthand-core-architecture]].
