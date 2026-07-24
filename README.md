# righthand

> The coding agent's always-available operations right-hand.

A standalone CLI that any AI coding agent (Claude Code, Cursor, Copilot/Codex, Aider, pi, …) shells out to **per task** to offload everything that isn't writing code — CI/CD, logs, docs, tasks, admin, web research. It returns a **compressed, schema'd JSON result**, keeping the agent's context window free for code. It can also **use an LLM itself** and even **write new commands into its own surface** (a self-recursive self-builder) — safely, with full rollback.

- **Universal** — a subprocess CLI is the only model that reaches *every* agent (they all have a shell tool). No host registration, no MCP-server dependency.
- **Compress, don't relay** — every command returns a bounded summary, not a log dump.
- **Extensible** — drop in a file, scaffold one, or have the LLM build one. Plugins too.
- **Reversible** — every mutation is journaled; `rollback` undoes it.

Node 24+ / Bun · no build step (native TS type-stripping) · only runtime deps: `citty` + `isomorphic-git` · cold-start ~115ms.

---

## Quick start

```bash
git clone <repo> righthand.cli && cd righthand.cli
npm install
npm link            # puts `righthand` on your PATH

righthand                    # list commands
righthand tools --json       # MCP-shaped discovery (what an agent calls)
righthand init               # create ./.righthand footprint
righthand doctor             # health + integration check
righthand web                # visual command runner → http://127.0.0.1:8787
```

## What it does

Coding agents are tuned to *edit code in a repo* and degrade the moment an **operational** step enters the loop — they hallucinate CLI flags, drag log dumps into context, interrupt you to run a deploy, and lose the answer next session. righthand exists to absorb that whole class of work: the agent hands it a task, righthand does the noisy I/O in its own process, and returns a decision-ready answer.

It owns the non-coding surface end-to-end — and can reason about it with its own LLM, search the web, and grow new commands on demand.

## Commands (21, all auto-discovered)

| Group | Commands |
|---|---|
| **CI/CD** | `ci status` · `ci logs` |
| **Observability** | `logs tail` |
| **Docs** | `docs lint` |
| **Tasks** | `tasks list` |
| **Admin** | `admin env` |
| **LLM** | `llm ask "<prompt>"` · `research "<query>"` |
| **Self-builder** | `build "<what it should do>"` |
| **Extend** | `new <name>` (scaffold) · `plugins install|list|remove` |
| **System** | `version` · `tools` · `config get|set|list` · `history` · `init` · `changes` · `rollback` · `reset` · `doctor` · `web` |

Every command returns the same **envelope**:

```json
{ "ok": true, "command": "ci", "summary": "main: 2 failed, 1 running",
  "result": { "runs": [...] }, "needs_human": null,
  "meta": { "version": "0.0.1", "duration_ms": 142, "change_id": null, "tokens_used": 0 } }
```

**Exit codes:** `0` ok · `1` fail · `2` usage · `3` NEEDS_HUMAN · `4` auth · `5` dep-missing · `6` capability-denied.

## How agents use it

An MCP-aware agent enumerates righthand once, then dispatches:

```
righthand tools --json                 # → { tools: [ { name, description, inputSchema, … } ] }
righthand ci status --json             # → bounded JSON summary
```

The descriptors are MCP-shaped, so any agent that speaks MCP can call righthand without being taught.

## Configuration

Layered config — **project `./.righthand/config.json` › user `~/.righthand/config.json` › env (`RIGHTHAND_*`)**. A `.env` at the project root is auto-loaded.

```jsonc
// ./.righthand/config.json
{
  "providers": {
    "default": { "type": "openai-compatible", "baseURL": "env:CHAT_BASE_URL",
                 "apiKey": "env:DEEPSEEK_API_KEY", "model": "env:CHAT_MODEL" }
  },
  "permissions": { "allow": ["net:llm", "fs:write"], "deny": [] },
  "defaults": { "provider": "default" }
}
```

- **Credentials** use `env:`/`keychain:` indirection — never plaintext on disk, never in output.
- **Capabilities** (`exec:` · `net:` · `fs:` · `llm:`, with `*` wildcards) are **deny-by-default**. Grant them in `permissions.allow`. `doctor` tells you what each command needs.

## The web UI

```bash
righthand web            # serves a visual runner + opens the browser
```

A self-contained SPA: searchable command list → a form **auto-generated from each command's schema** → Run → the envelope rendered (ok/needs-human badge, summary, pretty result, tokens/duration/change). It runs commands through the same in-process dispatch as the CLI, so config, capabilities, and rollback all apply. Great for browsing what righthand can do and driving it visually.

## How to enhance it

Four ways, zero shared-file edits — commands are **auto-discovered**:

1. **Drop in a file** at `src/commands/<name>.ts` (or `./.righthand/commands/` for project-local).
2. **Scaffold** one: `righthand new mycmd --desc "…"` (writes a starter, journaled).
3. **Have the LLM build one**: `righthand build "a command that …" --yes` (generate → smoke-test → confirm → install → immediately runnable).
4. **Install a plugin**: `righthand plugins install <npm-pkg>` (ships a `manifest.json` fragment).

A command is just a module exporting a descriptor + a handler:

```ts
// src/commands/greet.ts
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";
import { makeEnvelope } from "../envelope.ts";

export const descriptor: ToolDescriptor = {
  name: "greet",
  description: "Greet a name",
  inputSchema: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
  plugin: "@righthand/core",
  costTier: "free",
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  return makeEnvelope({ command: "greet", summary: `hi, ${ctx.args.name ?? "world"}!`, result: { name: ctx.args.name } });
}
```

Source must be **strip-only TypeScript** (Node/Bun run it with no build step): no parameter properties, no enums, no namespaces. Everything you change is **rollback-able** (`righthand rollback`).

## When to use righthand best

- **An agent keeps stalling on ops** — CI, deploys, logs, issues. Hand the task to righthand; get a one-line answer back.
- **Context bloat is hurting the agent's code work** — let righthand do the noisy I/O and return only the summary.
- **You want one universal, agent-invokable ops surface** instead of N MCP servers or raw `gh`/`kubectl` incantations.
- **You want to grow the tool with the agent** — the self-builder writes new commands on demand, and rollback keeps it safe.

And when **not**: righthand is a right-hand, not a coding agent — it doesn't edit your application source unless a command is explicitly scoped to. It shines for *operational* delegation.

## Limitations / status

v1 baseline. Deliberately deferred: real OS keychain (`keychain:` resolves to null — use `env:`), subprocess isolation for untrusted plugins (capability + permission enforcement is the v1 sandbox), `--deep` research (runs the shallow pipeline), `tsc --noEmit` CI gate, `righthand restore <undo-id>` replay, plugin-registry publishing. See `.prds/righthand-cli/prd.md` § Phasing & Open Questions.

## Project layout

```
bin/righthand.ts          # entrypoint
src/
  contracts.ts            # envelope, exit codes, ToolDescriptor, Config (the shared contracts)
  runtime.ts              # dispatch: manifest → capability check → approval → run → history
  capabilities.ts         # the sandbox (exec:/net:/fs:/llm:, deny-by-default)
  discover.ts             # auto-discovery (src/commands + footprint + plugin fragments)
  llm.ts                  # OpenAI-compatible + Anthropic provider abstraction
  shell.ts                # wraps CLIs (gh, kubectl…) + compresses output
  versionstore.ts journal.ts   # isomorphic-git rollback (every mutation is a snapshot)
  web/                    # server.ts + app.html (the web UI)
  commands/               # one file per command
test/                     # node --test (173 tests)
.prds/righthand-cli/      # PRD + interview transcript
.specs/                   # implementation specs
research_righthand_problem/   # evidence base (cited)
```

## Testing

```bash
npm test                  # 173 tests
node .work/e2e.mjs        # end-to-end harness (real binary, isolated footprint)
```

## License

TBD.
