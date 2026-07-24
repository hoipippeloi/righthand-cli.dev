---
type: Entity
title: LLM provider integration
description: **LLM provider integration** (`src/llm.ts`) is the single load-bearing module every reasoning capability builds on. It exposes one entry point — `complete()` — 
tags: [llm, providers, c4, core-module, openai, anthropic]
timestamp: "2026-07-24T12:39:56.327Z"
---

# LLM provider integration

**LLM provider integration** (`src/llm.ts`) is the single load-bearing module every reasoning capability builds on. It exposes one entry point — `complete()` — that turns an `LlmRequest` into an `LlmResponse` against a user-configured provider, plus the helpers that resolve *which* provider and *which* API key to use. Web research ([web-research-search-as-a-capability-d6](./web-research-search-as-a-capability-d6.md)), the self-builder ([self-recursive-self-building-agent](./self-recursive-self-building-agent.md)), and the LLM-assisted ops domains all call `complete()`; none of them know whether the backend is OpenAI-compatible or Anthropic.

It implements capability **C4** of [righthand-cli](./righthand-cli.md) and the accepted decision [llm-provider-model-openai-compatible-base-plus-native-anthro](./llm-provider-model-openai-compatible-base-plus-native-anthro.md) (OpenAI-compatible base + native Anthropic).

## Why does it matter?

This is the seam that separates "a wrapper that compresses" from "a wrapper that reasons." Every LLM-augmented command ([llm-augmented-commands-as-a-first-class-pillar](./llm-augmented-commands-as-a-first-class-pillar.md)) routes through here, so the contract must be stable and provider-agnostic — other capabilities depend on exactly this interface.

## Details

- **Location**: `src/llm.ts`
- **Interface / Schema** (the contract other capabilities depend on — do not break):
  - `LlmMessage { role: "system"|"user"|"assistant"; content: string }`
  - `LlmRequest { provider: string; messages: LlmMessage[]; model?; temperature?; maxTokens? }`
  - `LlmResponse { text; model; tokensUsed; finishReason? }`
  - `resolveProvider(config, name?)` → `{ name, provider }`. Resolution order: explicit name → `config.defaults.provider` → first listed provider → throw `AUTH`. Empty-string name is treated as unset (falls to default).
  - `resolveApiKey(provider)` → `string | null`. `"env:VAR"`→`process.env[VAR]`; plaintext→as-is; `"keychain:ref"`→`null` (deferred, `// TODO keychain`, no native dep in v1). See [credential-values-use-env-keychain-indirection-never-plainte](./credential-values-use-env-keychain-indirection-never-plainte.md).
  - `resolveEnvRef(value?)` → `string | undefined`. Generalizes the `env:` indirection beyond `apiKey` to **`baseURL` and `model`**: `"env:VAR"`→`process.env[VAR]`, plaintext→as-is. `complete()` resolves `provider.model` and `provider.baseURL` through it, so a provider's key, endpoint, and model can all live in `.env` while `config.json` holds only `env:` refs. See [righthand-auto-loads-env-env-indirection-covers-all-provider](../../learnings/righthand-auto-loads-env-env-indirection-covers-all-provider.md).
  - `complete(req, opts?: { config?; fetchFn?; signal? })` → `Promise<LlmResponse>`. `opts.fetchFn` is a **TEST SEAM** — tests inject a fake fetch; no real network in the suite.
- **Provider types & request shapes**:
  - `openai-compatible`: `POST {baseURL||"https://api.openai.com/v1"}/chat/completions`, header `Authorization: Bearer <key>`, body `{model, messages, temperature, max_tokens}`.
  - `anthropic`: `POST {baseURL||"https://api.anthropic.com"}/v1/messages`, headers `x-api-key` + `anthropic-version: 2023-06-01`, body `{model, messages, max_tokens, system?}`. `system` messages are **extracted** to the top-level `system` param (Anthropic rejects `role:"system"` inside `messages`). `max_tokens` is required by Anthropic → floored to `1024` when unset.
- **Token accounting**: `tokensUsed` = `usage.total_tokens` when present, else `usage.input_tokens + usage.output_tokens`, else `0`. Flow upward as `meta.tokens_used` on the envelope (see [llm-command](./llm-command.md)).
- **Error model**: no provider configured, unknown provider name, or unresolvable key → `CommandError(EXIT.AUTH)` (exit 4). HTTP failure → `CommandError(EXIT.FAIL)`.
- **Configuration**: providers live in [config](./config.md) under `config.providers.<name>` (`type`, `baseURL`, `apiKey`, `model`, `params`); default provider = `config.defaults.provider`.
- **`.env` loading**: `config.ts` calls `loadDotEnv` (`src/dotenv.ts`) for `./.env` and `~/.righthand/.env` before resolution — **real shell env always wins** (only unset keys are set); values are never logged. `.env` is the source for `env:` refs; `config.json` therefore stays committable with no machine-local wiring.

## Relationships

- [llm-provider-model-openai-compatible-base-plus-native-anthro](./llm-provider-model-openai-compatible-base-plus-native-anthro.md) — the decision this implements.
- [llm-augmented-commands-as-a-first-class-pillar](./llm-augmented-commands-as-a-first-class-pillar.md) — why righthand reasons mid-task.
- [llm-command](./llm-command.md) — the user-facing `righthand llm ask` command that wraps `complete()`.
- [credential-values-use-env-keychain-indirection-never-plainte](./credential-values-use-env-keychain-indirection-never-plainte.md) — the `env:`/`keychain:` indirection `resolveApiKey` honors.

## Lifecycle

- **First added**: C4 (Phase 2 — Reasoning). Implemented alongside [llm-command](./llm-command.md). Unblocks C5 (self-builder), C6 (research), and the LLM-assisted ops domains.
- **Deferred**: OS keychain resolution (`keychain:` refs return `null` until a native keychain dep is added — no native dependency in v1 core).
