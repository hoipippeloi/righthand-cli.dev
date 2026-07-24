# Research Report — Grounding the "righthand" Problem Statement

Synthesis of three findings files in `research_righthand_problem/`. Purpose:
establish, with cited evidence, *what problem righthand solves and why now*, and
surface the competitive landscape + plugin-design implications that constrain the
PRD. Feeds directly into the PRD Problem Statement, Scope, and Technical Approach.

---

## 1. The problem, with evidence (feeds PRD §Problem Statement)

Coding agents (Claude Code, Cursor, Copilot/Codex, Aider, Devin, pi) are tuned
for **writing code inside a repo**. They degrade sharply the moment an
**operational** step enters the loop — CI/CD, deploys, logs, docs, issues, infra.
Five reinforcing failure modes recur across vendor docs, blogs, and forums:

| # | Failure mode | Strongest evidence |
|---|---|---|
| **P1** | **Hallucinated commands / flags / APIs** — agent invents `gh`/`kubectl`/`terraform` incantations or fabricates library details; dangerous because the command *runs*. | Anthropic-tracked "terrible hallucinated documentation in Claude Code" (HN `CGamesPlay`); Kintsugi exists *only* to intercept agents' shell commands — "a hallucinated path… there's no undo" (HN Show HN, 2026-06). |
| **P2** | **Context-window bloat** — to do one ops task the agent drags CI YAML, log dumps, API docs into the same window it edits code in → "context rot", subtler hallucinations. | Anthropic's own best-practices guide is organized around "Claude's context window fills up fast, and performance degrades as it fills" — "every command output" counts against it. |
| **P3** | **Token cost** — that bloat is billed; "a single debugging session or codebase exploration might generate and consume tens of thousands of tokens" (Anthropic). | Same Anthropic guide; community cost guide: a 1,000-line paste ≈ 10k+ tokens. |
| **P4** | **Flow interruption** — ops steps touch credentials / "unknown infrastructure"; the agent stops and bounces it to the human. Anthropic flags "unknown infrastructure" as a literal risk class. | Anthropic guide: Auto mode "blocks only what looks risky: scope escalation, **unknown infrastructure**…" — and the supported workaround is a human-run `/clear`. |
| **P5** | **Session/agent inconsistency** — every agent + every project keeps a siloed history; "the solution I found yesterday" is unrecoverable. | `coding_agent_session_search` (Cass) exists *solely* to re-unify scattered histories across Claude Code/Codex/Cursor/etc. — "Find that solution you know you've seen before." |

**One-line problem statement:**
> Today, when a coding agent needs to do anything that isn't editing code, it
> either fumbles it (P1), pays for it in context and tokens (P2/P3), interrupts
> the human to do it (P4), or loses the answer next session (P5) — because there
> is no dedicated, reliable surface the agent can *hand the whole ops task to*
> and get back a compressed, decision-ready result.

---

## 2. Why a "subprocess CLI" is structurally right (feeds PRD §Technical Approach)

Three integration models exist today (MCP server / subprocess CLI / wrapped REST).
The **subprocess-CLI model is the only one that reaches every coding agent** —
Claude Code, Cursor, Copilot, Aider, Gemini CLI, pi all expose a generic
shell tool, with no host registration and no JSON config. That is righthand's
structural advantage: **one install works for any agent.**

Trade to protect: *don't become another MCP server.* The MCP market is saturated
(~3,700-line awesome-list, dozens of single-purpose servers, a whole sub-genre of
"meta-MCP gateways" to paper over the fragmentation). righthand's universal
subprocess angle is the differentiator.

---

## 3. Competitive landscape: the empty quadrant (feeds PRD §Scope & Differentiation)

- **MCP servers per ops surface**: GitHub (official), GitLab-CI, Buildkite,
  CircleCI, Jenkins, TeamCity, Grafana (official, with explicit context-window-
  management tools), Sentry, Datadog, Terraform (multiple, with two-step
  confirmation + audit log), Pulumi, ~6 Kubernetes servers, Docker (156 tools),
  Cloudflare, LocalStack, Jira, saga-mcp, deploy-status aggregators across
  Vercel/Render/Railway/Fly.io. **Saturated and host-bound.**
- **CLIs agents drive in bash loops**: `gh --json`, `kubectl -o json`,
  `terraform -json`, `aws --output json` — universal but **context-expensive**
  (man pages, flag discovery, paged output, verbose errors all enter the window).
- **"Sidekick / handoff" patterns**: thin. `sage` (compressed shell output),
  `DesktopCommanderMCP`, `ollama-handoff`, `agy-bridge`, `llm-bus`, `a2cr`,
  `statelessagent` — each narrow or host-bound.
- **The empty quadrant righthand owns**: *one agent-invoked subprocess CLI that
  is plugin-extensible, stateless-per-task + on-disk continuity, owns ops tasks
  end-to-end, host-agnostic, and zero-config-first.* **Nothing occupies it today.**

**Strategic watch-outs the research surfaced:**
1. *Compress, don't relay.* The agent's pain is context, not capability. Every
   command returns a bounded, schema'd summary by default; full dumps are opt-in.
   (Precedent: Grafana MCP's context-management tools, sage's compression.)
2. *Steal the safety patterns ops MCP servers already converged on:* two-step
   confirmation gates, dry-run, audit logging. Table stakes for destructive ops.
3. *The plugin contract is the moat.* Making it trivial for third parties to add
   "an ops task righthand can own" is the single most defensible differentiator
   (it directly fills the unfilled gap and compounds).

---

## 4. Plugin / extensibility design recommendation (feeds PRD §Technical Approach + Spec Candidates)

Recommended model — **"oclif manifest for discovery + MCP descriptors for the LLM
surface + clipanion-style explicit dispatch, minus the frameworks."**

- **Plugin = npm package exporting a static JSON manifest fragment** (MCP-shaped:
  `name`, `description`, JSON-Schema `inputSchema`, `plugin`, `handler`). No code
  runs to enumerate.
- **Discovery = JSON-only at startup.** righthand merges core + listed-plugin
  fragments into one in-memory list; **no plugin module is imported to enumerate**
  → satisfies the cold-start / lazy-load constraint. Cache merged manifest to disk.
- **LLM-facing surface:** `righthand tools --json` emits the merged list as MCP
  tool descriptors (the LLM already knows how to consume this); handlers are
  imported only on actual invocation (`righthand <cmd> [args]`).
- **Rejected alternatives:** full oclif (too heavy / too opinionated), Nx
  infer-tasks/generators (wrong abstraction — build orchestration, not discrete
  ops tasks; fights cold-start), running a live MCP server (contradicts the
  stateless-subprocess decision — borrow MCP's *descriptor shape*, not its transport).
- **Simplest v1:** ship core commands + `righthand tools --json` first; add the
  third-party plugin-list merge as the *first* extensibility feature once the
  descriptor/dispatch contract is proven. **The descriptor contract is the
  load-bearing decision; everything else is additive.**

Precedent worth mirroring for ops history (P5): Cass's `--robot` / `--json` /
`triage` agent-invocation mode is the template — ship a `righthand history`
that any agent can query, so "what did I do about this deploy" is recoverable.

---

## Sources (key)

- Anthropic — "Best practices for Claude Code": https://www.anthropic.com/engineering/claude-code-best-practices
- Kintsugi (Show HN, 2026-06): https://news.ycombinator.com/item?id=48558325
- Cass / coding_agent_session_search (Show HN, 2025-12): https://news.ycombinator.com/item?id=46130481
- HN thread on context rot / hallucination: https://news.ycombinator.com/item?id=45322243
- claudecodeguides.com context-cost guide: https://claudecodeguides.com/why-is-claude-code-expensive-large-context-tokens/
- awesome-mcp-servers: https://github.com/punkpeye/awesome-mcp-servers
- Official MCP servers repo: https://github.com/modelcontextprotocol/servers
- GitHub MCP (official): https://github.com/github/github-mcp-server
- Grafana MCP (official): https://github.com/grafana/mcp-grafana
- MCP Tools spec (2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- oclif manifest: https://github.com/oclif/oclif/blob/main/docs/manifest.md
- clipanion: https://github.com/yarnpkg/clipanion
- sage (compressed shell for agents): referenced via awesome-mcp-servers

Full per-topic detail + all citations: `findings_1_failure_modes.md`,
`findings_2_landscape.md`, `findings_3_plugin_models.md`.
