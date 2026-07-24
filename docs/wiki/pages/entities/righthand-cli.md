---
type: Entity
title: righthand cli
description: "**righthand cli** is the product this repository builds: an always-available CLI that a **main / coding LLM** can hand tasks off to. The coding agent focuses on"
tags: [product, cli, llm-tooling, greenfield, distributable]
timestamp: "2026-07-24T11:01:15.834Z"
---

# righthand cli

**righthand cli** is the product this repository builds: an always-available CLI that a **main / coding LLM** can hand tasks off to. The coding agent focuses on building the app; righthand picks up "the rest" — the non-coding work that nonetheless has to get done.

It is a **standalone product** living in **its own repository**, intended to be **distributed to others** who want to use it (a public, installable tool — not an internal-only or plugin-of-another-system thing). Because it ships to outside users, first-run experience, config discovery, and "works in anyone's repo" are first-class design concerns.

The project is **greenfield** (only wiki scaffolding exists today). Its shape is being defined via a PRD interview (see the project `overview`).

## Why does it matter?

Coding LLMs (pi, Claude Code, Codex, Cursor, Aider, etc.) currently context-switch into admin chores — CI/CD, logging, docs, task tracking — that dilute their attention and burn context. righthand is the dedicated "right hand" that absorbs those chores so the main agent stays on the build. It is the central product the whole repo exists to produce; every other file here serves it.

Being a **standalone, distributable product** means onboarding friction and config portability directly affect adoption — a tool nobody can get running in their own repo gets used by nobody.

## Details

- **Location**: `E:/righthand.cli` (repo root). No source tree yet.
- **Interface / Schema**: the main LLM invokes righthand **as a subprocess via the terminal** (`righthand <command> ...`). The exact command surface (verbs, args, I/O contract) is still open. Core idea is *command dispatch*: the main LLM sends commands and task descriptions, and righthand owns the task to completion.
- **Invocation / lifecycle**: **spawned per task, torn down when the task finishes — stateless per invocation**, not a daemon. Any cross-task state (history, progress, config, results) must persist to disk/DB and be reloaded each run, not held in memory. See [[stateless-subprocess-invocation]].
- **Runtime / tech stack**: **Node + TypeScript** — decided. Chosen for fast startup; cold-start must stay lean via **lazy plugin loading** (each task's code loaded only when invoked). See [[node-typescript-is-the-runtime-for-righthand]].
- **Extensibility model — Pillar 3**: **modular plugin system is a first-class architectural pillar** — third parties can author/register their own tasks/commands; discovery + dispatch treat them like built-ins. See [[extensible-plugin-system-is-a-first-class-architectural-pill]].
- **LLM augmentation — Pillar 4 (accepted)**: righthand has its **own** LLM config and can invoke an LLM mid-task. Commands split into "do the ops" and "do the ops *and reason about it*"; degrades to pure-ops when no LLM is configured. See [[llm-augmented-commands-as-a-first-class-pillar]].
- **Self-recursive / self-building agent — Pillar 5 (proposed)**: with an LLM configured, a user can tell righthand's LLM what features it wants and the LLM builds them into righthand itself (righthand as its own developer). The **approval stance is locked to show-and-confirm-before-install** and **code location to both project-local + user-global (picked at generation time)** (Q5c resolved); the generation model (persistent vs ad-hoc vs hybrid) remains open. See [[self-recursive-self-building-agent]].
- **Target audience**: **general-purpose — all four personas matter** (indie, pro dev, DevOps/SRE, general); **pro-dev-with-real-ops is the sharpest design target**. See [[general-purpose-persona-targeting]].
- **Scope of handed-off tasks** (stated intent): admin, CI/CD, logging, documentation, task tracking — "all tasks that don't involve the actual building of an app."
- **Distribution model**: standalone, distributable product (own repo, installable by third parties). The packaging/install *mechanism* (npm, Homebrew, Scoop/winget, GitHub Releases, etc.) is still open — though npm is a natural fit given the Node runtime.
- **Configuration**: TBD (config file location/format, global-vs-per-repo config, env vars, or a mix). Must include the **dedicated LLM provider config** from Pillar 4. Distribution to others makes zero-config default behavior + easy discovery high priority.

## Relationships

- `overview` (project overview) — righthand cli is the product the project overview describes.
- [[stateless-subprocess-invocation]] — the invocation model this entity runs under (stateless subprocess per task).
- [[node-typescript-is-the-runtime-for-righthand]] — why the runtime is Node + TypeScript.
- [[extensible-plugin-system-is-a-first-class-architectural-pill]] — why extensibility is a first-class pillar (Pillar 3).
- [[llm-augmented-commands-as-a-first-class-pillar]] — why LLM augmentation is a first-class pillar (Pillar 4).
- [[self-recursive-self-building-agent]] — the self-building capability (Pillar 5, proposed).
- [[general-purpose-persona-targeting]] — audience and design target.

## Lifecycle

- **First added**: greenfield; PRD interview opened in an earlier turn. Vision/intent captured here; nothing is built yet.
- **Recent changes**: (1) invocation model (subprocess via terminal, stateless per task) defined; (2) distribution model confirmed as standalone, third-party-distributable; (3) **runtime resolved to Node + TypeScript**; (4) **extensible plugin system raised to a first-class architectural pillar (Pillar 3)**; (5) **LLM-augmented commands added as Pillar 4 (accepted)**; (6) **self-recursive self-building agent added as Pillar 5 (proposed — mechanism pending Q5b)**; (7) **persona targeting locked as general-purpose, pro-dev-with-ops as design target**; (8) **self-builder approval stance (show-and-confirm-before-install) + code location (both, at generation time) resolved (Q5c)**.
- **Open questions** (to resolve before spec): (1) primary target LLM(s); (2) exact command surface & I/O contract; (3) packaging/install mechanism (npm/brew/releases/etc.); (4) plugin discovery, registration, and task-author contract; (5) the self-builder's generation model (persistent vs ad-hoc vs hybrid) — approval stance (show-and-confirm-before-install) and code location (both, at generation time) were resolved in Q5c.

## Source

- PRD interview (this session) — stated intent, opening scoping questions, the subprocess invocation model, the standalone-distributable product confirmation, the Node+TS runtime choice, the first-class plugin-system pillar, the LLM-augmentation pillar, the proposed self-recursive agent, and the persona-targeting lock. No code committed yet.
