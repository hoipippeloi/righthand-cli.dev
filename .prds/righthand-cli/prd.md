# righthand — The Coding Agent's Always-Available Operations Right-Hand

## Feature Overview

**righthand** is a standalone, distributable command-line tool that acts as a
universal "right hand" to any AI coding agent (Claude Code, Cursor, Copilot/Codex,
Aider, Gemini CLI, pi, etc.). The main coding LLM spawns righthand as a
**subprocess per task**; righthand owns all the **non-coding, operational work**
— CI/CD, logging/observability, documentation, task/issue tracking, general
admin, and web research — and returns a **compressed, decision-ready, schema'd
result** back to the agent. righthand is then torn down, leaving the main LLM's
context window free to do what it does best: write code.

righthand exists because coding agents are tuned for *editing code inside a
repo*, and they degrade sharply the moment an operational step enters the loop
(see Problem Statement). Rather than have the agent fumble raw `gh`/`kubectl`/
`terraform` incantations, drag log dumps and CI configs into its context, or
interrupt the human to do ops manually, the agent hands the **whole task** to
righthand and gets back an answer.

Three things make righthand distinctive in a crowded landscape of MCP servers
and CLI wrappers: (1) it is a **subprocess CLI** — the only integration model
that reaches *every* agent with no host registration or JSON config; (2) it is
**plugin-extensible as a first-class pillar**, with a JSON-manifest discovery
model and a documented authoring contract so third parties can add ops tasks;
and (3) it can **use an LLM itself** — both to reason mid-task and, most
ambitiously, to **write new commands into its own surface** (a self-recursive,
self-extending agent). A journal-backed **rollback** makes the self-builder safe
to trust.

The full vision is v1 scope; delivery is sequenced by dependency, not gated.

## Problem Statement

Coding agents (Claude Code, Cursor, Copilot/Codex, Aider, Devin, pi) are tuned
for writing code in a repository. They degrade the moment an **operational** step
enters the loop — triggering a build, reading logs, triaging an incident,
updating docs, filing an issue, touching infra. Five reinforcing failure modes
recur across vendor documentation, engineering blogs, and developer forums
(Hacker News, Reddit); each is cited in
`research_righthand_problem/findings_1_failure_modes.md`:

1. **Hallucinated commands/flags/APIs** — the agent invents CLI incantations or
   fabricates library details, and the command *runs*. Kintsugi exists solely to
   intercept agents' shell commands: "a hallucinated path… there's no undo."
2. **Context-window bloat** — to do one ops task the agent drags CI YAML, log
   dumps, and API docs into the same window it edits code in, causing "context
   rot." Anthropic's own Claude Code guide is organized around the admission
   that "the context window fills up fast, and performance degrades as it fills."
3. **Token cost** — that bloat is billed; "a single debugging session or
   codebase exploration might generate and consume tens of thousands of tokens."
4. **Flow interruption** — ops steps touch credentials or "unknown
   infrastructure"; the agent stops and bounces the work to the human.
   Anthropic flags "unknown infrastructure" as a literal risk class.
5. **Session/agent inconsistency** — each agent and project keeps a siloed
   history, so "the solution I found yesterday" is unrecoverable (the Cass tool
   exists only to re-unify these scattered histories).

**Who feels it:** every developer using an AI coding agent on a project with
real CI/CD, cloud, or observability — from indie devs to professional full-stack
engineers to DevOps/SRE-adjacent practitioners. **Why now:** agent usage has
exploded, the ops surface they must touch has not gotten easier, and the MCP
server market — though enormous (~3,700-line community directory) — is saturated,
fragmented, and **host-bound** (requires an MCP-aware client + JSON
registration). No tool occupies the empty quadrant of *one agent-invoked
subprocess CLI, plugin-extensible, stateless-per-task, host-agnostic, owning ops
tasks end-to-end*. righthand is that tool.

## Success Criteria

Experiential:

- 🟢 *Human "it works":* "I stopped babysitting my agent on ops tasks — it hands
  them off and gets a one-line answer back."
- 🔴 *Human "it's broken":* righthand lost data, touched app code unprompted, or
  installed self-builder commands that couldn't be rolled back.
- 🤖 *LLM handoff:* the agent runs `righthand <cmd>`, receives a small schema'd
  JSON summary, and never reads a raw log or man page into its context.

Measurable (each tagged to the pain it kills):

- Cold-start of `righthand <cmd>` ≤ **200ms** (spawned-per-task perf).
- Output compression: summary ≤ **20%** of raw tool-output tokens, by default (P2/P3).
- Ops command reliability ≥ **99%** succeed with no hallucinated flags (P1).
- Self-builder first-pass success ≥ **80%** of generated commands install + pass smoke test (P4).
- Rollback safety: **100%** of changes are rollback-able; restore never fails (C-RESET).
- Context saved per ops task ≥ **5k tokens** vs doing it inline (P2/P3).

Non-functional bars (locked "never break" lines):

1. Never lose user data — every change journaled before apply; rollback always possible.
2. Never touch application source code without an explicit command.
3. Cold-start ≤ 200ms for any core command (stateless + lazy-loaded plugins).
4. Credential isolation — righthand holds its own secrets; never in stdout/logs/args.
5. Idempotent & reproducible — same command + args + env → same result (kills P5).
6. Zero-config default — installs and runs usefully with no config; degrades gracefully when optional integrations (LLM, search, CI tokens) are absent.

## Design Goals

### Primary (Must)

- Be the **universal, agent-invoked operations surface** — one subprocess CLI
  any coding agent can shell out to, with no host/registration dependency.
- **Compress, don't relay** — every command returns a bounded, schema'd summary;
  full dumps opt-in. (The agent's pain is *context*, not capability.)
- **Plugin-extensible as a first-class pillar** — a documented contract so third
  parties can add ops tasks discoverable by an LLM.
- **Self-recursive self-builder** — righthand can grow its own command surface via
  an LLM, safely (with rollback).
- **Rollback as a universal safety net** — every change is reversible.
- **Zero-config default** with graceful degradation when integrations are absent.
- Never lose data; never touch app code without an explicit command.

### Secondary (Nice to Have)

- Bun-compiled standalone binary distribution (deferred — npm JS is the default;
  Bun binaries are 58–109MB, too heavy for the default install).
- Built-in telemetry (deferred — opt-in only if ever added).
- Deep-research mode parity with the full `websearch-deep` 6-phase methodology.

## User Personas & Experience

### Personas

- **The human developer (primary)** — anyone using an AI coding agent on a
  project with real ops. Spans indie devs, professional full-stack/backend
  engineers, and DevOps/SRE-adjacent practitioners. Installs righthand, configures
  providers/credentials, and may author or install plugins. Shared core need:
  offload operational work so they and their agent stay in flow.
- **The coding LLM (runtime caller)** — the actual invoker at runtime. Discovers
  available commands via `righthand tools --json` (MCP-shaped descriptors), then
  dispatches `righthand <cmd> [args]` and consumes the returned JSON.
- **The plugin author** — a third party (often the same developer) who builds and
  publishes a righthand command/task against the documented authoring contract.

### User Experience

**Before righthand:** the agent hits a CI failure. It shells out to `gh run view
--log`, ingests a 1,000-line log dump (~10k tokens), half-remembers the right
`gh workflow run` flags, possibly gets them wrong, and either burns tokens
iterating or stops and asks the human to deploy. Its context window is now
polluted with log noise that degrades the code work it was doing.

**After righthand:** the agent runs `righthand ci status` (or `righthand ci
diagnose`), which shells out to `gh` internally, compresses the result to a
5-line JSON summary of what failed and why, and returns it. The agent never
ingests the raw log. To remediate, it runs `righthand deploy --dry-run`, reviews
the bounded output, and either proceeds or escalates with `righthand`'s clear
`NEEDS_HUMAN` signal. If the user wants a capability righthand lacks, they (or
the agent) say "righthand, build me a command that does X," the LLM generates
and smoke-tests it, the user confirms install, and it's now a permanent command
— rollable back at any time.

## Scope & Boundaries

### In Scope

- The entire capability set (C1–C10) is **v1 scope**; delivery is sequenced by
  dependency (see Phasing).
- All five ops domains (CI/CD, logs/observability, docs, tasks/issues, admin/infra).
- LLM-augmented commands, web research (shallow + deep), and the self-recursive
  self-builder.
- Rollback & factory reset as the universal safety net.
- Per-project footprint with copy-from-other-project; user-global defaults.

### Out of Scope

- Nothing is permanently out — by explicit decision ("all is allowed"). The
  safety contract is "righthand can do anything, but you can always undo it,"
  enforced by capability declarations, approval gates, and rollback.
- Deferred (not never): standalone Bun-binary distribution, telemetry, licensing/
  branding decisions.

## High-Level Capabilities

### C1 — Core Runtime & Dispatch

The foundation: righthand is a subprocess CLI, spawned per task and torn down on
completion — stateless per invocation, with cross-task state persisted to disk.
Built on **Node + TypeScript, targeting Bun while staying Node-compatible**, using
**citty** as the lightweight CLI layer. Plugin handlers are imported lazily (only
on actual invocation) to keep cold-start ≤200ms.

Every command adheres to a **bounded output contract**: a small, schema'd JSON
summary by default, with `--full`/`--raw` escalation only when explicitly
requested. This single design move attacks the documented pains of context bloat
(P2), token cost (P3), and hallucination (P1) simultaneously — the agent receives
decision-ready answers, never raw dumps. righthand also exposes its full command
surface to the agent as **MCP-shaped tool descriptors** via `righthand tools
--json`, so any LLM that knows how to consume MCP descriptors can enumerate and
invoke righthand without being taught.

### C2 — Plugin System

The extensibility pillar and righthand's defensible moat. A plugin is an npm
package that exports a **static JSON manifest fragment** (MCP-shaped: `name`,
`description`, JSON-Schema `inputSchema`, `plugin`, `handler`). Discovery merges
core + listed-plugin fragments into one in-memory list at startup — **no plugin
code is imported to enumerate**, only JSON is read — satisfying the cold-start
constraint (the oclif-manifest idea, borrowed without the framework).

Plugins register via a `plugins` array in config (or are discoverable by an
`righthand-plugin` keyword on npm — registry search only, never a startup
filesystem scan). Three tiers: **core** (bundled), **user-global**
(`~/.righthand/plugins/`), and **project-local** (`./.righthand/plugins/`,
version-controllable). The merged manifest can be cached to disk
(`~/.righthand/manifest.json`) keyed on installed-plugin versions so a no-op
enumeration is a single file read.

### C3 — Authoring & Scaffolder (`righthand new`)

The explicit, documented path to extend righthand — and the load-bearing contract
that the self-builder (C5) later generates against. `righthand new <command>`
scaffolds a starter command (file layout, manifest fragment, handler stub,
declared capabilities) and prints the authoring guide: the manifest schema,
worked examples, and the capability-declaration format.

This is foundational: a plugin-extensible tool whose "how do I write a plugin"
story is a first-class command (not a buried README) is dramatically easier to
grow an ecosystem around. The same contract C3 defines is what makes C5's
LLM-generated code reliable — the self-builder can only write correct commands
once the authoring contract is proven and stable.

### C4 — LLM-Augmented Commands

righthand holds its own LLM provider configuration (see Technical Approach) and
commands may invoke an LLM mid-task — to summarize CI failures, triage logs,
classify and dedupe issues, draft documentation, or explain an error. Provider
config is fully user-defined: `type` (`openai-compatible` | `anthropic`), user-set
`baseURL`, `apiKey` (or keychain reference), `model`, and optional params, with
commands picking a provider by name.

This capability is what separates a "wrapper that compresses" from a "wrapper
that reasons." It also introduces the cost dimension (R7): LLM-invoking commands
declare a `cost_tier` and respect per-command cost guards; expensive operations
confirm before running.

### C5 — Self-Recursive Self-Builder (leads the narrative)

The most novel and ambitious capability. With an LLM configured, a user (or the
agent) can say "righthand, I want a command that does X," and righthand's LLM
**writes a new command into righthand itself** — a real plugin file, saved to disk
(project-local or user-global, chosen at generation time), registered in the
manifest, and now a permanent first-class command. righthand grows its own
surface.

Safety is engineered in at every layer: the generated code is shown to the user
with a one-line "install? [y/N]" confirmation (Model-A, not auto-run); every
generated command must pass an **auto-generated smoke test** (a dry-run against
its declared `inputSchema`) before install is offered; generated commands run with
**capability declarations enforced** (and, for full hardening, in subprocess
isolation); and every generation is **journaled and rollback-able** (C7). C5
depends on C2 (plugin system), C3 (the authoring contract), and C4 (the LLM) — so
it is built last in the dependency sequence but leads the design narrative as
righthand's signature feature.

### C6 — Web Research (`righthand research`)

When a task needs external knowledge, righthand performs web research itself and
returns a synthesized, cited summary — instead of the main LLM burning its own
context searching. C6 follows the **web-research skill methodology**
(decompose into subtopics → parallel search → write findings → synthesize), and
the deep variant applies multi-query generation, evidence synthesis with source
ranking, and numbered citations.

C6 is **LLM-driven** (depends on C4) and rides the configured LLM's own web
features when available; there is no hard-coupled search API, so research quality
scales with the provider. A direct search-API backend can be added later as a
plugin where a provider lacks web access. This reinforces the core thesis:
righthand keeps noisy, context-heavy work out of the main LLM's window.

### C7 — Rollback & Reset

The universal safety net — especially critical given C5 writes code into
righthand. **Rollback** undoes the last change(s) righthand made (a generated
plugin install, a config edit, a state mutation): `righthand rollback` (last),
`righthand rollback --steps N`, `righthand rollback <change-id>`. **Factory
reset** wipes righthand's entire footprint back to fresh-install (always
preserving the user's application code).

Implementation borrows **git semantics**: righthand's managed footprint lives
under an internal version store, so rollback is a revert to a prior snapshot — no
custom VCS invented. Every reset supports `--dry-run` (preview before wipe) and
writes an undo manifest first so even a reset is recoverable.

### C8 — Ops Domains (five command groups)

The actual operational surface the agent calls, organized as five command groups
that wrap existing CLIs (`gh`, `kubectl`, `terraform`, `aws`, `flyctl`…) and
compress their `--json` output — universal coverage without reimplementing every
vendor API:

- `righthand ci …` — CI/CD: status, runs, logs, diagnose, deploy (dry-run gated).
- `righthand logs …` — logging/observability: tail, search, errors-recent.
- `righthand docs …` — documentation: sync, generate, lint.
- `righthand tasks …` — task/issue tracking: list, create, triage.
- `righthand admin …` — general admin/infra: env, secrets (read-only views), infra status.

Additional domains and direct-API backends arrive over time via plugins and the
self-builder.

### C9 — Lifecycle & Config

The supporting commands: `righthand` (top-level help/list), `righthand version`,
`righthand config` (layered: project `./.righthand/config.json` → user
`~/.righthand/config.json` → env vars, env wins), `righthand history` (queryable
ops/action history — addressing session inconsistency, P5), and `righthand tools
--json` (the MCP-shaped discovery surface for the LLM). Also `righthand init
[--from <other-project>]` to initialize or copy a project footprint.

### C10 — `righthand doctor`

Health and integration diagnostics: verifies LLM provider connectivity (per
configured endpoint), search/research capability availability, CI/cloud token
validity, plugin health, manifest integrity, footprint/rollback-store health, and
righthand version/freshness. Returns a bounded status report (green/yellow/red per
integration) so a user or agent can quickly see what's misconfigured before
invoking real commands.

## Spec Candidates

The following capabilities should each become their own spec document. A
spec-writer creates one spec per item. Priorities reflect build-order criticality
within the all-in-v1 scope: **Must** = foundational (blocks others), **Should** =
core v1 value, **Nice** = later in the v1 sequence.

### Spec: Core Runtime & Dispatch (C1)

- **Description**: The subprocess CLI lifecycle, lazy plugin loading, the bounded
  output contract (summary-by-default, `--full`/`--raw` escalation), the MCP-shaped
  `tools --json` discovery surface, cold-start budget enforcement, and the
  citty/Node+Bun foundation.
- **Dependencies**: none (foundational).
- **Priority**: Must.

### Spec: Plugin System (C2)

- **Description**: The plugin contract (static JSON manifest fragment, MCP-shaped
  descriptors), the three-tier model (core/user/project), manifest merge +
  on-disk caching, npm-keyword discovery, and the capability-declaration format
  every plugin must declare.
- **Dependencies**: C1.
- **Priority**: Must.

### Spec: Plugin Sandbox & Permissions (R1/R2 + Q1/Q2)

- **Description**: The security model for third-party and LLM-generated plugins:
  capability enforcement (fs/network/exec/llm-cost), Node/Bun permission flags,
  subprocess isolation for untrusted plugins, and the per-command approval model
  (`destructive` flag, `cost_tier`, approval gates, `--yes` + logged warning in
  agent mode). This is the biggest open design question and a v1 must.
- **Dependencies**: C1, C2.
- **Priority**: Must.

### Spec: Authoring & Scaffolder (C3)

- **Description**: `righthand new <command>` scaffolding, the authoring guide,
  the manifest/handler stub generator, and the canonical authoring contract that
  C5 generates against.
- **Dependencies**: C2.
- **Priority**: Must.

### Spec: Rollback & Reset (C7)

- **Description**: The journal/snapshot model (git-semantics over the managed
  footprint), `righthand rollback` / `--steps N` / `<change-id>`, factory reset,
  `--dry-run`, and the undo-manifest safety. Foundational safety that must exist
  before C5 can be trusted.
- **Dependencies**: C1.
- **Priority**: Must.

### Spec: Lifecycle & Config (C9)

- **Description**: Top-level help/list, `version`, layered `config`, `history`
  (queryable action log), `tools --json`, and `init [--from <other-project>]`
  project copy.
- **Dependencies**: C1.
- **Priority**: Must.

### Spec: LLM Provider Integration (C4)

- **Description**: The provider abstraction (OpenAI-compatible `type` with
  user-defined `baseURL`/`apiKey`/`model`/params + native Anthropic `type`),
  provider selection by name, keychain credential storage, cost-tier guards, and
  the shared LLM-invocation API commands use to reason mid-task.
- **Dependencies**: C1.
- **Priority**: Should.

### Spec: Ops Domain — CI/CD (C8.1)

- **Description**: The `righthand ci …` command group wrapping `gh` (Actions),
  with compressed status/run/logs/diagnose output and dry-run-gated deploy.
- **Dependencies**: C1, C2.
- **Priority**: Should.

### Spec: Ops Domain — Logging/Observability (C8.2)

- **Description**: The `righthand logs …` group (tail, search, errors-recent),
  wrapping observability CLIs/APIs with compressed output.
- **Dependencies**: C1, C2.
- **Priority**: Should.

### Spec: Ops Domain — Documentation (C8.3)

- **Description**: The `righthand docs …` group (sync, generate, lint), including
  LLM-assisted generation (depends C4).
- **Dependencies**: C1, C2, C4.
- **Priority**: Should.

### Spec: Ops Domain — Tasks/Issues (C8.4)

- **Description**: The `righthand tasks …` group (list, create, triage), wrapping
  issue-tracker CLIs with LLM-assisted triage (depends C4).
- **Dependencies**: C1, C2, C4.
- **Priority**: Should.

### Spec: Ops Domain — Admin/Infra (C8.5)

- **Description**: The `righthand admin …` group (env, read-only secrets views,
  infra status), wrapping cloud/infra CLIs with compressed, non-secret output.
- **Dependencies**: C1, C2.
- **Priority**: Should.

### Spec: Web Research (C6)

- **Description**: `righthand research` implementing the web-research methodology
  (shallow) and the deep variant (multi-query, source ranking, numbered
  citations), LLM-driven via C4 and riding the provider's web features; pluggable
  search-API backend as a later extension point.
- **Dependencies**: C4.
- **Priority**: Should.

### Spec: Self-Recursive Self-Builder (C5)

- **Description**: The signature capability — the LLM writes a new command into
  righthand (Model-A: persisted plugin, show-and-confirm install, project or user
  location), with mandatory smoke-test-before-install, capability enforcement,
  and full rollback integration. Includes the self-builder's own golden-set eval
  harness.
- **Dependencies**: C2, C3, C4, C7, Plugin Sandbox spec.
- **Priority**: Should (leads the narrative; built after its dependencies).

### Spec: Doctor & Health (C10)

- **Description**: `righthand doctor` integration diagnostics — provider
  connectivity, search availability, token validity, plugin/manifest/footprint
  health, version freshness — returning a bounded green/yellow/red report.
- **Dependencies**: C1, C2, C4.
- **Priority**: Nice.

## Technical Approach

**Runtime & CLI layer.** Node + TypeScript, targeting **Bun** while staying
Node-compatible (runtime-agnostic JS). **citty** is the CLI layer (stable,
zero-dep, TS-first, runs on Bun via `node:util` parseArgs). Dispatch is trivial;
no heavyweight framework. Default distribution is **npm** (lightweight, runs on
the user's existing runtime); Bun-binary compilation is a deferred nicety (Bun
binaries are 58–109MB — too heavy for the default install).

**Plugin discovery & dispatch.** Static JSON manifest fragments, MCP-shaped
descriptors, handlers imported only on invocation (lazy). Merge core + listed
fragments at startup (JSON-only), cache the merged manifest to disk. Agent
surface: `righthand tools --json` → MCP tool descriptors; `righthand <cmd> [args]`
→ dispatch. Reuses the oclif-manifest idea and MCP's descriptor shape **without
adopting either framework or transport** (no live MCP server — keeps the
stateless-subprocess decision).

**Ops integration.** Shell out to existing CLIs (`gh`, `kubectl`, `terraform`,
`aws`, `flyctl`…) as the universal backend, then compress their `--json` output.
Universal coverage, zero API reimplementation. Plugins may add direct-API
backends later.

**State & rollback.** righthand's managed footprint lives under an internal
git-semantics version store (`~/.righthand/.git` + `./.righthand/.git`); rollback
= revert to a prior snapshot. Config is JSON; manifest is JSON. No custom VCS
invented.

**Config.** Layered: project `./.righthand/config.json` → user
`~/.righthand/config.json` → env vars (env wins). Zero-config default degrades
gracefully when optional integrations are absent.

**Credentials.** OS keychain (keytar) where available → env-var fallback → never
plaintext files, never in stdout/logs/args. Redaction enforced in all output.

**LLM providers.** OpenAI-compatible base (`type: openai-compatible` with
user-defined `baseURL`, `apiKey`, `model`, params — covers OpenAI, OpenRouter,
Ollama, Groq, Together, local/vLLM, Mistral, etc.) + native Anthropic
(`type: anthropic`). Commands pick a provider by name. URL/model fully user-defined.

**Research.** LLM-driven via C4, following the web-research skill methodology;
rides the provider's web features; no hard-coupled search API; pluggable
search-API backend later.

**Security.** Per-command capability declarations (fs/network/exec/llm-cost) +
`destructive` flag + `cost_tier`; Node/Bun permission flags as baseline;
subprocess isolation for untrusted (third-party + LLM-generated) plugins;
approval gates for destructive/high-cost ops; redaction everywhere.

**Updates.** npm-based for CLI and plugins; `righthand update`; semver; plugins
version-pinned in the manifest; auto-update opt-in, never silent.

**Data flow.** Agent → `righthand <cmd> [args]` (subprocess) → righthand loads
manifest (JSON), imports only the target handler, performs ops I/O (shelling out
to CLIs and/or invoking its LLM), compresses the result to a schema'd JSON
summary, journals any state change, writes the summary to stdout, exits. State
persists in the footprint; nothing lives in the agent's context beyond the
returned summary.

## Constraints & Assumptions

- **Node + TypeScript, Bun-compatible**: hard runtime constraint. citty chosen
  over crust (alpha) for stability in a distributed product; crust documented as
  the alternative.
- **Subprocess, stateless-per-invocation**: every cross-task boundary is disk.
  No daemon, no live MCP server.
- **Wrap, don't rebuild**: ops backends are existing CLIs; righthand adds
  compression + reasoning, not vendor API reimplementation.
- **Assumption**: users have (or will install) the underlying CLIs righthand wraps
  (`gh`, `kubectl`, etc.). `righthand doctor` surfaces missing dependencies.
- **Assumption**: research quality scales with the configured provider's web
  capability; users wanting best research configure a web-capable provider or a
  search-API plugin.
- **Assumption**: the self-builder's reliability scales with the configured model;
  smoke-test-before-install is the floor regardless of model quality.

## Risks & Open Questions

### Risks

- **R1 — Self-builder generates broken/dangerous code (C5)** [Highest]:
  mitigated by show-and-confirm install, mandatory smoke-test-before-install,
  capability enforcement, and full rollback (C7).
- **R2 — Plugin supply-chain / malicious plugin** [High]: mitigated by the
  Plugin Sandbox & Permissions spec (capability model + permission flags +
  subprocess isolation for untrusted plugins).
- **R3 — Credential leakage** [High]: mitigated by keychain + redaction + the
  credential-isolation bar.
- **R4 — "Build all in v1" scope explosion** [High]: mitigated by the
  dependency-ordered Phasing and vertical-slice delivery.
- **R5 — Cold-start budget blown by plugin count** [Med]: mitigated by JSON-only
  discovery + lazy import; measure early.
- **R6 — Research quality depends on provider** [Med]: mitigated by pluggable
  search-API backend and graceful degradation.
- **R7 — LLM cost runaway** [Med]: mitigated by cost-tier guards + budgets +
  confirm-on-expensive.
- **R8 — Concurrent-agent state conflicts** [Med]: mitigated by atomic writes +
  file locking on the footprint.
- **R9 — righthand touches app code** [High]: mitigated by the hard boundary,
  capability allowlist, and bar #2.

### Open Questions

- **Telemetry**: deferred — opt-in only if ever added.
- **Licensing & branding**: deferred.
- **Canonical v1-tested providers**: OpenAI-compatible + Anthropic are the
  contract; which specific providers are validated first is an implementation
  decision (best-practice: validate against OpenAI, Anthropic, and a local
  Ollama endpoint).
- **Subprocess-isolation hardening timeline**: baseline capability+permission
  enforcement is v1 must; full subprocess isolation lands as v1 hardening —
  exact sequencing to be confirmed in the Plugin Sandbox spec.

## Phasing & Rollout

Everything below is **in scope for v1**; phases are a dependency-ordered build
sequence, not a scope cut.

### Phase 0 — Foundations (Must)

C1 Core Runtime & Dispatch, C9 Lifecycle & Config, C7 Rollback & Reset. The
subprocess lifecycle, bounded output contract, `tools --json` discovery, layered
config, and the journal/snapshot rollback store. Nothing else is safe to build
until rollback exists.

### Phase 1 — Extensibility Bedrock (Must)

C2 Plugin System, the Plugin Sandbox & Permissions spec (R1/R2), C3 Authoring &
Scaffolder. The contract, the discovery model, and the security model. This is
the foundation C5 generates against.

### Phase 2 — Reasoning (Should)

C4 LLM Provider Integration. The provider abstraction, keychain credentials,
cost guards, and the shared LLM-invocation API. Unlocks C5, C6, and the
LLM-assisted ops domains.

### Phase 3 — Core Ops Value (Should)

The five ops domains (C8.1–C8.5) and C10 Doctor. The operational surface that
proves righthand's value end-to-end, plus health diagnostics.

### Phase 4 — Research (Should)

C6 Web Research. Shallow + deep modes, LLM-driven, riding provider web features.

### Phase 5 — The Signature Capability (Should, leads narrative)

C5 Self-Recursive Self-Builder — built last (it depends on C2/C3/C4/C7 + the
sandbox), but it is the feature the PRD and any launch narrative leads with.

### Rollout Plan

- Distribute via **npm** (`npx righthand`, `npm i -g righthand`); standalone
  Bun-binary as a later opt-in.
- Zero-config first run: `righthand doctor` guides setup; commands degrade
  gracefully without optional integrations.
- `righthand new` + the authoring guide seed the plugin ecosystem from day one.
- No feature flags needed (single install); versioning via semver; plugin
  version-pinning in the manifest; `righthand update` opt-in auto-update.
- Companion material at launch: the authoring guide, a starter plugin, and a
  curated set of "build me a command that does X" examples demonstrating C5.

---

### Evidence base

This PRD is grounded in `research_righthand_problem/` (problem/motivation,
competitive landscape, plugin-model recommendation), with full citations in
`findings_1_failure_modes.md`, `findings_2_landscape.md`,
`findings_3_plugin_models.md`, and the synthesis `research_report.md`.
