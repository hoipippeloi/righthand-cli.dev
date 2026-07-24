---
type: Entity
title: plugins command
description: What it is
tags: [c2, plugin-system, command, npm, righthand]
timestamp: "2026-07-24T12:46:44.926Z"
---

# plugins command

## What it is

The **`plugins` command** implements C2's install/list/remove lifecycle for [righthand-cli](./righthand-cli.md) plugins. A plugin is an npm package installed into the footprint plugins dir that ships a `manifest.json` fragment (the discovery contract: `{plugin, handler, tools}`) so [extensible-plugin-system-is-a-first-class-architectural-pill](./extensible-plugin-system-is-a-first-class-architectural-pill.md) can discover it without importing code.

```
righthand plugins install <pkg>[@version] [--scope project|user]
righthand plugins list   [--scope project|user]
righthand plugins remove <pkg>   [--scope project|user]
```

## Why it matters

It is the user-facing half of the plugin pillar — without install/list/remove, the discovery + authoring contracts have nothing to install. It is also the first command that drives an **external package manager** (`npm`), so it establishes the test-seam pattern for subprocess npm calls (mirroring `src/shell.ts`'s `Runner` seam for ops CLIs).

## Details

- **Location**: `src/commands/plugins.ts` (command) + `src/plugininstall.ts` (npm shell-out + disk reads).
- **Interface**: two citty positionals — `action` (`install|list|remove`, defaults to `list`) and `pkg` (spec for install, name for remove); `cli.scope: true` adds the shared `--scope` flag.
- **Install mechanism**: `npm install --prefix <pluginsDir> <pkg>` via `child_process.spawnSync`. npm drops the package at `<pluginsDir>/node_modules/<name>/`. The package's `package.json` gives the version; its `manifest.json` (present + valid JSON) sets `hasManifest`.
- **config.plugins**: install upserts `{name, version}` into the scoped `config.json` `plugins` array (de-duped by name). A missing manifest still registers the name but surfaces a `warning` (the plugin is not discoverable by `righthand tools` until a fragment ships).
- **list**: merges `config.plugins` with a disk scan of `<pluginsDir>/node_modules` (handles `@scope/pkg` layout). Disk truth wins for `version`/`hasManifest`; config adds registered-but-absent entries.
- **remove**: `npm uninstall --prefix` (best-effort) + drop the entry from `config.plugins`.
- **Mutation contract**: install/remove are `mutates: true` — each owns its `journal()` (before/after snapshot over the whole footprint, which tracks `plugins/node_modules/...`), honors `--dry-run`, and confirms via `src/confirm.ts` (`--yes` / interactive / non-TTY refusal). The npm install + config write land in ONE journaled change so rollback restores both. npm failure throws inside the mutate → the change is abandoned as an incomplete before/after pair and mapped to a fail envelope.

## Test seam

Every npm call goes through `activeNpmRunner()` in `src/plugininstall.ts`: `defaultNpmRunner` (real `npm` via `spawnSync`) unless `setNpmRunnerForTest(fake)` is set. Tests inject a fake that materializes a package dir + `manifest.json` under `node_modules/` — **no network**. Mirrors `setRunnerForTest` in [shell](./shell.md) exactly. See [resolveactivescope-falls-back-to-user-until-a-project-footprint-exists](./resolveactivescope-falls-back-to-user-until-a-project-footpr.md) for a test gotcha.

## Relationships

- [extensible-plugin-system-is-a-first-class-architectural-pill](./extensible-plugin-system-is-a-first-class-architectural-pill.md) — the pillar this instantiates.
- [command-authoring-and-scaffolding](./command-authoring-and-scaffolding.md) — the *authoring* half; `plugins install` is the *consumption* half.
- [mutating-commands-own-their-journaling-not-a-dispatch-auto-w](./mutating-commands-own-their-journaling-not-a-dispatch-auto-w.md) — install/remove follow this rule.
- [rollback-and-reset-capability-c-reset](./rollback-and-reset-capability-c-reset.md) — installs/removes are rollback-able.
- [distribution-npm-based-for-cli-and-plugins-version-pinned-op](./distribution-npm-based-for-cli-and-plugins-version-pinned-op.md) — npm-prefix install is the chosen distribution mechanism.

## Source

- `src/commands/plugins.ts` — `descriptor` + `installFlow`/`removeFlow`/`run`.
- `src/plugininstall.ts` — `defaultNpmRunner`/`setNpmRunnerForTest`/`activeNpmRunner`, `installPlugin`/`uninstallPlugin`/`listPlugins`, `packageNameFromSpec`, `readManifest`.
- `test/plugins.test.ts` — empty list, install (manifest + no-manifest + dry-run + no-`--yes` + npm-failure), remove (+ dry-run), `packageNameFromSpec` unit; all via an injected fake npm runner over an isolated temp footprint.
