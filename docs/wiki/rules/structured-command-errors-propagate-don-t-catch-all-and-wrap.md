---
type: Rule
title: Structured command errors propagate — don't catch-all and wrap as needs_human
description: Guideline
tags: [exit-codes, command-handler, error-handling, commanderror, selfbuilder, llm]
timestamp: "2026-07-24T13:48:19.072Z"
---

# Structured command errors propagate — don't catch-all and wrap as needs_human

## Guideline

In a command handler's `try/catch`, a **structured `CommandError`** (the errors
that map to a specific exit code — AUTH→4, DEP_MISSING→5, CAPABILITY→6,
USAGE→2) must **propagate** to dispatch, which derives the correct exit code from
the envelope. Only **unexpected, non-`CommandError`** failures should be caught
and wrapped as `needs_human` (exit 3).

## When it applies

Any command handler with a `try/catch` around a call that can throw structured
errors — LLM provider calls, capability checks, wrapped-CLI failures, config
resolution.

## The pattern

```ts
} catch (e) {
  if (e instanceof CommandError) throw e;   // let dispatch pick the exit code
  // only UNEXPECTED failures become needs_human
  return { ok:false, ..., needs_human: `... (${(e as Error).message})`, ... };
}
```

## Rationale

Dispatch (`src/runtime.ts`) derives exit codes from envelope state. Catching a
structured error and re-wrapping it as `needs_human` hides the precise cause and
returns exit 3 (NEEDS_HUMAN) when the real signal is exit 4 (AUTH),
exit 5 (DEP_MISSING), etc. `llm ask` already propagated correctly; `build`
([[self-extending-safe-undo-loop]]) diverged — `buildCommand` caught *all* LLM
failures including missing-provider AUTH and returned exit 3, inconsistent with
`llm ask`'s exit 4. Fixed in `src/selfbuilder.ts` with the guard above.

Keep every command handler consistent with [[command-output-envelope-and-exit-codes]]
— the exit-code set is only useful if handlers let dispatch assign the codes.

## Source

- `src/selfbuilder.ts` — `buildCommand` catch block (the fix + explanatory comment).
- `src/errors.ts` — `CommandError` definition.
- `src/runtime.ts` — dispatch exit-code derivation.
