---
type: Decision
title: Diagnostics command — righthand doctor (C10)
description: Context
tags: [architecture, righthand, diagnostics, doctor, command-surface, c10]
status: accepted
timestamp: "2026-07-24T11:18:06.669Z"
---

# Diagnostics command — righthand doctor (C10)

## Context

During the PRD interview (Topic 6 — Technical Approach), the user added a new capability to righthand's command surface: **`righthand doctor`** — a config/integration diagnostics command. It is the "is my setup healthy?" entry point for a tool that is *distributed to third parties and runs in anyone's repo*, so first-run experience and "works out of the box" are first-class concerns (see [[righthand-cli]]).

This was explicitly **Recorded (C10)** by the user this turn ("1. add righthand doctor … its ok 2. its okay 3. lets go").

## Choice

`righthand doctor` runs a battery of health checks and reports status per check. The planned checks (from this turn):

- **LLM provider** — is a provider configured and reachable (OpenAI-compatible / Anthropic / Ollama local)? (supports [[llm-augmented-commands-as-a-first-class-pillar]])
- **Search backend** — is a research/search backend configured and reachable? (supports [[web-research-search-as-a-capability-d6]])
- **CI tokens** — are the credentials the ops wrappers need present (e.g. `gh`, cloud CLIs)? (supports the ops-backend stance in [[technical-approach-proposed-architecture]])
- **Plugin health** — are installed plugins loadable / well-formed? (supports [[extensible-plugin-system-is-a-first-class-architectural-pill]])
- **Version** — current installed version + whether it's current.

It follows the standard [[compress-don-t-relay]] output contract: a bounded, schema'd status summary by default.

## Alternatives considered

- **No diagnostics command; users debug setup by hand** — rejected: righthand ships to outside users across arbitrary repos; a "why isn't this working?" probe is essential to adoption and to the [[righthand-cli]] distribution concern.
- **`doctor` as a verbose raw log dump** — rejected: it must obey the same compress-don't-relay output contract as every other command.

## Rationale

- Explicit user request this turn; directly serves righthand's distributable-product onboarding friction (a tool nobody can get running in their own repo gets used by nobody).
- Concentrates the "is it working?" question into one command rather than scattering it — pairs naturally with the cross-cutting concerns (LLM, search, creds, plugins, version) the other pillars depend on.

## Consequences

- One concrete, well-scoped command to build early — useful as a first integration target since it exercises config discovery, credential lookup, plugin loading, and the output contract all at once.
- Its check list implicitly locks the **integration surfaces** that must be probe-able: LLM provider, search backend, CI/OS credentials, plugin registry, version.

## Status

**Proposed (capability accepted into scope).** `righthand doctor` is in scope as a command; the exact check set + exit-code / `--json` schema is to be pinned at spec time. Capability decision; see [[righthand-cli]] for the command index.
