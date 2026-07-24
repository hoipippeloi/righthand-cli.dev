---
type: Decision
title: "Distribution: npm-based for CLI and plugins, version-pinned, opt-in auto-update"
description: Context
tags: [distribution, npm, updates, v1]
status: accepted
timestamp: "2026-07-24T11:32:03.160Z"
---

# Distribution: npm-based for CLI and plugins, version-pinned, opt-in auto-update

## Context
righthand ships as an npm CLI ([[stateless-subprocess-invocation]], [[citty-is-the-cli-layer]]) and has a plugin ecosystem that must stay compatible across CLI versions. We need a distribution + update story that is safe (no silent breakage) and simple.

## Choice
- **npm-based distribution** for both the CLI and plugins.
- **`righthand update`** command to update the CLI; plugins update via the plugin system.
- **Semver** throughout; plugins are **version-pinned** in the project manifest (no floating latest).
- **Auto-update is opt-in, never silent.**

## Alternatives considered
- Standalone binary distribution — rejected (bun-compile binaries are 58–109MB; tooling alpha-stage); npm is the path.
- Floating plugin versions (latest) — risk silent breakage against a new CLI; pinning prevents it.
- Forced auto-update — hostile to reproducible agent runs; opt-in only.

## Rationale
npm is already the runtime/distribution substrate; reusing it for plugins keeps one mechanism. Pinning + semver gives reproducible, predictable upgrades (critical for an agent tool whose behavior must be stable across runs). Opt-in auto-update respects user control.

## Consequences
- Manifest schema pins plugin versions.
- `righthand update` is a v1 lifecycle command.
- Breaking CLI changes require plugin semver coordination.
