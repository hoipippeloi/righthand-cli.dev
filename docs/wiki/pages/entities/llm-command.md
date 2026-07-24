---
type: Entity
title: llm command
description: "**`righthand llm`** is the user-facing command that wraps [[llm-provider-integration]]'s `complete()`. It is the thinnest possible surface over the LLM: send a "
tags: [llm, command, c4, cli, net:llm]
timestamp: "2026-07-24T12:39:56.328Z"
---

# llm command

**`righthand llm`** is the user-facing command that wraps [llm-provider-integration](./llm-provider-integration.md)'s `complete()`. It is the thinnest possible surface over the LLM: send a prompt, get back a bounded envelope. Auto-discovered from `src/commands/llm.ts` (one file per command — see [command-auto-discovery-one-file-per-command-plugin-handlers-](./command-auto-discovery-one-file-per-command-plugin-handlers.md)).

## Why does it matter?

It is the simplest demonstration of the C4 capability and the canonical pattern future LLM-augmented commands ([llm-augmented-commands-as-a-first-class-pillar](./llm-augmented-commands-as-a-first-class-pillar.md)) will follow: declare `capabilities: ["net:llm"]`, call `complete()`, return an envelope with `meta.tokens_used`.

## Details

- **Location**: `src/commands/llm.ts`
- **Invocation**: `righthand llm ask "<prompt>" [--provider <name>]`. The literal `ask` binds to the positional; the real prompt lands in citty's leftover-positional `args._` and is recovered by `extractPrompt()`. (Dispatch-level tests pass `prompt` directly as `args.prompt`.)
- **Descriptor**: `name: "llm"`, `capabilities: ["net:llm"]`, `costTier: "cheap"`, `plugin: "@righthand/core"`. **Not** destructive and cheap → bypasses the dispatch approval gate.
- **Result envelope**: `result = { text, model, tokensUsed }`, `meta.tokens_used = tokensUsed`, summary `"llm replied (N tokens, <model>)"`.
- **Capability gate**: because it declares `net:llm`, dispatch denies it (exit 6, `CAPABILITY_DENIED`) unless `config.permissions.allow` grants `net:llm` / `net:*` / `*`. With the capability granted but no provider/key configured, `run()` throws `CommandError(EXIT.AUTH)` with a `needs_human` hint → exit 4. See [net-llm-capability-gate-for-llm-commands](./net-llm-capability-gate-for-llm-commands.md).
- **`cli` export**: `{ args: { prompt: positional, provider: string flag } }` — consumed by `src/cli.ts` auto-wiring (no shared-file edits).

## Relationships

- [llm-provider-integration](./llm-provider-integration.md) — the `complete()` API this command calls.
- [command-auto-discovery-one-file-per-command-plugin-handlers-](./command-auto-discovery-one-file-per-command-plugin-handlers.md) — how this file is discovered.
- [net-llm-capability-gate-for-llm-commands](./net-llm-capability-gate-for-llm-commands.md) — the permission gate every `net:llm` command must pass.

## Lifecycle

- **First added**: C4 (Phase 2). One of the auto-discovered core commands; appears in `righthand tools --json`.
