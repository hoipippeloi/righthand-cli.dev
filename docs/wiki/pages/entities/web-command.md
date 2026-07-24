---
type: Entity
title: web command
description: "**`righthand web`** is the command that launches the visual command-runner webapp. It is a long-running **foreground** command: it starts a stdlib HTTP server, "
tags: [web-ui, command, c-web, cli, righthand]
timestamp: "2026-07-24T14:20:35.168Z"
---

# web command

**`righthand web`** is the command that launches the visual command-runner webapp. It is a long-running **foreground** command: it starts a stdlib HTTP server, prints the URL, optionally opens a browser, then blocks forever (Ctrl+C stops it). Auto-discovered from `src/commands/web.ts` (one file per command — see [command-auto-discovery-one-file-per-command-plugin-handlers](./command-auto-discovery-one-file-per-command-plugin-handlers.md)).

The webapp is the alternate command surface to the CLI — a searchable, domain-grouped sidebar of every command, a form **auto-generated from each command's `inputSchema`**, and the standard envelope rendered back (ok / needs-human / fail badge, summary, pretty `result`, and meta: duration / tokens / change_id). See [web-ui-reuses-in-process-dispatch-not-subprocess-spawning](./web-ui-reuses-in-process-dispatch-not-subprocess-spawning.md) for why it shares dispatch with the CLI.

## Why does it matter?

It gives humans a visual way to discover and run righthand commands without remembering verbs/flags, while **inheriting the full trust model** — config layering, capability gates, and rollback all carry through because the server calls the same in-process `dispatch()` as the CLI. The mutating `new → rollback` cycle and real LLM calls both work end-to-end through the browser.

## Details

- **Location**: `src/commands/web.ts` (command) · `src/web/server.ts` (server) · `src/web/app.html` (SPA)
- **Invocation**: `righthand web [--port <n>] [--no-open]`. Default port **8787**, default host `127.0.0.1`, auto-opens the OS browser unless `--no-open`.
- **Descriptor**: `name: "web"`, `plugin: "@righthand/core"`, `costTier: "free"`. Declares **no** capabilities (it does no network/exec itself beyond opening a browser) → not capability-gated.
- **HTTP surface**:
  - `GET /` → the SPA HTML (inline CSS + vanilla JS, no framework, no build).
  - `GET /api/tools` → `{ tools: [...] }` from `getMergedManifest()` — MCP-shaped descriptors for the whole command surface.
  - `POST /api/run` → `{ command, args, flags }` → builds a `CommandContext` and calls `dispatch()` → returns `{ envelope, exitCode }`. 1MB body cap; invalid JSON / missing `command` / `command==="web"` → 400.
- **Self-recursion guard**: the server refuses to run `web` inside itself (400), and the SPA hides `web` from the list — prevents nested servers.
- **Consent model**: clicking *Run* is the human consent path; destructive/expensive commands still escalate to `needs_human` (exit 3) unless the form sends `--yes`. The gate is not bypassed.
- **`cli` export**: `{ args: { port, "no-open" } }` — consumed by `src/cli.ts` auto-wiring (no shared-file edits).
- **Tests**: `test/web.test.ts` — 7 tests (serves SPA, MCP-shaped `/api/tools`, `/api/run` happy-path, unknown→exit 2, `web`-refused→400, `needs-human`→exit 3, missing-command→400). Runs headlessly on an ephemeral port in an isolated temp HOME/cwd.

## Relationships

- [web-ui-reuses-in-process-dispatch-not-subprocess-spawning](./web-ui-reuses-in-process-dispatch-not-subprocess-spawning.md) — the core architecture choice: same `dispatch()` as the CLI.
- [stateless-subprocess-invocation](./stateless-subprocess-invocation.md) — `web` is a foreground one-shot server, not a daemon; consistent with the stateless-per-invocation model.
- [righthand-cli](./righthand-cli.md) — the product this command belongs to; a lifecycle command of the CLI.
- [command-auto-discovery-one-file-per-command-plugin-handlers-](./command-auto-discovery-one-file-per-command-plugin-handlers.md) — how `src/commands/web.ts` is discovered (drop a file, no shared edits).

## Lifecycle

- **First added**: this turn (C-web). One of the auto-discovered core commands; appears in `righthand tools --json` and `GET /api/tools`.
