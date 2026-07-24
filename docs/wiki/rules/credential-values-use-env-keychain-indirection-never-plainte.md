---
type: Rule
title: "Credential values use env:/keychain: indirection — never plaintext on disk or in output"
description: Guideline
tags: [security, credentials, secrets, config, never-break, c9, c4]
timestamp: "2026-07-24T11:40:55.593Z"
---

# Credential values use env:/keychain: indirection — never plaintext on disk or in output

## Guideline

Any configuration value that is a **secret** (LLM provider `apiKey`, tokens, passwords) must be stored as a **reference**, not the secret itself:

- `env:VAR` — resolve from the environment variable `VAR`
- `keychain:<ref>` — resolve from the OS keychain / secret store

Resolved values are:

- **Never written to disk in plaintext** (config stores only the reference string).
- **Never emitted to output** of any kind — not stdout, logs, error messages, or the JSON envelope.

## When it applies

Every place a secret enters the system: config files (`~/.righthand/config.json`, `./.righthand/config.json`), command output (`config get` / `config list`), and project bootstrap (`init --from`). Specifically:

- `config get` / `config list` **must redact** — show `env:OPENAI_API_KEY`, never the resolved value.
- `init --from` **refuses to copy credentials** between footprints (secrets are per-machine via the keychain).
- Credential *resolution* happens in the C4 credential layer; config only ever holds the reference.

## Rationale

righthand is a **distributable tool adopted by third parties**, and its output is **consumed by coding agents** (piped JSON). Plaintext secrets in config files would be accidentally committed to git, leaked across machines, or dumped into agent stdout/logs — the standard secret-leak failure modes. Indirection + redaction is a **never-break security bar** ("bar #4" in the PRD). It is cheap to enforce once at the read/render boundary (root-cause fix) and catastrophic to skip.

## Evidence / source

- `.specs/lifecycle-config/spec.md` (C9) — "Credential resolution" section + the `config get/list` redaction requirement + `init --from` refusal.
- `.specs/core-runtime/spec.md` (C1) — "the runtime itself holds no secrets inline; credentials come from C4's keychain/env layer."
- PRD never-break bar #4.
