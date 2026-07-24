---
type: Decision
title: Project-scoped footprint with config layering
description: Context
tags: [config, footprint, layout, v1]
status: accepted
timestamp: "2026-07-24T11:32:03.156Z"
---

# Project-scoped footprint with config layering

## Context
righthand is per-project: it owns ops work for a given repo with rollback-able state and plugins. It also needs shared identity (credentials) across projects and a way to bootstrap a new project from an existing one.

## Choice
- **Project-scoped footprint** at `./.righthand/` is primary: project config, installed plugins, state/history, rollback data.
- **`~/.righthand/`** holds shared defaults + credentials (never duplicated per project).
- **`righthand init --from <other-project>`** copies config/plugins/state from another project into the current one.
- Config layering with documented precedence: project > user-defaults.

## Alternatives considered
- Global-only state at `~/.righthand/` — loses per-project isolation and rollback semantics.
- State in the user's home keyed by path — harder to copy/share/port; no clean `init --from`.
- No layering — every project re-declares everything; bad DX.

## Rationale
Per-project footprint gives isolation + portability (the whole footprint is self-contained and rollback-able). Layering with a shared user home avoids credential duplication while keeping project config local. `init --from` makes bootstrapping cheap by copying a known-good footprint.

## Consequences
- Config resolution implements documented precedence (project overrides user).
- Credential storage lives ONLY in `~/.righthand/` — never written into the project footprint (so the footprint can be shared/committed safely).
- State/rollback ([[rollback-and-reset-capability-c-reset]]) is scoped per footprint.
