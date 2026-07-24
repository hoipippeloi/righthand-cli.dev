---
type: Artifact
title: llms.txt agent operating instructions
description: "`llms.txt` (repo root) — a root-level markdown file following the [llms.txt convention](https://llmstxt.org) (well-known root path LLMs are taught to read for p"
tags: [llms-txt, artifact, llm-coupling, agent-instructions, docs]
timestamp: "2026-07-24T17:26:21.435Z"
---

# llms.txt agent operating instructions

`llms.txt` (repo root) — a root-level markdown file following the [llms.txt convention](https://llmstxt.org) (well-known root path LLMs are taught to read for project context), but deliberately framed as **operating instructions for the coding LLM**, not project documentation. Its entire job: sit in the main LLM's context window and teach it to **delegate operational work to righthand by default** instead of dragging logs/CI output into its own context.

## What it documents

- [righthand-cli](./righthand-cli.md) — what righthand is and why this file exists (the framing: righthand is the thing this repo ships; this file teaches treating it as an operations subprocess).
- **The core delegation rule** — any operational task (CI, logs, issues, docs, tasks, env, web lookups) → call righthand, read its one-line `summary`, carry on. Explicitly names when NOT to use it (editing/reading source).
- [command-output-envelope-and-exit-codes](./command-output-envelope-and-exit-codes.md) — the JSON envelope shape, exit codes, "always `--json`".
- The **21-command surface** (grouped: ci/logs/docs/tasks/admin, llm/research, build/new/plugins, system).
- **Three tight-coupling patterns** for the agent: (1) *enumerate once, then dispatch* via `righthand tools --json` (MCP-shaped descriptors), (2) *trust the summary, drop the rest*, (3) *grow the surface on demand* via `build` (see [self-extending-safe-undo-loop](./self-extending-safe-undo-loop.md)).
- [plugin-sandbox-capability-declaration-permission-flags-subpr](./plugin-sandbox-capability-declaration-permission-flags-subpr.md) — deny-by-default capabilities; [credential-values-use-env-keychain-indirection-never-plainte](./credential-values-use-env-keychain-indirection-never-plainte.md) credential indirection; `righthand doctor` to diagnose denials.
- **Install** (`npm install -g`), **status/limits** (v1 baseline: `keychain:` resolves to null, no OS-level subprocess isolation, shallow `--deep`).

## Details

- **Location**: `llms.txt` (repo root). Coexists with `README.md` (shorthand, humans) and `README.html` (interactive, humans).
- **Format**: single root-level markdown file per the llms.txt convention; zero runtime deps (it is documentation, not code).
- **Distinction from siblings**: [readme-html-interactive-readme](./readme-html-interactive-readme.md) and `README.md` are human-facing project overviews; [setup-md-llm-onboarding-runbook](./setup-md-llm-onboarding-runbook.md) is a *runbook* an LLM follows to set the project up. `llms.txt` is *persistent operating context* — what lives in the agent's window by default once it has read the repo.
- **Design choice (deliberate)**: no separate `llms-full.txt` / `llms-small.txt` split and no per-command schema dumps baked in. The file tells the agent to fetch live, always-current descriptors via `righthand tools --json` instead. Add the split only if an agent vendor needs statically-baked sections.

## Source

- `llms.txt` — the artifact itself (repo root).
