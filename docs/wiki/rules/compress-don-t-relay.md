---
type: Rule
title: Compress, don't relay
description: Guideline
tags: [output-contract, design-guideline, context, righthand]
timestamp: "2026-07-24T10:51:26.423Z"
---

# Compress, don't relay

## Guideline

Every righthand command must return a **bounded, schema'd summary**, not a raw dump of the underlying tool's output. Full/verbose output is **opt-in** (an explicit flag), never the default.

## When it applies

To every command's output contract — the stdout righthand returns to the main coding LLM for any handed-off task (CI, logs, docs, task tracking, etc.).

## Rationale

Research into coding-agent failure modes ([[operational-task-failure-modes-of-coding-agents]]) found the agent's pain is **context, not capability**: dumping CI logs, YAML, or API docs into the coding window causes context rot and token cost (P2, P3). righthand exists to *absorb* ops work out of the coding context — so its own output must stay tight, or it just relocates the bloat rather than removing it. A bounded, schema'd summary is the unit the coding LLM can act on without re-bloating its window.
