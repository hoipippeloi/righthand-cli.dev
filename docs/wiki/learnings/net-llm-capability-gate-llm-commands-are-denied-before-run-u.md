---
type: Learning
title: "net:llm capability gate: llm commands are denied before run() unless allowed"
description: "The `llm` command (and any future `righthand` command) declares `capabilities: ["net:llm"]` in its descriptor. Dispatch (`src/runtime.ts`) runs `checkCapabiliti"
tags: [llm, capabilities, testing, c4, sandbox]
timestamp: "2026-07-24T12:39:56.328Z"
---

# net:llm capability gate: llm commands are denied before run() unless allowed

The `llm` command (and any future `righthand` command) declares `capabilities: ["net:llm"]` in its descriptor. Dispatch (`src/runtime.ts`) runs `checkCapabilities()` against `config.permissions` **before** the handler:

- If `permissions.allow` does **not** contain a matching pattern (`net:llm`, `net:*`, or `*`), dispatch short-circuits to `exit 6` (`EXIT.CAPABILITY_DENIED`) with a `needs_human` message — `run()` is **never called**, so the AUTH(4)/no-provider logic inside the command never runs.
- Only when `net:llm` is granted does `run()` execute; then a missing/unresolvable provider or key surfaces as `exit 4` (`EXIT.AUTH`).

**Implication for testing**: to exercise a command's own error paths (e.g. "no provider → AUTH 4") through `dispatch()`, the test config must grant the capability (`config.permissions.allow = ["net:llm"]`). Tests that call `complete()` / `run()` directly bypass the gate and don't need it.

**Also**: `complete()` takes `opts.fetchFn` as a test seam — inject a fake fetch returning a canned OpenAI/Anthropic-shaped body; **no real network** in the suite. The command layer uses the global `fetch` (patch `globalThis.fetch` for an end-to-end dispatch test).
