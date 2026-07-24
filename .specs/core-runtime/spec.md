# Spec: C1 — Core Runtime & Dispatch

**Status:** Draft · **Priority:** Must (foundational — blocks everything) · **Depends on:** none · **Blocks:** C2, C3, C7, C9, all ops domains, C4, C5, C6

## Goal

Define the subprocess CLI runtime: lifecycle, command dispatch, the bounded
output contract, agent-discovery surface, cold-start budget, and the on-disk
footprint. This spec establishes the **shared contracts** every other spec
references (output envelope, manifest descriptor schema, exit codes, footprint
layout, runtime target).

## Runtime target

- **Language:** TypeScript. **Primary runtime:** Bun. **Must also run on Node ≥20.**
- Stay runtime-agnostic: avoid Bun-only APIs in code paths that aren't
  performance-critical, so Node users aren't broken. Document any Bun-only usage.
- **CLI layer:** [`citty`](https://github.com/unjs/citty) (stable, zero-dep,
  TS-first, runs on Bun via `node:util` parseArgs).

## Footprint layout (shared contract)

```
~/.righthand/                 # user-global
  config.json                 # layered config (user tier)
  manifest.json               # cached merged manifest (global plugins + core)
  plugins/                    # user-global plugins (npm-installed)
  history.jsonl               # append-only action log
  .git/                       # internal version store (rollback) — see C7
  credentials                 # keychain-backed secret store (see C4)

./.righthand/                 # project-local (version-controllable)
  config.json                 # layered config (project tier, overrides user)
  manifest.json               # cached merged manifest (project plugins layered on)
  plugins/                    # project-local plugins
  history.jsonl               # project action log
  .git/                       # internal version store (rollback) — see C7
```

Precedence for reads: **project > user-global > built-in defaults**. Env vars
override both (see C9). Writes go to the most-specific scope the command targets.

## CLI surface

```
righthand [--json|--full|--raw|--quiet] [--config <path>] [--yes] <command> [args...]
righthand <command> [--json|--full|--raw|--quiet] [args...]
righthand tools [--json]              # discovery — see below
righthand --version
righthand --help | righthand          # top-level help/command list
```

### Global flags

| Flag | Effect |
|---|---|
| `--json` | Force JSON output envelope (default when stdout is **not** a TTY) |
| `--full` | Escalate output: include the full/verbose result (opt-in) |
| `--raw` | Escalate output: raw underlying tool output, untransformed |
| `--quiet` | Minimal output (exit code carries meaning) |
| `--config <path>` | Use an explicit config path (testing/override) |
| `--yes` | Auto-confirm destructive/high-cost ops in agent mode (logs a warning) |
| `--dry-run` | Preview without mutating (commands that mutate must honor this) |

Default output mode: **JSON envelope when stdout is piped, human-readable when a
TTY**. Agents consume the piped-JSON path; humans get readable text.

### Discovery: `righthand tools [--json]`

Emits the merged command list as **MCP-shaped tool descriptors** so any
MCP-aware agent can enumerate righthand without being taught:

```jsonc
{
  "tools": [
    {
      "name": "ci.status",
      "description": "Get CI/CD status for the current branch",
      "inputSchema": {
        "type": "object",
        "properties": { "watch": { "type": "boolean", "default": false } },
        "additionalProperties": false
      },
      "plugin": "@righthand/core",
      "capabilities": ["exec:gh", "net:api.github.com"],
      "destructive": false,
      "costTier": "free"
    }
  ]
}
```

Discovery **must not import any plugin handler** — it reads only JSON manifest
fragments (see C2). This is the cold-start-critical path.

## Bounded output contract (shared contract)

Every command returns a standard **JSON envelope** to stdout (in JSON mode):

```jsonc
{
  "ok": true,                       // command succeeded
  "command": "ci.status",           // command id invoked
  "summary": "main: 2 failed, 1 running",  // ≤1-line human-decision-ready gist
  "result": { /* command-specific structured payload */ },
  "needs_human": null,              // non-null when the agent must escalate
  "meta": {
    "version": "0.1.0",
    "duration_ms": 142,
    "change_id": null,              // set when this command mutated state (C7)
    "tokens_used": 0                // set when an LLM was invoked (C4)
  }
}
```

Rules:

- `summary` is the **single highest-leverage field** — it's what an agent reads
  instead of ingesting raw logs. Target: `summary` ≤ ~120 chars; full detail in
  `result` only.
- `--full` includes a richer `result`; `--raw` replaces the envelope with the
  raw underlying tool output (escape hatch).
- `needs_human`: when non-null, the command could not complete autonomously
  (missing credential, irreversible action requiring confirmation, unknown
  infra). Value is a short reason string. Exit code reflects it (see below).

## Exit codes (shared contract)

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic failure |
| 2 | Usage / argument error |
| 3 | `NEEDS_HUMAN` — agent must escalate (see envelope) |
| 4 | Auth / credential error |
| 5 | Dependency missing (e.g. `gh` not installed) |
| 6 | Capability denied (permission sandbox refused — see Plugin Sandbox spec) |

Non-zero exits still emit the JSON envelope to stdout (so an agent gets
structured context on failure), with `ok:false`.

## Dispatch flow

1. **Cold path (must be fast):** parse argv (citty) → resolve global flags →
   load layered config (C9, JSON only) → read merged manifest (JSON only,
   cached) → locate the target command descriptor.
2. **Lazy import:** `await import(descriptor.handlerModule)` — import the handler
   **only** for the invoked command. No other plugin code runs.
3. **Capability check:** verify the command's declared capabilities against the
   active permission set (Plugin Sandbox spec). Deny → exit 6.
4. **Execute handler:** pass `{ args, flags, config, footprint, log, llm? }`.
   Handler performs ops (shell out to CLIs, invoke LLM via C4) and returns a
   result object.
5. **Journal mutations:** if the handler changed footprint state, append to
   `history.jsonl` and create a version-store snapshot + `change_id` (C7).
6. **Emit:** render the envelope (JSON or human), write to stdout, exit.

## Cold-start budget

- **Target: ≤200ms** wall-clock for `righthand tools --json` and any core
  read-only command, warm FS cache, on Bun.
- Enforced by: (a) JSON-only discovery, (b) lazy handler import, (c) no
  plugin code on the discovery path, (d) merged-manifest disk cache.
- **Telemetry hook (local only):** record `duration_ms` in every envelope's
  `meta`. Add a `righthand doctor` cold-start self-check (C10).
- If budget is exceeded in practice, the lever is shrinking what the manifest
  merge loads (cache hit = single file read) and trimming transitive deps.

## Security & permissions

- The runtime itself holds no secrets inline; credentials come from C4's
  keychain/env layer.
- Capability enforcement happens in dispatch step 3, **before** the handler
  runs. A command with no declared capability for what it tries to do is denied.
- **Hard boundary:** the runtime must refuse to write outside the righthand
  footprint and the explicit targets a command declares — **never** to the
  user's application source tree unless a command is explicitly scoped to it
  (bar #2). Implement an allowlist root guard.

## Error handling

- Handler exceptions are caught and rendered as an envelope with `ok:false`, a
  `summary` of the failure, and the original error in `result.error` under
  `--full`. Exit 1.
- Missing wrapped CLI (e.g. `gh` not on PATH) → exit 5 with a `needs_human`
  hint naming the missing binary.
- Malformed manifest fragment → skip the plugin, warn in `--full`, do not crash
  discovery.

## Testing strategy

- **Unit:** envelope rendering, flag parsing, exit-code mapping, manifest merge,
  capability allow/deny, output-mode selection (TTY vs piped).
- **Cold-start regression:** a benchmark asserting `tools --json` and a sample
  read-only command stay ≤200ms on Bun (fail the build if regressed). This is
  the load-bearing non-functional test for this spec.
- **Dispatch:** a fake plugin (manifest fragment + handler) proving lazy import
  (assert non-invoked plugin modules are never imported).
- **Self-check:** a `demo`/`__main__` smoke exercising the envelope round-trip.

## Open questions

- Exact `summary` length budget per command type (start with ≤120 chars, refine
  per spec).
- Whether human-readable TTY output should be richer than a 1:1 envelope dump
  (likely yes; defer styling to C10/UX pass).
- Config schema field naming (`providers` vs `llm.providers`) — finalized in C9.

## Out of scope (owned by other specs)

- Plugin contract internals, npm discovery, install → **C2**.
- Authoring/scaffolding → **C3**.
- Rollback/version-store mechanics, `change_id` lifecycle → **C7**.
- `config`/`history`/`init` commands + config schema → **C9**.
- LLM provider invocation → **C4**.
