---
type: Decision
title: Lock success criteria — measurable metrics + never-break bars
description: Context
tags: [prd, success-criteria, architecture, acceptance-bar]
status: accepted
timestamp: "2026-07-24T11:15:04.444Z"
---

# Lock success criteria — measurable metrics + never-break bars

## Context

During the PRD interview (Topic 4), the success criteria for **righthand** were locked. The prior [[righthand-problem-research-report]] identified pain points P1–P5 plus a factory-reset/rollback concern (C-RESET). We needed a concrete, opinionated definition of "done" so that success is literally "we killed the pains" — not vibes.

The user authorized an opinionated lock ("you decide"), so rather than ask open-ended, we committed to a specific set.

## The choice (locked)

A success-criteria set with three layers:

**1. Experiential signals**
- 🟢 *Works:* "I stopped babysitting my agent on ops tasks — it hands them off and gets a one-line answer back."
- 🔴 *Broken:* righthand lost data, touched app code unprompted, or the self-builder installed commands I couldn't roll back.
- 🤖 *LLM handoff:* agent runs `righthand <cmd>`, gets a small schema'd JSON summary, never reads a raw log or man page into context.

**2. Measurable metrics** (each tagged to the pain it kills)

| Metric | Target | Kills |
|---|---|---|
| Cold-start of `righthand <cmd>` | ≤ **200ms** | spawned-per-task perf |
| Output compression vs raw tool output | summary ≤ **20%** of raw tokens, by default | P2/P3 |
| Ops command reliability | ≥ **99%** succeed, no hallucinated flags | P1 |
| Self-builder first-pass success | ≥ **80%** of generated commands install + pass smoke test | P4 |
| Rollback safety | **100%** of changes rollback-able; restore never fails | C-RESET |
| Context saved per ops task | saves the main LLM **≥5k tokens** vs doing it inline | P2/P3 |

**3. Non-functional bars (the never-break lines — locked)**
1. **Never lose user data** — every change journaled before apply; rollback always possible.
2. **Never touch application source code without an explicit command** — righthand operates on its own footprint + ops tooling, not the user's app, unless asked.
3. **Cold-start ≤ 200ms** for any core command (stateless + lazy-loaded plugins).
4. **Credential isolation** — righthand holds its own secrets; never leaks them to stdout/logs/args.
5. **Idempotent & reproducible** — same command + args + env → same result. (kills P5)
6. **Zero-config default** — installs and runs usefully with no config; degrades gracefully when optional integrations (LLM, search, CI tokens) are absent.

## Alternatives considered

- **Leave metrics open / ask the user to fill in.** Rejected — "you decide" authorized an opinionated lock, and vague criteria make specs untestable.
- **Define success per-capability later.** Rejected — a top-level acceptance bar that maps 1:1 to the research pains keeps every downstream spec honest about which pain it serves.

## Rationale

Mapping each metric to a pain point makes success falsifiable: a capability that doesn't move a P-metric isn't pulling weight. The never-break bars are the lines that, if crossed, make the tool untrustworthy regardless of feature completeness (data loss and silent app-code mutation are trust-destroying, not merely inconvenient).

## Consequences

- These targets are **aggressive** and will constrain architecture:
  - Cold-start ≤200ms forces [[stateless-subprocess-invocation]] + lazy plugin loading — no eager import graphs.
  - Output ≤20% tokens is the quantitative backing for the [[compress-don-t-relay]] rule — commands must summarize, not relay.
  - 100% rollback-able + "journal before apply" is a hard requirement on [[self-recursive-self-building-agent]] and every mutating command; it is also the acceptance bar for [[factory-reset-capability-c-reset]].
  - ≥99% reliability + "no hallucinated flags" means commands must validate/parse flags against their manifest, not free-form pass-through.
- Specs and tests should be written against these numbers; a capability that cannot hit its target is out of scope for v1.
- Several bars reinforce existing decisions rather than replace them — they are the *measurable* form of choices already made (statelessness, compression-first, self-builder show-and-confirm).

## Relationships

- [[righthand-cli]] — the product these criteria apply to.
- [[righthand-problem-research-report]] — source of the P1–P5 pains the metrics kill.
- [[stateless-subprocess-invocation]] — underpins the ≤200ms cold-start bar.
- [[compress-don-t-relay]] (rule) — the output ≤20% tokens bar in operational form.
- [[self-recursive-self-building-agent]] — owns the ≥80% first-pass-success target.
- [[factory-reset-capability-c-reset]] — owns the 100% rollback-able bar.
