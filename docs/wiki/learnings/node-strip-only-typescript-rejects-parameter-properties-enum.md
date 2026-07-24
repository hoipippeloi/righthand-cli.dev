---
type: Learning
title: Node strip-only TypeScript rejects parameter properties, enums, and namespaces
description: When running `.ts` files directly on **Node 22+/24** (native type-stripping) — and on **Bun**, which behaves the same way — only *type-only* syntax is stripped.
tags: [typescript, node, bun, tooling, righthand]
timestamp: "2026-07-24T11:46:13.358Z"
---

# Node strip-only TypeScript rejects parameter properties, enums, and namespaces

When running `.ts` files directly on **Node 22+/24** (native type-stripping) — and on **Bun**, which behaves the same way — only *type-only* syntax is stripped. Several TypeScript features require **transformation** (not stripping) and throw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at load time:

- ❌ **Parameter properties** — `constructor(public x: number)` → must be explicit: declare the field, assign in the body.
- ❌ **`enum`** declarations → use a plain `const` object + `as const` (we do this for `EXIT` exit codes in `src/contracts.ts`).
- ❌ **`namespace`** → use modules.
- ❌ **Parameter decorators / legacy decorator property emit** that changes runtime semantics.

Type-only constructs are fine: interfaces, type aliases, generics, `import type`, type assertions (`as`), `as const`, `satisfies`.

**Why it matters here:** righthand targets Bun with Node fallback and runs `.ts` directly with **no build step** (a deliberate ponytail choice — native platform feature, zero transpiler dependency). So the source must stay strip-only-clean. `src/errors.ts`'s `CommandError` was the first thing to trip this; fixed to explicit fields.

**Test runner:** `node --test` (no path arg) auto-discovers `test/**/*.test.ts`; `node --test test/` fails on Windows with `Cannot find module 'test'`. `package.json` `test` script is `node --test`.

**Cold-start data point (2026-07-24):** `righthand tools` end-to-end subprocess cold-start measured **94ms on Node 24** — already under the 200ms C1 target; Bun will be faster. The in-process discovery+render path is <1ms/call.
