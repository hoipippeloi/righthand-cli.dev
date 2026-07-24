---
type: Learning
title: Operational-task failure modes of coding agents
description: Research (web-research skill, three parallel subagents, cited) into why coding agents — Claude Code, Codex, Cursor, Aider, etc. — degrade the moment an *operati
tags: [problem-statement, research, coding-agents, evidence-base, righthand]
timestamp: "2026-07-24T10:51:26.422Z"
---

# Operational-task failure modes of coding agents

Research (web-research skill, three parallel subagents, cited) into why coding agents — Claude Code, Codex, Cursor, Aider, etc. — degrade the moment an *operational* step enters the loop surfaced **five reinforcing failure modes**. This is the evidence base for why [[righthand-cli]] exists: the problem isn't "agents can't do ops," it's "doing ops *inside the coding context* is what breaks them."

## The five failure modes

1. **Hallucinated commands/flags/APIs (P1)** — when the agent runs shell commands itself, it can hallucinate a path or flag and *execute it* with no undo. (Evidence: "terrible hallucinated documentation in Claude Code" — HN; the tool Kintsugi exists solely to intercept agents' shell commands — "a hallucinated path… no undo.")
2. **Context bloat (P2)** — CI YAML, logs, API docs dumped into the coding window cause "context rot." (Anthropic's own guide is built on "the context window fills up fast.")
3. **Token cost (P3)** — that bloat is billed; "tens of thousands of tokens" per session. (Anthropic best-practices guide.)
4. **Flow interruption (P4)** — ops touches "unknown infrastructure," which the agent bounces back to the human. (Anthropic flags this as a literal risk class.)
5. **Session/agent inconsistency (P5)** — yesterday's ops answer is unrecoverable across sessions. (The tool Cass exists solely to re-unify scattered agent histories.)

## The empty quadrant righthand fills

Nothing in today's landscape is *one subprocess CLI that is plugin-extensible, stateless-per-task + on-disk continuity, owns ops tasks end-to-end, host-agnostic, and zero-config-first.* MCP servers are saturated and host-bound; raw CLIs (`gh`, `kubectl`) are universal but context-expensive. A **subprocess CLI is the only model that reaches every agent** — they all have a shell tool, no registration needed. This validates the [[stateless-subprocess-invocation]] and [[extensible-plugin-system-is-a-first-class-architectural-pill]] decisions.

## Two strategic watch-outs the research surfaced

- **Compress, don't relay** — every command returns a bounded, schema'd summary; full dumps opt-in. See [[compress-don-t-relay]].
- **The plugin contract is the moat** — making it trivial for third parties to add an ops task is the most defensible differentiator and compounds. See [[extensible-plugin-system-is-a-first-class-architectural-pill]].

## Source

- Full cited report: [[righthand-problem-research-report]] (raw findings in `research_righthand_problem/findings_*.md`).
