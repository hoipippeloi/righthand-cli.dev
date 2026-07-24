# Findings 1 — Failure Modes When AI Coding Agents Do Ops Work

> Sub-topic 1 of the `righthand` problem-statement research. Scope: concrete
> developer complaints about Claude Code, Cursor, Copilot/Codex, Aider, Devin,
> etc. attempting **non-coding / operational** work — CI/CD, deployments,
> reading logs, updating docs, filing issues — plus the cross-cutting failure
> modes (hallucinated commands, context bloat, token cost, flow interruption,
> session inconsistency).

## Summary

The evidence is consistent across vendor docs, engineering blogs, and developer
forums (HN, Reddit): today's coding agents are tuned for *writing code inside a
repo*, and they degrade sharply the moment an "ops" step enters the loop. Five
failure modes recur, and they reinforce each other:

1. **Hallucinated commands / API calls / library details** — the agent invents
   CLI flags, fabricates library APIs, or "guesses" a stack that isn't there.
2. **Context-window bloat** — to do one quick ops task the agent must read CI
   configs, log dumps, and API docs into the same window where it's editing
   code, degrading reasoning ("context rot").
3. **Token cost / wasted effort** — that same bloat is billed; a single session
   burns "tens of thousands of tokens."
4. **Flow interruption** — the agent hits a credential, permission, or
   "unknown infrastructure" boundary and stops to ask the human to do it
   manually.
5. **Inconsistency across sessions** — every agent (and every project) keeps a
   separate, siloed history, so the same ops answer solved yesterday is
   unrecoverable today.

Notably, even **Anthropic's own Claude Code best-practices guide** is organized
around the admission that the context window is the limiting factor, and the
existence of entire tools built *only* to (a) intercept agents' destructive
shell commands (Kintsugi) and (b) search across a dozen agents' scattered
session histories (Cass) are market-level confirmation that these are real,
felt pain points.

---

## Pain points, with quotes and sources

### 1. Hallucinated / wrong CLI commands, API calls, and library details

Agents confidently invent commands, flags, and library APIs — harmless inside a
sandboxed code edit, dangerous when the command actually runs.

- **A library detail, fabricated from a bad forum post (Claude Code).** HN user
  `softwaredoug`:

  > "Search and reasoning use up more context, leading to context rot, and
  > subtler harder to detect hallucinations… I've had this happen in Claude code
  > for example where it hallucinated a few details about a library based on
  > what [a] badly written forum post."

  — u/softwaredoug, HN comment, 2025-09-21.
  https://news.ycombinator.com/item?id=45322243

- **Hallucinated documentation, as a known trait of Claude Code.** HN user
  `CGamesPlay`:

  > "Given Anthropic's existing track record of producing terrible hallucinated
  > inaccurate documentation in Claude Code, I'm very curious how Bun will
  > handle this…"

  — u/CGamesPlay, HN comment, 2026-05-15.
  https://news.ycombinator.com/item?id=48144722

- **Hallucinated stack → wrong schema generated (Cursor).** HN user
  `brandonchen`:

  > "Cursor completely hallucinated Prisma as part of our tech stack and created
  > a whole new schema for us, whereas Codebuff knew we were already hooked up
  > to Drizzle and just modified our existing schema."

  — u/brandonchen, HN comment, 2024-11-07.
  https://news.ycombinator.com/item?id=42080518

- **Hallucinated runtime behavior.** HN user `callamdelaney`:

  > "Just yesterday Claude code hallucinated itself an infinite loop."

  — u/callamdelaney, HN comment, 2026-04-07.
  https://news.ycombinator.com/item?id=47680423

- **Hallucinated shell paths, no undo (the ops-danger case).** The author of
  Kintsugi — a tool whose entire reason to exist is intercepting agents' shell
  commands — frames the failure mode directly:

  > "AI coding agents now run real shell commands on your machine… The one time
  > it isn't [fine] (a hallucinated path, a prompt-injected instruction, a
  > confident wrong guess) there's no undo and you find out after."

  — `arr0wassass1n`, Show HN: Kintsugi, 2026-06-16.
  https://news.ycombinator.com/item?id=48558325 · repo:
  https://github.com/arrowassassin/kintsugi

### 2. Context-window bloat from CI configs, log dumps, and API docs

The agent and the *ops context* share one window; ops artifacts (long logs, big
CI YAMLs, API reference pages) crowd out the code reasoning.

- **The vendor admits the window is the constraint (Anthropic).** From Claude
  Code's own best-practices guide:

  > "Most best practices are based on one constraint: Claude's context window
  > fills up fast, and performance degrades as it fills."
  >
  > "Claude's context window holds your entire conversation, including every
  > message, every file Claude reads, and **every command output**."

  — Anthropic Engineering, "Best practices for Claude Code."
  https://www.anthropic.com/engineering/claude-code-best-practices

- **"Context rot" causes *subtler* hallucinations.** `softwaredoug` again (same
  thread as above): search and reasoning "use up more context, leading to
  context rot, and subtler harder to detect hallucinations."
  https://news.ycombinator.com/item?id=45322243

- **Quantified: a 1,000-line paste = 10k+ tokens.** From a community cost guide:

  > "When you paste a 1,000-line codebase into your session, you're adding
  > 10,000+ tokens to your context window."

  — claudecodeguides.com, "Why Claude Code Context Window Cost (2026)."
  https://claudecodeguides.com/why-is-claude-code-expensive-large-context-tokens/

- **Community signal (Reddit):** an r/ClaudeAI thread literally titled
  "Claude context window" collects user complaints about the window filling and
  the model losing the thread. (Full text not fetched — Reddit blocks
  unauthenticated `.json`; cited as a discoverable community thread.)
  https://www.reddit.com/r/ClaudeAI/comments/1dcl3lg/claude_context_window/

### 3. Token cost / wasted effort

The bloat is billed, and "exploration" to find an ops answer is expensive.

- **A single session can be tens of thousands of tokens (Anthropic).**

  > "A single debugging session or codebase exploration might generate and
  > consume tens of thousands of tokens."

  — Anthropic Engineering, "Best practices for Claude Code."
  https://www.anthropic.com/engineering/claude-code-best-practices

- **"It's reading your entire codebase every time."** Community cost guide:

  > "Claude Code is expensive because it's reading your entire codebase every
  > time." … "If you've used Claude Code for substantial projects, you've likely
  > noticed that costs can add up quickly."

  — claudecodeguides.com.
  https://claudecodeguides.com/why-is-claude-code-expensive-large-context-tokens/

- **More context = more tokens, explicitly traded off.** `brandonchen` again:
  agents that pull in more context (to avoid the Prisma-style hallucination) "do
  use more tokens to do this."
  https://news.ycombinator.com/item?id=42080518

### 4. Flow interruption — the agent stops and asks the human to do it manually

When an ops step needs a credential, a permission, or touches "unknown
infrastructure," the agent can't proceed and bounces the work back to the human.

- **The vendor names the interruption points (Anthropic).** Claude Code's guide
  discusses reducing "interruptions," and the risk model that triggers them is
  explicitly *ops-flavored*:

  > "There are three ways to reduce these interruptions: Auto mode… blocks only
  > what looks risky: **scope escalation, unknown infrastructure**, or
  > hostile-content-driven actions."

  — Anthropic Engineering, "Best practices for Claude Code."
  https://www.anthropic.com/engineering/claude-code-best-practices

- **Manual context surgery is the prescribed workflow.** The official guidance
  for ops-adjacent resets is a human-run slash command:

  > "/clear: reset context between unrelated tasks." … "Manage context
  > aggressively. Run /clear between unrelated tasks to reset context."

  Anthropic Engineering, "Best practices for Claude Code."
  https://www.anthropic.com/engineering/claude-code-best-practices

  In other words, the supported pattern is *the human interrupts to manage the
  agent's state*, not the agent self-managing ops context — so every ops
  detour is a human-in-the-loop break.

- **Background signal:** the entire Kintsugi / Cass tool category (below) exists
  because the agent *cannot* safely or statefully do these steps itself — so
  humans build external scaffolding to guard or recover around it.

### 5. Inconsistency across sessions (and across agents)

Each agent, and each project, keeps a separate history — so "I solved this ops
problem yesterday" is unrecoverable, and behavior is not reproducible.

- **A whole tool exists only to re-unify scattered agent histories (Cass).**
  From the README of `coding_agent_session_search` (indexes Claude Code, Codex,
  Cursor, Copilot, Aider, Gemini CLI, Cline, etc. into one searchable store):

  > "AI coding agents are transforming how we write software. Claude Code,
  > Codex, Cursor, Copilot, Aider, Pi-Agent; each creates a trail of
  > conversations, debugging sessions, and problem-solving attempts."

  Its headline use case concedes the loss directly:

  > "Individual developers: Find that solution you know you've seen before."

  — `eigenvalue`, Show HN: Coding Agent Session Search (Cass), 2025-12-03.
  https://news.ycombinator.com/item?id=46130481 · repo:
  https://github.com/Dicklesworthstone/coding_agent_session_search

- **Design tell — agents need a machine-readable door into that history.** Cass
  ships an explicit agent-invocation mode:

  > "⚠️ Never run bare `cass` in an agent context — it launches the interactive
  > TUI. Always use `--robot` or `--json`." … "`cass triage --json` … From zero
  > context…"

  Same source. This is direct, shipped evidence that a companion tool must
  expose a stable **subprocess/JSON surface for an LLM to call** — exactly the
  shape `righthand` proposes.

---

## Implications for a companion ops CLI ("righthand")

Mapping each failure mode to a concrete design pillar:

- **P1 hallucinated commands → make the CLI the source of truth, not the LLM's
  memory.** The agent should *invoke* a known, versioned command surface (e.g.
  `righthand ci status`, `righthand deploy --dry-run`, `righthand logs tail`)
  rather than invent `gh`/`kubectl`/`terraform` incantations from training
  data. Stable subcommands + a `--help` the agent can read = fewer
  hallucinated flags. (Contrast: Kintsugi's premise is that agents *will* emit
  dangerous wrong commands and need an external guard; righthand reduces the
  surface that can be guessed wrong in the first place.)

- **P2 context bloat → do the ops work *outside* the coding window.** righthand
  should accept a task, do the noisy ops I/O (fetching logs, reading CI YAML,
  paginating API results) in its own process, and return a *compressed,
  structured* summary (JSON) to the agent. The "10k-token log dump" never
  enters the coding context window; only the answer does. This is the single
  highest-leverage design move — it attacks P2, P3, and (partly) P1
  simultaneously.

- **P3 token cost → bounded, declared output.** Every righthand subcommand
  should return a small, schema'd payload by default (status, counts, last-N
  errors), with explicit `--full` / `--raw` escalation only when the agent
  asks. Summary-first output is the cheap path; full dumps are opt-in.

- **P4 flow interruption → carry credentials and state, not the LLM.** The CLI
  (not the agent) should hold CI/CD, cloud, and issue-tracker credentials and
  emit a clear `NEEDS_HUMAN: <reason>` only for genuinely irreversible actions.
  This collapses many "agent stops and asks the human to run `gh workflow
  run`" interruptions into a single successful subprocess call — exactly the
  "unknown-infrastructure" interruption class Anthropic flags.

- **P5 session inconsistency → make righthand *stateless and idempotent* by
  design, and *log everything it did*.** Two complementary moves: (a) because
  each invocation is a fresh subprocess with no in-window state, behavior is
  reproducible across sessions and agents (no "it worked last time" drift);
  (b) righthand should append a structured log of every ops action it took, so
  the same "what did I do about this deploy" question Cass solves for *chat*
  history, righthand solves for *ops* history. Consider an explicit
  `righthand history`/`righthand what-i-did` that any agent can query
  (mirroring Cass's `--json`/`--robot` pattern).

- **Cross-cutting: ship a first-class machine interface.** Cass's
  `--robot`/`--json`/`triage` mode is the template — every righthand command
  must be callable as a stateless subprocess returning parseable JSON, with a
  discoverable command tree the LLM can enumerate. This is what makes righthand
  a true "right hand" rather than another tool the agent has to be taught.

---

## Method & limitations

- **Tooling note:** this session did **not** have the `websearch` / `web_search`
  / `fetch_url` MCP tools that the web-research skills assume. Discovery and
  fetch were performed with `curl`: the **HN Algolia API** (`/api/v1/search`
  and `/api/v1/items/{id}`, which returns full comment/post text as JSON) and
  **DuckDuckGo HTML** for blog/vendor URLs. All quotes above are verbatim from
  fetched content except the Reddit thread, which is cited by URL only.
- **Source mix:** 1 vendor/authoritative doc (Anthropic), 1 community cost
  guide, 6 verbatim HN comments/stories (2024–2026), 1 Reddit thread (URL
  only).
- **Gap:** I could not land a single crisp, first-person quote for a *specific*
  CI/deploy-config mistake (e.g. "the agent rewrote my GitHub Actions YAML and
  broke the pipeline"). The closest ops-execution evidence is the Kintsugi
  framing (hallucinated shell paths in real execution) and Anthropic's
  "unknown infrastructure" interruption class. Recommend a targeted follow-up
  on r/cursor, r/ChatGPTCoding, and the Cognition/Devin postmortem literature
  (e.g. third-party "I tested Devin" write-ups) to close this.
- **Budget used:** ~6 HN Algolia queries + ~4 DuckDuckGo queries; ~7 URLs
  fetched.
