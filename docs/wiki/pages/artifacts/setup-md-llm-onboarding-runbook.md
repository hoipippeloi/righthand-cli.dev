---
type: Artifact
title: SETUP.md LLM onboarding runbook
description: `SETUP.md` (repo root) is an executable onboarding runbook written **for an LLM agent to follow** — the counterpart to the shorthand `README.md` and the interac
tags: [setup, onboarding, docs, artifact]
timestamp: "2026-07-24T16:49:08.432Z"
---

# SETUP.md LLM onboarding runbook

`SETUP.md` (repo root) is an executable onboarding runbook written **for an LLM agent to follow** — the counterpart to the shorthand `README.md` and the interactive [readme-html-interactive-readme](./readme-html-interactive-readme.md). It turns "add righthand to this project" into a deterministic, verify-gated sequence an agent can run without human hand-holding.

## What it documents
- [righthand-cli](./righthand-cli.md) — what's being onboarded (a subprocess ops CLI a coding agent hands non-coding work to)
- The **onboarding flow**: detect env → install → `righthand init` footprint → gitignore machine-local bits → (optional) wire an LLM provider → grant capabilities → verify → tell the project's agent righthand exists
- Capability model — deny-by-default, granted via `permissions.allow` ([plugin-sandbox-capability-declaration-permission-flags-subpr](./plugin-sandbox-capability-declaration-permission-flags-subpr.md))
- Credential indirection — `env:` refs into `.env`, never plaintext ([credential-values-use-env-keychain-indirection-never-plainte](./credential-values-use-env-keychain-indirection-never-plainte.md))
- An exit-code troubleshooting table (2 usage / 3 NEEDS_HUMAN / 4 auth / 5 dep-missing / 6 capability-denied) plus rollback/removal

## Details
- **Location**: `SETUP.md` (repo root); coexists with `README.md` + `README.html`.
- **Format**: plain Markdown; each step has exact commands, a **Verify** gate, and an **On failure** note — designed so an agent never skips ahead on a failed check.
- **Audience**: an LLM agent run from the target project's root; human-readable too.
- **Surfaced a bug**: Step 5's documented `config set permissions.allow '[...]'` failed until `coerceValue` parsed JSON arrays — see [config-set-must-json-coerce-arrays-objects-the-layered-merge-silently](./config-set-must-json-coerce-arrays-objects-the-layered-merge.md).

## Source
- `SETUP.md` — the artifact itself
