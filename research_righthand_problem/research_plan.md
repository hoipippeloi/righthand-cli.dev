# Research Plan: Grounding the "righthand" Problem Statement

## Main research question
What concrete pain points do developers experience today when AI coding agents
(LLMs like Claude Code, Cursor, Copilot/Codex, Aider) attempt **non-coding /
operational** work (CI/CD, logging, documentation, task/issue tracking, infra
admin) — and how do current tools, MCP servers, and "agent handoff" patterns
address or fail to address this gap? This grounds the problem statement for a
proposed Node CLI ("righthand") that any coding LLM invokes as a subprocess
"right hand" to offload all non-coding tasks.

## Subtopics

### 1. Failure modes of LLM coding agents doing ops work
Concrete developer complaints: hallucinated/guessed CLI commands, context-window
bloat from dragging in CI configs + API docs + log dumps, token cost, flow
interruption (LLM pings the human), inconsistency across sessions. Looking for
real examples from blogs, HN, Reddit, vendor docs.

### 2. Existing tooling & landscape for LLM → ops delegation
MCP servers for CI/CD/GitHub/observability, "AI sidekick / agent CLI" patterns,
CLIs designed to be invoked by agents (e.g. gh, git, terraform, kubectl in agent
loops), and any "companion CLI" or "ops assistant" products. What exists, what's
missing, where righthand would fit.

### 3. Plugin / extensibility models in agent-invoked Node CLIs
How modular CLI tools structure third-party command/plugin systems that could be
discovered and invoked by an LLM. oclif plugins, clipanion, Nx-style local
plugins, how agent-discoverable command surfaces are exposed. Informs righthand's
"others can build tasks/commands into it" pillar.

## Synthesis
Combine into a problem/motivation brief with cited evidence, a competitive
snapshot, and implications for righthand's scope and plugin design. Saved to
`research_righthand_problem/research_report.md`.
