# Findings 2 — Existing Tooling & Landscape for Agent → Ops Delegation

> Subtopic 2 of the `righthand` research plan: *Existing tooling & landscape for LLM → ops delegation.*
> Covers MCP servers (CI/CD, SCM, observability, cloud/infra, PM), CLIs agents drive in
> bash loops, "sidekick / handoff / companion" patterns, and the gaps that remain.
>
> Research method: direct fetch of authoritative sources (no `websearch`/`fetch_url` tooling
> was available, so curl was used against known URLs). Sources listed at the end.

---

## TL;DR

1. **The MCP ecosystem is enormous and fragmented.** The community awesome-list catalogs
   **~3,700+ lines of MCP servers across ~60 categories** [awesome-mcp-servers], and the
   official reference repo + registry are the canonical sources [mcp-official].
   For **every** ops surface (GitHub, GitLab, Datadog, Grafana, Sentry, k8s, Terraform,
   Buildkite, CircleCI, Jenkins, Vercel-class hosts, Jira/Linear) there are *multiple*
   single-purpose MCP servers.

2. **There is no single, unified, agent-invoked ops surface.** The landscape splits cleanly
   into two camps: (a) **one MCP server per tool** — N processes, N auths, N host configs,
   agent still orchestrates; or (b) **raw CLIs the agent drives itself** (`gh`, `kubectl`,
   `terraform`) — universal but context-expensive.

3. **"Sidekick / handoff / companion" patterns exist but are narrow or host-bound.** A handful
   of delegation MCP servers (ollama-handoff, agy-bridge, llm-bus, a2cr) and a few CLI
   wrappers (sage) hint at the idea, but none is a **standalone, distributable, plugin-extensible
   ops CLI that any coding agent shells out to** — the exact quadrant `righthand` targets.

4. **The clean gaps** are: (i) one entrypoint for *all* ops, (ii) "own this task to completion"
   semantics, (iii) stateless-per-task + on-disk continuity, (iv) zero-config / works-in-any-repo,
   (v) a plugin-author contract designed for LLM-invoked ops, (vi) cross-vendor workflow wiring.

---

## The three integration models (taxonomy)

Before naming tools, the three ways a coding agent talks to ops tooling today:

| Model | How the agent calls it | Lifecycle | Auth / config | Reach |
|-------|------------------------|-----------|---------------|-------|
| **MCP server** | JSON-RPC over stdio/HTTP, registered in host config (Claude Desktop/Cursor JSON) | Long-lived daemon (usually) | Per-server env tokens, declared in host | Only MCP-aware hosts |
| **Subprocess CLI** | Agent's `bash`/`shell` tool runs `<cli> ...`, reads stdout/exit code | Spawned per command (stateless) | Shell env / rc files / `--profile` | **Any** agent with a shell tool |
| **REST API** (wrapped or direct) | Agent emits `curl` or an MCP/OpenAPI wrapper calls it | Stateless request | Bearer tokens / OAuth | Any |

Key implication for `righthand`: the **subprocess-CLI** model is the only one that reaches
*every* coding agent (Claude Code, Cursor, Copilot/Codex, Aider, pi, Gemini CLI) without host
support or JSON registration, because all of them already expose a generic shell tool. This is
the structural reason a "right-hand" CLI is more universally installable than yet another MCP
server.

---

## 1. MCP servers — the dominant model, organized by ops domain

### 1a. CI/CD

| Server | What it exposes | Notes |
|--------|-----------------|-------|
| **github/github-mcp-server** [gh-mcp] | Repos, issues, PRs, **Actions workflow runs**, build-failure analysis, releases, Dependabot | Official; hosted remote MCP at `api.githubcopilot.com/mcp` + local Go binary; install guides for Claude Code, Codex, Cursor, Windsurf, Copilot CLI |
| **mshegolev/gitlab-ci-mcp** [awesome-mcp-servers] | Pipelines, jobs, schedules, MRs, files | Any GitLab (SaaS or self-hosted); on PyPI + MCP Registry |
| **CircleCI-Public/mcp-server-circleci** | Build failures, pipeline state | Official CircleCI |
| **buildkite/buildkite-mcp-server** | Create pipelines, diagnose/fix failures, trigger builds, job queues | Official Buildkite |
| **avisangle/jenkins-mcp-server** | Jobs, build status, artifacts, queue; 21 tools; CSRF + 2FA | Community |
| **Daghis/teamcity-mcp** | 87 tools, builds/tests/agents, dual dev/full mode | Community, JetBrains TeamCity |
| **imatza-rh/mcp-zuul** | Build-failure analysis, log search, pipeline status | Zuul CI |
| **GeiserX/spinnaker-mcp** | Applications, pipelines, executions via Gate API | Spinnaker |
| **theonedev/tod** | CI/CD pipeline editing, issue workflow, PR review | OneDev |
| **Tiberriver256/mcp-server-azure-devops** | Repos, work items, pipelines | Azure DevOps |

### 1b. Source-control / SCM

| Server | Notes |
|--------|-------|
| **github/github-mcp-server** [gh-mcp] | Official; superset of the archived `modelcontextprotocol/server-github` |
| **jmrplens/gitlab-mr-mcp** | 1,006 tools across 162 domains; read-only + safe modes |
| **modelcontextprotocol/server-git** [mcp-official] | Official *reference* server for local git read/search |
| **daniloneto/bitbucket-mcp**, **gitea/gitea-mcp**, **raohwork/forgejo-mcp** | Other forges |
| **HasanJahidul/git-insight-mcp** | Semantic git (blame-by-author, introducing-PR, branch hygiene) |

### 1c. Observability

| Server | Notes |
|--------|-------|
| **grafana/mcp-grafana** [grafana-mcp] | Official; dashboards (search/summary/patch — explicit **context-window management** tools), Prometheus/Loki/CloudWatch/ClickHouse/Elasticsearch/Snowflake/Athena datasource queries, incident investigation |
| **getsentry/sentry-mcp** | Official; error tracking + perf monitoring |
| **TANTIOPE/datadog-mcp-server**, **us-all/datadog-mcp-server** (168 tools) | Datadog metrics/monitors/logs/APM/RUM/incidents; token-efficient sampling |
| **dynatrace-oss/dynatrace-mcp** | Official Dynatrace |
| **pydantic/logfire-mcp** | Official; OpenTelemetry traces/metrics |
| **incu6us/loki-mcp-server**, **yshngg/pmcp** (Prometheus), **VictoriaMetrics-Community/mcp-victoriametrics** (official), **netdata/netdata** (official), **mpeirone/zabbix-mcp-server** | Metrics/logs stacks |
| **Oluwatunmise-olat/mcp-server-logs-sieve** | One server across GCP Cloud Logging, AWS CloudWatch, Azure Log Analytics, Grafana Loki, Elasticsearch |
| **last9/last9-mcp-server** | Bring live prod context (logs/metrics/traces) into local env to auto-fix |
| Multiple **langfuse-mcp** variants | LLM-app observability (traces, sessions, scores, prompts) |

### 1d. Cloud / infrastructure / deploy

| Server | Notes |
|--------|-------|
| **nwiizo/tfmcp**, **RajeevSirohi/mcp-server-terraform** | Terraform plan/apply/destroy; Rajeev's adds **two-step confirmation gates**, cost/drift analysis, audit logging |
| **pulumi/mcp-server** | Official Pulumi (Automation API + Cloud API) |
| **Flux159/mcp-server-kubernetes**, **strowk/mcp-k8s-go**, **manusa/kubernetes-mcp-server**, **rohitg00/kubectl-mcp-server**, **silenceper/mcp-k8s**, **weibaohui/kom** (≈50 tools) | Kubernetes — many overlapping options |
| **L337-org/docker-mcp** (156 tools), **portainer/portainer-mcp** (official), **mrostamii/rancher-mcp-server** | Containers |
| **ofershap/mcp-server-cloudflare** (Workers/KV/R2/Pages/DNS), **ofershap/mcp-server-s3** | Edge / object storage |
| **localstack/localstack-mcp-server** (official) | Local AWS |
| **openpouch/openpouch**, **shipstatic/mcp**, **stevejford/shiply-mcp**, **shdomi8599/vibie-mcp** | "Agent-native hosting": deploy a static/app to a URL in one call |
| **aparajithn/agent-deploy-dashboard-mcp** | Unified deploy status across **Vercel, Render, Railway, Fly.io** |

### 1e. Project management / issue tracking

| Server | Notes |
|--------|-------|
| **Atlassian official Jira MCP** (widely used; plus archived `modelcontextprotocol/server-jira`) | The de-facto PM MCP |
| **spranab/saga-mcp** | Jira-like tracker built for agents (Projects>Epics>Tasks>Subtasks, deps, templates) |
| **agrath/Trello-Desktop-MCP** (46 tools), **Atlassian Trello MCP** | Trello |
| **daiji-sshr/redmine-mcp-stateless**, **andrelaptenok/redmine-mcp-stdio** | Redmine (note: a rare *stateless* MCP — credentials per-request) |
| **AIOProductOS/claude-plugin** | Product "spine" linking feedback → features → sprints → releases |
| **costajohnt/oss-autopilot** | PR tracking across repos, issue discovery, **CI-failure diagnosis** (CLI + MCP + Claude Code plugin) |
| **KyaniteLabs/Epoch** | Estimation: PERT / COCOMO II / Monte Carlo, sprint forecasting |

### 1f. Notable meta-MCP / aggregation gateways (evidence of the "unified surface" gap)

Hundreds of single-purpose MCP servers spawned a sub-genre of **gateways that bundle many
servers behind one endpoint** — direct evidence the fragmentation is felt:

- **sitbon/magg** — LLM autonomously discovers/installs/orchestrates multiple MCP servers.
- **tsouth89/toolport**, **Rendeverance/toolfunnel**, **TheLunarCompany/lunar (MCPX)**,
  **ViperJuice/mcp-gateway**, **tigranbs/mcgravity**, **rupinder2/mcp-orchestrator**,
  **duaraghav8/MCPJungle**, **VeriTeknik/pluggedin-mcp-proxy**, **metatool-ai/metatool-app**.
- **Work90210/APIFold**, **ouvreboite/openapi-to-mcp**, **mroops0111/openapi-mcp-gateway** —
  turn REST/OpenAPI specs into MCP servers automatically.
- **Proofpane/releases** — governance proxy: allow/deny / HITL approval + audit log in front of MCP.

These gateways all live *inside the MCP world* — they still require an MCP host and registration,
so they don't solve the "any coding agent, zero-config, subprocess" problem `righthand` targets.

---

## 2. CLIs agents drive inside bash loops

Every mainstream coding agent (Claude Code, Cursor, Copilot/Codex, Aider, Gemini CLI, pi)
exposes a generic **shell/bash tool**. The agent emits commands, reads stdout/stderr, and loops.
This is the de-facto "agent interface," and it predates MCP entirely.

**The ops CLIs agents reach for:**

| CLI | Typical agent usage | Agent-friendly features |
|-----|---------------------|--------------------------|
| `gh` (GitHub CLI) | `gh pr create/list/view`, `gh run list/view`, `gh issue ...`, `gh release` | **`--json` structured output**, stable subcommands, exit codes |
| `git` | branch / commit / log / diff / rebase | text output; agents parse diffs |
| `kubectl` / `helm` / `k9s` | `get/describe/logs`, `apply -f`, rollout status | **`-o json/yaml`**, `--watch` |
| `terraform` / `tofu` / `pulumi` / `terragrunt` | `plan/apply/destroy/show` | **`-json` plan output**, machine-readable |
| `aws` / `gcloud` / `az` | any cloud call | **`--output json --query`**, `--format` |
| `docker` / `podman` / `compose` | build / run / logs / ps | `--format` |
| `flyctl` (Fly.io), `vercel`, `netlify`, `railway`, `render` | deploy, logs, env, rollback | mostly JSON / text |
| `npm` / `pnpm` / `yarn`, `act` (run GH Actions locally) | build / test / release | exit codes |

**How agents cope (and where it hurts):**

- **Structured output is the whole game.** `gh --json`, `kubectl -o json`, `terraform -json`,
  `aws --output json` are what let an agent ingest results without parsing prose. CLIs *without*
  good JSON output (older `git`, many vendor CLIs) force the agent to scrape text.
- **Context-window tax.** Driving a CLI means the agent ingests `--help`, man pages, full log
  dumps, and verbose errors into its context. This is the exact pain `righthand` is meant to
  absorb: a curated subprocess that returns *compressed, decision-ready* output.
- **Safety is ad hoc.** Destructive ops (`terraform destroy`, `kubectl delete`, `gh repo delete`)
  are gated only by the agent's own judgment or the host's approval prompt — unlike the
  two-step-confirmation / dry-run / audit-log patterns now common in ops MCP servers.
- **A few "CLI-for-agents" wrappers exist**, e.g. **PsYcGoD/sage** ("routes shell commands
  through `sage run --`, stores history locally, returns **compressed** terminal output to reduce
  context noise") and **wonderwhy-er/DesktopCommanderMCP** (manage/execute + file ops). These are
  the closest existing analogues to a "right-hand" but are general-purpose, not ops-focused.

---

## 3. "Sidekick / companion / handoff" products & patterns

This is the most relevant bucket for `righthand`'s positioning — and it is **thin**.

### 3a. Delegation / handoff MCP servers

| Project | Pattern |
|---------|---------|
| **Michael-WhiteCapData/ollama-handoff** | Offload cheap work from a cloud agent to a local Ollama model via purpose-built handoff tools |
| **sshahzaiib/agy-bridge** | **Delegate tasks from Claude Code → Antigravity CLI (Gemini)**; file analysis, repo archaeology, web lookups, adversarial review |
| **freema/openclaw-mcp** | Claude delegates to OpenClaw agents (sync/async) |
| **danieldoderlein/llm-bus** | Multi-agent coordination bus: atomic task claims, file leases, shared ledger, **prose handoffs**, task graph — stops Codex/Cursor/Claude colliding |
| **a2cr/a2cr** | **Agent handoffs** for Codex/Claude Code/Roo — encrypted WorkBaton checkpoints + WorkStash notes to resume without full chat history |
| **conversation-handoff-mcp**, **ravi-labs/mindmap-mcp-server**, **sgx-labs/statelessagent** | Context / memory handoff across tools; `statelessagent` is explicitly a single Go binary, local, session-handoff oriented |
| **djerok/glm-mcp** | Run GLM as a *real sub-agent* inside Claude Code/Copilot with its own agent loop + oversight |

### 3b. Agent harnesses that *are* the "main" coding agent (the layer `righthand` would serve)

- **Claude Code, Cursor, GitHub Copilot/Codex, Aider, Gemini CLI, Cline / Roo Code / Kilo Code,
  Goose (block/goose), pi** — all expose a shell tool and (most) support MCP + subagents/skills.
  None ships a dedicated, plugin-extensible **ops** surface; they expect MCP servers or raw CLIs.

### 3c. Closest existing analogues to a "right-hand"

- **sage** and **DesktopCommanderMCP** (above): general command runners with context compression.
- **Goose extensions**: Goose has an extension/skills system + MCP — the closest *open-source
  agent* with a plugin model, but it is the agent itself, not a sidekick CLI.
- **pi skills/extensions** (the harness this research runs in): an agent-invoked CLI with a
  plugin/skill system and subprocess invocation — structurally similar to what `righthand`
  proposes, but it is a general agent harness, not an ops-specialized sidekick.

**Net:** there is **no widely-adopted standalone CLI that a coding agent shells out to
specifically to own non-coding ops tasks**. The idea is in the air (handoff MCPs, sage,
DesktopCommander) but nobody occupies the "modular, plugin-extensible, ops-focused,
host-agnostic sidekick CLI" quadrant.

---

## 4. Notable gaps — operational surface NOT well covered for agent-driven dev

1. **No unified ops entrypoint.** Thousands of single-purpose MCP servers; an agent ends up
   with N registered servers (N auths, N configs) or shells out to N CLIs. No one CLI says
   "hand me the ops task; I'll pick the right tool." *(Evidence: the entire meta-MCP gateway
   sub-genre exists to paper over this fragmentation — §1f.)*

2. **Context-window tax when the agent drives raw CLIs.** Man pages, flag discovery, paged
   output, verbose errors all enter the main agent's context. Only a handful of tools (sage)
   compress/curate; none do it for the *ops* category specifically.

3. **MCP is host-bound, not agent-universal.** MCP servers need a host that speaks MCP
   (Claude Desktop, Cursor, VS Code 1.101+, etc.) and a JSON registration. A pure subprocess
   CLI invoked from `bash` reaches **every** agent, but nobody owns that universal surface for ops.

4. **"Own this task to completion" semantics are rare.** Tools expose fine verbs (`get pod X`,
   `list runs`); the agent still orchestrates the multi-step loop and burns tokens. Only narrow
   agentic MCPs (e.g. TaskBounty for bug-fix bounties) currently offer end-to-end task ownership.

5. **Cross-vendor workflow wiring is the agent's job.** "CI failed → fetch logs → query Sentry
   → open PR" requires juggling multiple MCPs/CLIs in the agent's context. No single composable
   ops CLI stitches these.

6. **Plugin authoring for LLM-invoked ops isn't first-class anywhere.** oclif/clipanion plugins
   exist but aren't agent-aware; MCP servers aren't composable without a meta-gateway. The
   "third parties author ops tasks/commands discoverable by an LLM" contract that `righthand`
   proposes is open territory.

7. **Stateless-per-task + on-disk continuity is unusual.** Most MCP servers are long-lived
   daemons (state in memory); most CLIs are stateless *and* memoryless. `righthand`'s chosen
   model (spawn per task, persist cross-task state to disk, reload each run) is rare —
   `redmine-mcp-stateless` and `a2cr`/WorkBaton are the few stateless/handoff examples, but each
   is single-purpose.

8. **Onboarding / zero-config / works-in-any-repo.** Most ops MCP servers need tokens + host
   JSON + a compatible client — high friction for third-party distribution. A self-contained
   CLI that auto-discovers repo context and degrades gracefully without every token configured
   is an underserved UX.

---

## 5. Where a modular agent-invoked ops CLI fits (positioning for `righthand`)

Mapping the gaps to `righthand`'s recorded pillars (from the wiki entity + ADRs):

| `righthand` pillar | Landscape gap it fills | Differentiator vs existing |
|--------------------|------------------------|----------------------------|
| **Subprocess invoked by the main coding LLM** (stateless per task) | Reaches *every* agent with a shell tool — no host/registration dependency (gap #3) | vs MCP servers: universal install; vs raw CLIs: curated, compressed output (gap #2) |
| **Owns non-coding ops tasks to completion** | "Own the task" semantics (gap #4); absorbs context cost (gap #2) | vs fine-grained verbs: the agent hands off a whole task, not N calls |
| **Modular plugin system as a first-class pillar** | LLM-invoked-ops plugin authoring is unaddressed (gap #6) | vs oclif (not agent-aware) / vs MCP (not composable w/o gateway) |
| **Stateless per invocation, state on disk** | Rare stateless+persistent combo (gap #7) | vs MCP daemons: clean failure isolation; vs CLIs: real continuity |
| **Standalone, distributable product** | Zero-config / works-in-any-repo is underserved (gap #8) | vs per-tool MCP: one install, auto-discovery, graceful degradation |

**The empty quadrant** = *one agent-invoked subprocess CLI that is plugin-extensible,
stateless-per-task, owns ops tasks end-to-end, host-agnostic, and zero-config-first.*
That is precisely the space described in the `righthand-cli` wiki entity and the
stateless-subprocess + first-class-plugin ADRs — and nothing in the current landscape
occupies it.

**Strategic watch-outs surfaced by the research:**

- **Don't become "another MCP server."** That market is saturated and host-bound. The
  subprocess-CLI angle is `righthand`'s structural advantage — protect it.
- **Compress, don't relay.** The agent's pain is context, not capability. Every command's
  output contract should return decision-ready, bounded text (the Grafana MCP's explicit
  context-management tools [grafana-mcp] and sage's output compression are the precedent).
- **Borrow the safety patterns ops MCP servers already converged on:** two-step confirmation
  gates, dry-run, audit logging (e.g. `RajeevSirohi/mcp-server-terraform`, `zw008/VMware-*`,
  `Proofpane/releases`). These are table stakes for destructive ops.
- **A plugin contract is the moat.** The single most defensible differentiator is making it
  trivial for third parties to add "an ops task `righthand` can own" — that is the unfilled gap
  (#6) and it compounds (each plugin widens the unified surface in #1).

---

## Sources

- **[mcp-official]** modelcontextprotocol/servers — official reference servers + SDKs.
  https://github.com/modelcontextprotocol/servers (README fetched; notes reference servers are
  educational; production servers live in the MCP Registry at
  https://registry.modelcontextprotocol.io/ )
- **[awesome-mcp-servers]** punkpeye/awesome-mcp-servers — community directory, ~3,710 lines,
  ~60 categories. https://github.com/punkpeye/awesome-mcp-servers (README fetched; sections
  used: Cloud Platforms, Monitoring, Version Control, Command Line, Code Execution, Coding
  Agents, Aggregators, Product Management, Developer Tools)
- **[gh-mcp]** github/github-mcp-server — official GitHub MCP server.
  https://github.com/github/github-mcp-server (README fetched; use cases: repo mgmt, issue/PR
  automation, CI/CD workflow intelligence, code analysis, team collaboration)
- **[grafana-mcp]** grafana/mcp-grafana — official Grafana MCP server.
  https://github.com/grafana/mcp-grafana (README fetched; features: dashboards w/ explicit
  context-window-management tools, Prometheus/Loki/CloudWatch/ClickHouse/Elasticsearch datasource
  queries, incident investigation)
- **MCP Registry (referenced, not fetched):** https://registry.modelcontextprotocol.io/
- **Additional repos cited inline** (all from [awesome-mcp-servers] / [mcp-official] / their
  linked READMEs): mshegolev/gitlab-ci-mcp, CircleCI-Public/mcp-server-circleci,
  buildkite/buildkite-mcp-server, avisangle/jenkins-mcp-server, Daghis/teamcity-mcp,
  getsentry/sentry-mcp, TANTIOPE/datadog-mcp-server, us-all/datadog-mcp-server,
  dynatrace-oss/dynatrace-mcp, pydantic/logfire-mcp, pulumi/mcp-server, nwiizo/tfmcp,
  RajeevSirohi/mcp-server-terraform, Flux159/mcp-server-kubernetes, L337-org/docker-mcp,
  portainer/portainer-mcp, ofershap/mcp-server-cloudflare, localstack/localstack-mcp-server,
  aparajithn/agent-deploy-dashboard-mcp, Atlassian Jira MCP, spranab/saga-mcp,
  costajohnt/oss-autopilot, PsYcGoD/sage, wonderwhy-er/DesktopCommanderMCP,
  Michael-WhiteCapData/ollama-handoff, sshahzaiib/agy-bridge, danieldoderlein/llm-bus,
  a2cr/a2cr, sgx-labs/statelessagent, sitbon/magg, tsouth89/toolport, TheLunarCompany/lunar,
  Proofpane/releases, Work90210/APIFold, ouvreboite/openapi-to-mcp

### Methodology note

The `websearch` / `websearch_deep` / `fetch_url` / `task` tools referenced by the web-research
and websearch-deep skills were **not available** in this environment (only read/grep/find/ls/bash).
Research was therefore performed by `curl`-fetching known authoritative URLs: the official MCP
servers repo, the awesome-mcp-servers directory, the official GitHub MCP server, and the official
Grafana MCP server. Coverage is strong for the MCP landscape and CLIs; the "blog comparison"
angle was light because high-quality comparison blogs were not fetchable, but the primary
sources (the directories and official repos themselves) are higher-authority than blogs.
