---
type: System Overview
title: Overview
description: What righthand is, its structure, and how it's built.
timestamp: "2026-07-24T13:05:00.000Z"
---

# righthand — Overview

**righthand** is a standalone CLI that acts as a universal "right hand" to any AI
coding agent (Claude Code, Cursor, Copilot/Codex, Aider, pi, …). The main coding
LLM spawns righthand as a **subprocess per task**; righthand owns all the
non-coding operational work — CI/CD, logging, docs, tasks, admin, web research —
and returns a **compressed, schema'd JSON result**, keeping the agent's context
window free for writing code. It can also **use an LLM itself** and even **write
new commands into its own surface** (a self-recursive self-builder), safely, with
full rollback.

See `.prds/righthand-cli/prd.md` for the full PRD; `.specs/*/spec.md` for
implementation specs; `research_righthand_problem/` for the evidence base.

## Runtime & toolchain

- **Node + TypeScript, Bun-compatible** (runtime-agnostic JS; no Bun-only APIs).
- **No build step for dev** — Node 22+/24 strips TS types natively; Bun runs `.ts`
  as-is, so `node bin/righthand.ts` runs source directly. Source must stay
  strip-only-clean: **no parameter properties, enums, or namespaces** (see
  [[node-strip-only-typescript-rejects-parameter-properties-enum]]). The *published
  npm artifact* is the one exception — compiled to `dist/` JS via `npm prepare`
  (esbuild, devDep-only), because Node refuses to type-strip any `.ts` whose path
  is under `node_modules` ([[publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n]],
  [[err-unsupported-node-modules-type-stripping-published-bin-must-be-js-never-ts]]).
- **CLI layer:** `citty`. **Tests:** `npm test` (= `node --test`, auto-discovers
  `test/**/*.test.ts`). **Only runtime deps:** `citty` + `isomorphic-git`
  (`esbuild` is devDep-only, for the publish build).
- Cold-start of `righthand tools` ≈ **80ms compiled (`dist/`)** / ~115ms from
  source — both under the 200ms C1 bar
  ([[lock-success-criteria-measurable-metrics-never-break-bars]]).

## The shared contracts (in `src/contracts.ts`)

- **Envelope** — every command returns `{ ok, command, summary, result,
  needs_human, meta }`; JSON when piped, human-readable when a TTY.
- **Exit codes** — 0 ok / 1 fail / 2 usage / 3 NEEDS_HUMAN / 4 auth /
  5 dep-missing / 6 capability-denied.
- **`ToolDescriptor`** — MCP-shaped (`name`/`description`/`inputSchema`), with
  `capabilities`, `destructive`, `costTier`, `mutates`. Emitted by
  `righthand tools --json` so any MCP-aware agent can enumerate righthand.
- **`Config`** — layered (project `./.righthand/config.json` > user
  `~/.righthand/config.json` > env `RIGHTHAND_*`); providers, plugins,
  permissions, defaults.

## Architecture (key modules)

- `src/discover.ts` — **auto-discovery**: scans `src/commands/*.ts` (core) +
  footprint command dirs (`./.righthand/commands`, `~/.righthand/commands`) +
  plugin manifest fragments. Adding a command = drop a file; **no shared-file
  edits** ([[command-auto-discovery-one-file-per-command-plugin-handlers-]]).
  Location-aware via `import.meta.url`, so it finds `src/commands/*.ts` in dev and
  `dist/commands/*.js` once compiled ([[publish-time-build-to-dist-via-npm-prepare-compiled-js-for-n]]).
- `src/runtime.ts` — dispatch: manifest lookup → capability check (exit 6 on
  deny) → approval gate (destructive/expensive need `--yes`) → run handler →
  history append.
- `src/capabilities.ts` — the sandbox: `exec:`/`net:`/`fs:`/`llm:` capability
  strings with `*` wildcards; deny-by-default unless granted in
  `config.permissions.allow` ([[plugin-sandbox-capability-declaration-permission-flags-subpr]]).
- `src/versionstore.ts` + `src/journal.ts` — **rollback** (C7): each footprint is
  an `isomorphic-git` repo; every mutation is a before/after snapshot with a
  `change_id`. `righthand rollback` reverts; `reset` factory-resets with an undo
  manifest. Never touches app code ([[rollback-version-store-isomorphic-git-pure-js-over-system-gi]]).
- `src/llm.ts` — **LLM provider abstraction** (C4): OpenAI-compatible + native
  Anthropic, user-defined `baseURL`/`model`, `env:`/`keychain:`/plaintext key
  indirection.
- `src/shell.ts` — wraps existing CLIs (`gh`, `kubectl`, …) and compresses output
  (the core value prop vs raw CLIs).
- `src/cli.ts` — `citty` wiring; **auto-builds subcommands** from the discovered
  table (collision-free for parallel development).
- `src/web/server.ts` — **web UI** (`righthand web`): stdlib `node:http`
  server serving a self-contained SPA (`src/web/app.html`) + `/api/tools` and
  `/api/run`, backed by the **same in-process `dispatch()`** as the CLI, so
  config, capabilities, and rollback carry through
  ([[web-ui-reuses-in-process-dispatch]]).

## Command surface (21 commands, all auto-discovered)

`version`, `tools`, `config` (get/set/list), `history`, `init`, `changes`,
`rollback`, `reset`, `new` (C3 scaffolder), `plugins` (install/list/remove),
`llm ask`, `build` (C5 self-builder), `research` (C6), `doctor` (C10), and the
ops domains: `ci`, `logs`, `docs`, `tasks`, `admin` (C8), plus `hello` (demo) and `web` (visual command runner).

## Capabilities map (all 10 built, 174 tests)

C1 Core Runtime · C2 Plugin System · C3 Authoring/Scaffolder · C4 LLM Providers ·
C5 Self-Builder · C6 Research · C7 Rollback/Reset · C8 Ops Domains · C9
Lifecycle/Config · C10 Doctor. Self-builder leads the narrative; rollback is the
trust foundation it depends on.

## How to use

```bash
node bin/righthand.ts                 # list commands (runs TS source directly)
node bin/righthand.ts tools --json    # MCP-shaped discovery for agents
node bin/righthand.ts init            # create ./.righthand footprint
node bin/righthand.ts new mycmd       # scaffold a command (auto-discovered)
node bin/righthand.ts build "..."     # LLM writes a new command (needs --yes + caps)
node bin/righthand.ts doctor          # health/config diagnostics
node bin/righthand.ts rollback --yes  # undo the last change
node bin/righthand.ts web            # visual command-runner webapp (opens browser)
npm run build                         # compile src/ → dist/ (also runs on `npm prepare`)
righthand <command>                  # once `npm i -g`-ed, runs the compiled binary
```

Capability-gated commands (`ci`, `llm`, `build`, `research`, …) are
**deny-by-default**; grant via `config.permissions.allow` (e.g. `["net:llm"]`)
or `["*"]`. `doctor` reports what's needed.

## Known follow-ups (deliberately deferred)

Deep-research mode (`--deep` is shallow today); real OS keychain for credentials
(`keychain:` resolves to null — `env:` works now); subprocess isolation for
untrusted plugins (capability+permission enforcement is the v1 baseline);
`tsc --noEmit` CI gate; `righthand restore <undo-id>` replay; plugin registry
publishing. See `.prds/righthand-cli/prd.md` § Phasing & Open Questions.
