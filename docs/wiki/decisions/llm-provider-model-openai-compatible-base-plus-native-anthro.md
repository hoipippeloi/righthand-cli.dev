---
type: Decision
title: "LLM provider model: OpenAI-compatible base plus native Anthropic"
description: Context
tags: [llm, providers, config]
status: accepted
timestamp: "2026-07-24T11:32:03.156Z"
---

# LLM provider model: OpenAI-compatible base plus native Anthropic

## Context
righthand's LLM-augmented commands ([[llm-augmented-commands-as-a-first-class-pillar]]) and self-builder ([[self-recursive-self-building-agent]]) must talk to many backends: OpenAI, OpenRouter, Ollama, Groq, Together, local/vLLM, and Anthropic. Users need to define their own endpoints and models.

## Choice
- **OpenAI-compatible base provider**, configurable via `type`, `baseURL`, `apiKey`, `model`, and params. Covers OpenAI/OpenRouter/Ollama/Groq/Together/local/vLLM — all speak the OpenAI HTTP shape.
- **Native Anthropic provider type** (distinct `type`) because Anthropic's API differs from OpenAI's.
- Commands pick a provider **by name** from configured providers; `baseURL` and `model` are fully user-defined.

## Alternatives considered
- Hard-code a fixed provider — fails the "user-defined endpoints/models" requirement.
- A generic adapter layer per vendor — premature; the OpenAI-compatible shape covers ~6 vendors natively without one.
- Provider SDK lock-in — avoided; configure by base URL instead.

## Rationale
The OpenAI-compatible shape is the de-facto standard most local/hosted servers implement, so one config block covers the majority. Anthropic needs its own type (different API), but that's just two types, not a per-vendor explosion. Name-based selection keeps commands decoupled from transport.

## Consequences
- Config schema carries a `providers` map keyed by name.
- Adding a future non-OpenAI, non-Anthropic vendor = a new `type`, not a rewrite.
