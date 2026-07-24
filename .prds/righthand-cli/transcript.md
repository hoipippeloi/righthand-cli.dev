# PRD Interview Transcript — righthand

Conducted via the `new-prd-interview` skill. Protocol: Phase 1 opening → Phase 2
discovery (one question at a time, 8 topics) → Phase 3 spec candidates → Phase 4
PRD. Captured verbatim where the user's wording matters; summarized otherwise.

---

## Phase 1 — Opening

**Q1 — What is the initiative?**
User: a CLI ("righthand") that is always available to the main/coding LLM, to
hand off admin / CI-CD / logging / documentation / tasks — all tasks that don't
involve the actual building of an app. The LLM sends commands to this CLI and
the CLI takes care of the task.

**Q1 follow-up (invocation model):** the LLM sends commands via terminal on a
subprocess; it's spawned per task and de-spawned once finished. → **subprocess,
stateless per invocation, no daemon.**

**Q2 — What project/product?** Standalone, its own repo, distributable to others
who want to use it.

**Q3 — Tech stack?** Node; wants it fast; easily extensible/modular so others can
build tasks/commands into it. (Distribution, config pattern, similar tools left
open.)

---

## Phase 2 — Discovery

### Topic 1 — Problem & Motivation

**Q4 — What problem, who feels it?** User: "i want righthand to be the assistant
to any main window llm, the llm always knows that the right hand exists and can
use it depending on its context or workflow step/task/assignment."

**Q4b — concrete pain (follow-up):** User directed research: "use webresearch to
find out." → web-research skill executed: 3 parallel subagents wrote findings to
`research_righthand_problem/findings_{1,2,3}_*.md`, synthesized to
`research_report.md`. Result: 5 documented failure modes (hallucinated commands,
context bloat, token cost, flow interruption, session inconsistency) + the empty
quadrant righthand fills. **User confirmed: "lets continue this is good."**

### Topic 2 — Users & Personas

**Q5 — Primary users?** User: "all are important." Plus two new pillars added:
(4) righthand can use an LLM when tasks/commands require one; (5) a self-recursive
agent — users can tell the righthand LLM what features they want and the LLM
builds them into righthand cli.

**Q5b — self-recursive model (A/B/C)?** User: **Model A** — persistent plugin
generation (LLM writes real code → saves → registers → permanent command).

**Q5c — approval + location:**
- Q5c-1: **(ii)** show generated code + one-line "install? [y/N]" before registering.
- Q5c-2: **(iii)** both project-local and user-global, user picks at generation time.

### Topic 3 — Scope & Boundaries

**Q6 — MVP cut.** User instead added capabilities:
- New capability: the CLI can do research / search the web when needed (pointed
  to `E:\skills.te9.dev\web-research` and `C:\Users\PTW\.pi\agent\skills\websearch-deep`).
  → recorded as **C6 Web Research** (shallow + deep methodologies).
- New capability: a task that explicitly states/defines/shows how to create new
  tasks/commands to righthand. → recorded as **C3 Authoring & Scaffolder**.

**Q6 (re-asked with proposed cut):**
1. **"build all"** — entire vision is v1 scope; nothing out; delivery sequenced
   by dependency.
2. **"what do you mean?"** — proof-domain question re-explained; moot under
   "build all" (all 5 domains + research in v1).
3. **"all is allowed, but a user should be able to reset to factory defaults and
   codebase."** → recorded as **C7 Reset & Rollback**.

**Clarification on "reset codebase":** User: "i mean rollback from the last
changes." → C7 refined to **Rollback (primary, undo last N changes) + Factory
reset (extreme)**, implemented via git-semantics over the managed footprint,
with `--dry-run` + undo manifest.

### Topic 4 — Success Criteria

**Q7.** User: "you decide." → Locked opinionated set mapping 1:1 to the 5 pains,
plus 6 non-functional bars (never lose data; never touch app code without
explicit command; cold-start ≤200ms; credential isolation; idempotent; zero-config
default).

### Topic 5 — High-Level Capabilities

Proposed consolidated map C1–C9. User:
1. **Add `righthand doctor`** → recorded as **C10**.
2. "its okay" → C8 confirmed as five command groups.
3. "lets go" → **C5 self-builder leads the PRD narrative.**

### Topic 6 — Technical Approach

**Q (CLI framework):** User: "use citty or https://crustjs.com/ whichever is
better." → Researched both; **recommended citty** (stable for a distributed
product; framework-independent plugin system; satisfies "must support Bun";
lighter distribution). **User: "citty is okay."** → locked.

**Q (search backend):** User: "this uses the llms features if available with the
skills in E:\skills.te9.dev\web-research" → C6 revised to **LLM-driven**, riding
the configured LLM's web features, following web-research methodology; no hard
search API.

**Q (ops backend):** User: "yes" → wrap existing CLIs + compress output. Locked.

**Q (runtime):** User: "must support bun" → target Bun, stay Node-compatible;
npm distribution default; Bun-binary deferred.

### Topic 7 — Risks & Open Questions

Proposed risk register R1–R9 + open questions. User answered the open questions:
1. **Plugin sandbox model:** "you decide."
2. **Permissions/approval model:** "you decide."
3. **Telemetry:** "can be done later maybe."
4. **Update mechanism:** "use best practices."
5. **Self-builder eval harness:** "use best practices."
6. **Multi-project/monorepo:** "per project, but can copy from other projects."
7. **Canonical v1 LLM providers:** "use best practices, we need to be able to
   define url endpoints, models etc."
8. **Licensing & branding:** "no" (deferred).

Locked opinionated decisions for 1 & 2 (plugin sandbox = v1 must: capability
declarations + permission flags + subprocess isolation for untrusted plugins;
permissions = per-command capabilities + destructive flag + cost_tier + approval
gates). R1/R2 (plugin sandbox) confirmed as v1 must.

---

## Phase 3 — Spec Candidate Identification

Spec candidates proposed (one per capability, priorities by build-order
criticality within the all-in-v1 scope): C1 Core Runtime, C2 Plugin System,
Plugin Sandbox & Permissions (R1/R2), C3 Authoring, C7 Rollback, C9 Lifecycle,
C4 LLM Providers, C8.1–C8.5 Ops Domains, C6 Research, C5 Self-Builder, C10
Doctor. Full list with descriptions/dependencies/priorities in the PRD.

## Phase 4 — PRD Generation

PRD written to `.prds/righthand-cli/prd.md`. This transcript to
`.prds/righthand-cli/transcript.md`.

## Phase 5 — Confirmation

Pending user review of the PRD.
