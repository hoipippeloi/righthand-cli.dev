---
okf_version: "0.1"
---

# Project Knowledge Wiki

<!-- wiki-nav:start -->
## Navigation map

Auto-generated detailed index of every docs/wiki/ concept — the map the LLM uses to locate information. 53 concept(s). Regenerated on init and on wiki_mark_synced. Generated 2026-07-24T13:05:17.988Z.

Each entry: `concept-id` (pass to wiki_get) — title — description.

### Core concepts

- `glossary` — Glossary — Key terms for this project.
- `overview` — Overview — What righthand is, its structure, and how it's built.

### Architecture

- `architecture/file-tree` — File Tree — Complete project file listing with per-file descriptions.

### Pages

- `pages/artifacts/righthand-cli-prd` — righthand CLI PRD — The initiative-level Product Requirements Document for [[righthand-cli]] — the why, scope, and 10 high-level capabilities, written so a spec-writer can expand e
- `pages/artifacts/righthand-prd` — righthand PRD — The authoritative product-definition document for the righthand initiative, produced via the `new-prd-interview` skill.
- `pages/artifacts/righthand-problem-research-report` — Righthand problem research report — A web-research report (with citations) produced during the Phase-1 PRD brainstorm to ground the righthand problem statement in real evidence rather than assumpt
- `pages/concepts/command-authoring-and-scaffolding` — Command authoring and scaffolding — What is it?
- `pages/concepts/command-output-envelope-and-exit-codes` — Command output envelope and exit codes — What is it?
- `pages/concepts/factory-reset-capability-c-reset` — Factory reset capability (C-RESET) — What is it?
- `pages/concepts/ops-domain-commands-c8` — Ops domain commands (C8) — What is it?
- `pages/entities/doctor-command` — doctor command — **`righthand doctor`** is the read-only health & integration diagnostics command (capability [[c10-diagnostics]] / `decisions/diagnostics-command-righthand-doct
- `pages/entities/llm-command` — llm command — **`righthand llm`** is the user-facing command that wraps [[llm-provider-integration]]'s `complete()`. It is the thinnest possible surface over the LLM: send a 
- `pages/entities/llm-provider-integration` — LLM provider integration — **LLM provider integration** (`src/llm.ts`) is the single load-bearing module every reasoning capability builds on. It exposes one entry point — `complete()` —
- `pages/entities/plugins-command` — plugins command — What it is
- `pages/entities/righthand-cli` — righthand cli — **righthand cli** is the product this repository builds: an always-available CLI that a **main / coding LLM** can hand tasks off to. The coding agent focuses on
- `pages/TEMPLATES` — Page Templates — Reference templates for Concept, Entity, and Artifact pages. Follow these when using wiki_note_page.

### Decisions

- `decisions/build-all-is-v1-scope` — Full vision is v1 scope — phasing is build order, not a scope cut — Context
- `decisions/bun-support-is-a-hard-constraint-npm-only-distribution` — Bun support is a hard constraint; npm-only distribution — Context
- `decisions/citty-is-the-cli-layer` — citty is the CLI layer — Decision
- `decisions/cli-framework-citty-over-crust-js-proposed` — CLI framework: citty over crust.js (proposed) — Context
- `decisions/command-auto-discovery-one-file-per-command-plugin-handlers-` — Command auto-discovery: one file per command, plugin handlers stay lazy — Context
- `decisions/diagnostics-command-righthand-doctor-c10` — Diagnostics command — righthand doctor (C10) — Context
- `decisions/distribution-npm-based-for-cli-and-plugins-version-pinned-op` — Distribution: npm-based for CLI and plugins, version-pinned, opt-in auto-update — Context
- `decisions/extensible-plugin-system-is-a-first-class-architectural-pill` — Extensible plugin system is a first-class architectural pillar — Context
- `decisions/general-purpose-persona-targeting` — General-purpose persona targeting — Context
- `decisions/llm-augmented-commands-as-a-first-class-pillar` — LLM-augmented commands as a first-class pillar — Context
- `decisions/llm-provider-model-openai-compatible-base-plus-native-anthro` — LLM provider model: OpenAI-compatible base plus native Anthropic — Context
- `decisions/lock-success-criteria-measurable-metrics-never-break-bars` — Lock success criteria — measurable metrics + never-break bars — Context
- `decisions/mutating-commands-own-their-journaling-not-a-dispatch-auto-w` — Mutating commands own their journaling (not a dispatch auto-wrap) — Context
- `decisions/no-build-step-run-typescript-source-directly` — No build step — run TypeScript source directly — Context
- `decisions/node-typescript-is-the-runtime-for-righthand` — Node + TypeScript is the runtime for righthand — Context
- `decisions/plugin-sandbox-capability-declaration-permission-flags-subpr` — Plugin sandbox: capability declaration + permission flags, subprocess isolation for untrusted — Context
- `decisions/project-scoped-footprint-with-config-layering` — Project-scoped footprint with config layering — Context
- `decisions/research-backend-is-llm-driven-not-a-hard-coupled-search-api` — Research backend is LLM-driven, not a hard-coupled search API — Context
- `decisions/righthand-core-architecture` — righthand core architecture — Context
- `decisions/rollback-and-reset-capability-c-reset` — Rollback and reset capability (C-RESET) — Context
- `decisions/rollback-version-store-isomorphic-git-pure-js-over-system-gi` — Rollback version store: isomorphic-git (pure-JS) over system git or a custom VCS — Context
- `decisions/self-builder-safety-auto-smoke-test-gates-every-generated-co` — Self-builder safety: auto smoke test gates every generated command before install — Context
- `decisions/self-recursive-self-building-agent` — Self-recursive self-building agent — Context
- `decisions/stateless-subprocess-invocation` — Subprocess-per-task invocation: righthand is stateless, not a daemon — Context
- `decisions/technical-approach-proposed-architecture` — Technical approach — proposed architecture — Context
- `decisions/web-research-search-as-a-capability-d6` — Web research / search as a capability (D6) — Context

### Rules

- `rules/compress-don-t-relay` — Compress, don't relay — Guideline
- `rules/credential-values-use-env-keychain-indirection-never-plainte` — Credential values use env:/keychain: indirection — never plaintext on disk or in output — Guideline

### Learnings

- `learnings/bun-compile-binaries-are-58-109mb-crust-js-is-alpha-stage` — Bun --compile binaries are 58–109MB; crust.js is alpha-stage — Two non-obvious facts surfaced while evaluating the CLI framework (see
- `learnings/cold-start-177ms-after-discovery-isomorphic-git-kept-off-the` — Cold-start ~177ms after discovery; isomorphic-git kept off the cold path — After wiring auto-discovery (9 core command files, each importing its deps), `righthand tools` subprocess cold-start rose from the **94 ms** baseline (3 command
- `learnings/expensive-commands-can-t-show-then-confirm-via-dispatch-the-` — expensive commands can't show-then-confirm via dispatch — the approval gate preempts run() — When a command sets `costTier: "expensive"` (or `destructive: true`), the dispatch-level approval gate in `src/runtime.ts` / `src/capabilities.ts#requiresApprov
- `learnings/net-llm-capability-gate-llm-commands-are-denied-before-run-u` — net:llm capability gate: llm commands are denied before run() unless allowed — The `llm` command (and any future `righthand` command) declares `capabilities: ["net:llm"]` in its descriptor. Dispatch (`src/runtime.ts`) runs `checkCapabiliti
- `learnings/node-strip-only-typescript-rejects-parameter-properties-enum` — Node strip-only TypeScript rejects parameter properties, enums, and namespaces — When running `.ts` files directly on **Node 22+/24** (native type-stripping) — and on **Bun**, which behaves the same way — only *type-only* syntax is stripped.
- `learnings/node-test-rejects-top-level-await-anywhere-in-the-import-gra` — node --test rejects top-level await anywhere in the import graph — `node --test` fails an entire test file with "Detected unsettled top-level await" if **any** module in the file's import graph uses top-level `await` — even a d
- `learnings/operational-task-failure-modes-of-coding-agents` — Operational-task failure modes of coding agents — Research (web-research skill, three parallel subagents, cited) into why coding agents — Claude Code, Codex, Cursor, Aider, etc. — degrade the moment an *operati
- `learnings/ops-commands-declaring-capabilities-are-capability-gated-bef` — Ops commands declaring capabilities are capability-gated before they run — tests must grant caps — When implementing the C8 ops command groups (`ci`, `logs`, `docs`, `tasks`, `admin`), each command declares `capabilities` (e.g. `["exec:gh","net:api.github.com
- `learnings/resolveactivescope-falls-back-to-user-until-a-project-footpr` — resolveActiveScope falls back to "user" until a project footprint exists — `resolveActiveScope()` in `src/footprint.ts` returns **"project"** only when `./.righthand/` (or `.git/`) exists in the project root; otherwise it returns **"us
<!-- wiki-nav:end -->

An [OKF](https://github.com/earendil-works/okf) bundle documenting this project.

- [Overview](./overview.md) — What this project contains and its structure
- [File tree](./architecture/file-tree.md) — Complete project file listing
- [Glossary](./glossary.md) — Key terms for this project
- [Decisions](./decisions/) — Major decisions and direction shifts (ADRs)
- [Rules](./rules/) — Reusable heuristics, guidelines, and conventions
- [Pages](./pages/) — Concepts, entities, and artifacts of this project
- [Learnings](./learnings/) — Captured learnings and insights
- [Preferences](./preferences/) — Captured preferences and conventions
