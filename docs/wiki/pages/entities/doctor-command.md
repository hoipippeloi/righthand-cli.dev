---
type: Entity
title: doctor command
description: "**`righthand doctor`** is the read-only health & integration diagnostics command (capability [[c10-diagnostics]] / `decisions/diagnostics-command-righthand-doct"
tags: [c10, doctor, diagnostics, command, read-only]
timestamp: "2026-07-24T12:57:01.117Z"
---

# doctor command

**`righthand doctor`** is the read-only health & integration diagnostics command (capability [c10-diagnostics](./c10-diagnostics.md) / `decisions/diagnostics-command-righthand-doctor-c10`). It probes every integration righthand depends on and returns a bounded **green / yellow / red** report so a user or the main LLM can see what is misconfigured *before* invoking real commands — directly serving the PRD's "zero-config default; degrade gracefully when optional integrations are absent" bar.

## What it is

A pure, side-effect-free diagnostic. It reads config + the footprint, checks binary presence, and never mutates state, declares no `capabilities`, and is `costTier: "free"`. Output honors the standard [command-output-envelope-and-exit-codes](./command-output-envelope-and-exit-codes.md): `result = { overall, checks }`, where each check is `{ name, status: "green"|"yellow"|"red", detail }`.

## Details

- **Location**: `src/doctor.ts` (logic) + `src/commands/doctor.ts` (envelope wrapper, auto-discovered).
- **CLI**: `righthand doctor [--json]` — no special args; `--json` is the global flag. `export const cli = {}`.
- **Checks emitted**:
  - `runtime` — version + node/bun (always green).
  - `footprint` — green if `./.righthand` exists, else yellow ("run `righthand init`").
  - `version-store` — green if the footprint `.git` (isomorphic-git, [rollback-version-store-isomorphic-git-pure-js-over-system-gi](./rollback-version-store-isomorphic-git-pure-js-over-system-gi.md)) is init'd, else yellow.
  - `providers` / `provider:<name>` — uses [llm-provider-integration](./llm-provider-integration.md)'s `resolveApiKey()` per `config.providers`; **red** when zero providers configured ("no LLM provider — build/research/llm unavailable"), else green/yellow per key resolvability.
  - `default-provider` — yellow if `config.defaults.provider` unset but providers exist; validates via `resolveProvider()`.
  - `plugins` — uses [plugins-command](./plugins-command.md) / `plugininstall.ts` `listPlugins`; green if none or all have manifests, yellow per missing `manifest.json`.
  - `cli:gh|kubectl|terraform|aws` — uses `shell.ts` `hasBinary`; **yellow when absent, never red** (optional ops integrations).
  - `capabilities` — informational count of capability-declaring commands vs `permissions.allow` grants; yellow if such commands exist but allow is empty.
- **Overall rollup**: `red` if any red, else `yellow` if any yellow, else `green`.
- **TEST SEAMS** (so tests never touch the real filesystem): injectable `hasBinary`, injectable `listPlugins`, and a passed-in `config` (defaults to `loadConfig()` in prod). Covered by `test/doctor.test.ts` (19 tests).

## Relationships

- [command-output-envelope-and-exit-codes](./command-output-envelope-and-exit-codes.md) — the envelope `doctor` emits into.
- [llm-provider-integration](./llm-provider-integration.md) — `resolveProvider` / `resolveApiKey` power the provider checks.
- [plugins-command](./plugins-command.md) — `listPlugins` powers the plugin check.
- [factory-reset-capability-c-reset](./factory-reset-capability-c-reset.md) — doctor surfaces an uninitialized rollback store so the user runs `init` before relying on rollback.
- `decisions/diagnostics-command-righthand-doctor-c10` — the decision/ADR for this command.

## Lifecycle

- First added: Phase 3 (Core Ops Value) — C10, per `.prds/righthand-cli/prd.md` phasing.
- Depends on: C1 (runtime/dispatch), C2 (plugins), C4 (LLM providers) — all read-only.
