---
type: Decision
title: "Self-builder safety: auto smoke test gates every generated command before install"
description: Context
tags: [self-builder, safety, testing, v1]
status: accepted
timestamp: "2026-07-24T11:32:03.160Z"
---

# Self-builder safety: auto smoke test gates every generated command before install

## Context
The self-builder ([[self-recursive-self-building-agent]]) grows righthand's command surface by generating new commands via an LLM. Generated code is untrusted by definition and lands in the untrusted plugin set (see the plugin sandbox decision). We need a safety gate so broken/malformed commands can't install silently.

## Choice
- **Per-command smoke test (install gate):** every generated command must pass an auto-generated smoke test — a dry-run against its declared `inputSchema` — before it is installed.
- **Builder-level golden-set eval:** a curated golden-set eval suite for the self-builder itself, measuring generation quality over time.

## Alternatives considered
- Trust generated code, ship immediately — unacceptable; untrusted code path.
- Manual review gate only — defeats the self-building/automation narrative.
- Full static analysis suite at install — over-engineered for v1; dry-run smoke test is the minimum viable gate.

## Rationale
A dry-run against the declared schema is the smallest check that fails if the command is structurally broken — it gates install without heavy infra. The golden-set eval keeps builder quality observable and regressable. Together they let the self-builder stay automatic without becoming a footgun.

## Consequences
- Command manifest MUST declare `inputSchema` (contract for [[command-authoring-and-scaffolding]]).
- Install path runs the smoke test; failures block install and report to the user.
- Generated commands remain in the untrusted sandbox tier until promoted.
