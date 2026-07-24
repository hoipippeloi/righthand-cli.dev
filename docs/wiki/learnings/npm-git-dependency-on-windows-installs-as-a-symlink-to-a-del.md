---
type: Learning
title: npm git-dependency on Windows installs as a symlink to a deleted temp clone — no dist/, no bin shim
description: What happened
tags: [npm, distribution, windows, git-dependency, packaging, gotcha]
timestamp: "2026-07-24T17:59:41.078Z"
---

# npm git-dependency on Windows installs as a symlink to a deleted temp clone — no dist/, no bin shim

## What happened

`npm install -g hoipippeloi/righthand-cli.dev` reported success (57 packages) but `righthand` was `command not found`. Diagnosis:

- `npm ls -g` showed `righthand@ -> ...\npm-cache\_cacache\tmp\git-cloneRA3iYd` — npm installed it as a **symlink** into a temporary `git-clone*` directory, and created **no bin shim**.
- The symlinked package had **no `dist/`** — `prepare` never produced the compiled output (see [[publish-build-pipeline]]).
- npm then **cleaned up the temp clone**, leaving a **dangling symlink**. Three leftover `git-clone*` dirs in `_cacache\tmp` showed the same cruft from prior attempts.

This is npm's git-dependency flow on Windows: it clones the repo into a `_cacache/tmp/git-clone*` dir, symlinks the global install at it, runs lifecycle scripts there, then deletes the temp dir — so a dangling symlink + missing artifacts is the expected failure mode, not a fluke.

## Root cause / why it bites this project

The [[publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n]] pipeline relies on `prepare` running inside that temp clone to build `dist/`. On the git-dependency path that's unreliable on Windows: the clone can be torn down before/around the build, and `scripts/build.mjs` **no-ops when esbuild is unresolvable** (devDeps may not be installed in the temp clone before `prepare` runs), so you silently get a package with no `dist/` and therefore no working `bin`.

## Fix / workaround

- **What we shipped (works WITHOUT the registry): COMMIT `dist/` and install via the GitHub *tarball* URL** — `npm install -g https://github.com/hoipippeloi/righthand-cli.dev/tarball/main`. A tarball-URL install is a normal package download (no git clone), so it skips the buggy git-dep flow entirely; npm copies the committed `dist/` and creates a real bin shim. Confirmed working on npm 11.12.1 / Node 24 / Windows (`righthand version` / `doctor` / `tools --json` all green). `/tarball/main` always fetches current main; pin to a release tag for reproducibility.
- **Prefer the npm registry over a git URL for `npm i -g`.** `npm publish` runs `prepare` locally and ships a packed tarball that already contains a prebuilt `dist/`; a registry install copies that tarball and generates a real bin shim — no temp clone, no re-build.
- If you must install from a git URL, expect the dangling-symlink failure mode: uninstall, clear stale `_cacache/tmp/git-clone*` dirs, and verify both the resolved path (a real directory, not a symlink into `_cacache/tmp`) and the presence of `dist/cli.js` + the bin shim after install.
- Side note (separate gotcha): git-bash sessions don't always have the npm global bin dir on `PATH` — run via the full bin path or fix PATH if `command not found` is the only symptom.

## Rule of thumb

A git-URL global install on Windows is a *different code path* from a registry install: it re-clones + re-runs `prepare` in a throwaway temp dir it later deletes. For any package whose `bin` depends on a `prepare`-built artifact, ship via the registry and treat git-URL installs as dev-only / `npm link`-from-source territory.

## Related

- [[publish-build-pipeline]] — the entity this breaks when `prepare` doesn't run / no-ops.
- [[publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n]] — the decision that made `dist/` build-on-prepare (its "`npm install -g <git-url>` now works" claim is true for a clean registry-style install but not guaranteed for the Windows git-dependency path).
- [[err-unsupported-node-modules-type-stripping-published-bin-must-be-js-never-ts]] — the prior failure mode this whole build pipeline exists to fix.
