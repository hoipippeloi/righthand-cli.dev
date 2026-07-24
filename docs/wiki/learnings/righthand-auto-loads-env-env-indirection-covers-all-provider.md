---
type: Learning
title: "righthand auto-loads .env; env: indirection covers all provider fields"
description: What changed
tags: [llm, config, dotenv, credentials, secrets, c4, c9]
timestamp: "2026-07-24T14:07:21.771Z"
---

# righthand auto-loads .env; env: indirection covers all provider fields

## What changed

righthand now reads `.env` files into `process.env` at config time, and the
`env:VAR` indirection (previously `apiKey`-only) was generalized to **all three
provider connection fields** — `apiKey`, `baseURL`, and `model`.

### `.env` loading

- `src/dotenv.ts` (`loadDotEnv(file)`) is wired into `src/config.ts` and reads
  **`./.env`** (repo root) then **`~/.righthand/.env`** before config resolution.
- **Real shell env always wins**: dotenv only sets keys that aren't already
  defined (`if (process.env[key] === undefined)`). A var exported in the shell
  is never overwritten by the file.
- Supports `KEY=VALUE`, `export KEY=VALUE`, single/double quotes, `#` comments,
  blank lines. Values are **never logged**.
- This means secrets no longer need to be exported in the shell — drop a `.env`
  and righthand picks it up.

### Generalized `env:` indirection

- `src/llm.ts` gained `resolveEnvRef(value)`: `"env:VAR"` → `process.env[VAR]`,
  plaintext → as-is. `complete()` now resolves `provider.model` and
  `provider.baseURL` through it (alongside the existing `resolveApiKey` for the
  key).
- Effect: a provider entry can reference `env:CHAT_BASE_URL` /
  `env:DEEPSEEK_API_KEY` / `env:CHAT_MODEL`, keeping the **key, endpoint, and
  model all in `.env`** while `config.json` holds only `env:` references. The
  footprint's `config.json` stays committable/shareable across machines — no
  machine-local wiring copied to disk.

## How to configure a provider (the working pattern)

```bash
# .env  (gitignored)
DEEPSEEK_API_KEY="sk-..."
CHAT_BASE_URL="https://api.deepseek.com/v1"
CHAT_MODEL="deepseek-chat"
```

```jsonc
// ./.righthand/config.json  (committable — only refs, no values)
{
  "providers": { "default": {
      "type": "openai-compatible",
      "baseURL": "env:CHAT_BASE_URL",
      "apiKey":  "env:DEEPSEEK_API_KEY",
      "model":   "env:CHAT_MODEL"
  }},
  "defaults": { "provider": "default" },
  "permissions": { "allow": ["net:llm", "fs:write"] }
}
```

## Why this matters / how it extends existing knowledge

This extends [[credential-values-use-env-keychain-indirection-never-plainte]]
beyond *secrets*: the same indirection now keeps **endpoint + model** out of the
committable config too, so `config.json` is fully machine-agnostic. It is the
single source of truth for "where do I put my provider wiring?" — answer: `.env`,
referenced via `env:`.

## Gotchas

- `.env` files are **not** a config layer that overrides `config.json` — they
  populate the environment that `env:` refs read from. `config.json` structure
  still wins for non-secret config.
- `config list` already redacts `env:` refs (shows `env:CHAT_BASE_URL`, not the
  value); this is unchanged.
- Verified end-to-end: a real `righthand llm` round-trip to DeepSeek returned
  `"hello world"`, 14 tokens, exit 0.

## Source

- `src/dotenv.ts` — the loader (`loadDotEnv`).
- `src/llm.ts#resolveEnvRef` — generalized indirection; called by `complete()`.
- `src/config.ts` — where `loadDotEnv` is invoked.
- `[[llm-provider-integration]]` — the entity whose contract gained `resolveEnvRef`.
