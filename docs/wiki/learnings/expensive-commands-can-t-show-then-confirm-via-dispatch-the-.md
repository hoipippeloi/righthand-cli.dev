---
type: Learning
title: expensive commands can't show-then-confirm via dispatch — the approval gate preempts run()
description: "When a command sets `costTier: "expensive"` (or `destructive: true`), the dispatch-level approval gate in `src/runtime.ts` / `src/capabilities.ts#requiresApprov"
tags: [dispatch, capabilities, self-builder, c5, approval-gate, righthand]
timestamp: "2026-07-24T13:01:33.271Z"
---

# expensive commands can't show-then-confirm via dispatch — the approval gate preempts run()

When a command sets `costTier: "expensive"` (or `destructive: true`), the dispatch-level approval gate in `src/runtime.ts` / `src/capabilities.ts#requiresApproval` fires **before** `run()` executes: without `--yes` (or `config.permissions.auto_confirm_destructive`), dispatch returns `needs_human` exit 3 and the handler never runs.

This means a command that wants to **generate something, show it, then ask "install? [y/N]"** cannot do so through the normal dispatch path if it is declared expensive — the gate blocks it before it can produce anything to show. The C5 self-builder (`righthand build`) hits exactly this: it is `costTier: "expensive"` (it spends LLM tokens + writes code to disk), yet PRD C5 wants a show-then-confirm flow.

Resolution taken (no edit to runtime.ts/capabilities.ts was allowed this round):
- The dispatch approval gate IS the primary confirm for `build` — `righthand build "..."` without `--yes` → needs_human exit 3. Re-run with `--yes` to apply.
- `buildCommand()` in `src/selfbuilder.ts` keeps its OWN step-5 confirm (`if (!input.yes)` → needs_human + code in result) so the show-code path is still reachable when `auto_confirm_destructive: true` bypasses the dispatch gate but `--yes` was not passed.
- `--dry-run` (review without install) requires `--yes` to clear the gate too: `righthand build "..." --yes --dry-run`.

Implication for any future "show-then-confirm expensive command": either (a) accept the gate as the confirm (current), (b) make it NOT expensive/destructive and self-confirm like `new`/`reset`/`rollback` (those set neither — see the comment in `src/capabilities.ts`), or (c) relax the gate to skip `--dry-run` invocations (would require editing `requiresApproval` / dispatch).
