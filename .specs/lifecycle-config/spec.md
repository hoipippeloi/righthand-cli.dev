# Spec: C9 — Lifecycle & Config

**Status:** Draft · **Priority:** Must (foundational) · **Depends on:** C1 · **Blocks:** none directly (used by all)

## Goal

The user-facing lifecycle and configuration commands: top-level help/list,
`version`, layered `config`, append-only `history`, and project `init [--from]`.
Establishes the **config schema and layering** every other command reads, and the
**history format** rollback (C7) and doctor (C10) reference.

## Commands

### `righthand` (no args) / `righthand --help`

Top-level: list available command groups (`ci`, `logs`, `docs`, `tasks`, `admin`,
`research`, `new`, `config`, `history`, `rollback`, `reset`, `doctor`, `tools`)
sourced from the merged manifest, plus global flags. Human-readable by default.

### `righthand --version`

Print `name@version` (and runtime: `bun|x.y.z` or `node|x.y.z`). `--json` →
envelope with `{ version, runtime, footprint_root }`.

### `righthand config [get <key> | set <key> <value> | list] [--scope project|user]`

Read and edit the layered config (see schema). `--scope` selects which file is
read/written (default: project if `./.righthand/config.json` exists, else user).
`set` mutates and journals a change (C7). `--json` on `get`/`list` returns the
value(s) in an envelope.

### `righthand history [--last N] [--since <ts>] [--json]`

Read the append-only action log (project scope by default; `--scope user` for
global). Each row maps to a past command invocation (and its `change_id` if it
mutated state), so an agent can ask "what did I do about this deploy" (kills P5).
`--json` → envelope with `result.actions: Action[]`.

### `righthand init [--from <other-project-path>] [--scope project]`

Initialize a project footprint (`./.righthand/`) with defaults. `--from` copies
`config.json`, installed plugin list, and (optionally, via `--from --include
state`) history/rollback store from another project's footprint. Does **not**
copy credentials (those live in the keychain, per-machine). Idempotent: re-running
is safe and reports what already exists.

## Config schema (shared contract)

```jsonc
// ~/.righthand/config.json  and  ./.righthand/config.json
{
  "providers": {
    "default": {
      "type": "openai-compatible",      // | "anthropic"
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "env:OPENAI_API_KEY",   // "env:VAR" | "keychain:<ref>" | omitted
      "model": "gpt-4o-mini",
      "params": { "temperature": 0.2 }  // optional passthrough
    }
  },
  "plugins": [                          // npm specs or local paths, version-pinned
    { "name": "@righthand/ci", "version": "^0.1.0" }
  ],
  "permissions": {                      // capability grants/denials (Plugin Sandbox spec)
    "allow": ["exec:gh", "net:api.github.com"],
    "deny": [],
    "auto_confirm_destructive": false   // global default; per-command overrides via capabilities
  },
  "defaults": {
    "provider": "default",
    "output": "summary"                 // "summary" | "full" (unless overridden by --full/--raw)
  }
}
```

**Layering & precedence (shared contract):**

1. Built-in defaults (lowest).
2. `~/.righthand/config.json` (user tier).
3. `./.righthand/config.json` (project tier).
4. **Environment variables** (highest) — convention `RIGHTHAND_<SECTION>__<KEY>`
   (e.g. `RIGHTHAND_PROVIDERS__DEFAULT__API_KEY`). Env wins.

**Credential resolution:** `apiKey` values use the `env:` / `keychain:` indirection
and are **never** written to disk in plaintext and **never** emitted to output
(see bar #4). Resolution happens in C4's credential layer; config only stores the
*reference*.

## History format (shared contract)

Append-only JSONL at `<footprint>/history.jsonl`. One line per invocation:

```jsonc
{ "ts": "2026-07-24T11:32:40.443Z", "id": "act_01H...", "command": "ci.status",
  "args": { "watch": false }, "ok": true, "exit": 0, "duration_ms": 142,
  "change_id": "chg_01H...", "tokens_used": 0, "needs_human": null }
```

- `id` is a ULID (time-sortable). `change_id` is set only when the invocation
  mutated state (links to C7's change log).
- Appended by the runtime dispatch flow (C1, step 5) — this spec owns the
  *format* and the *read* command; C1 owns the *write*.
- Rotate/truncation policy: keep last N (default 10,000) lines; `config.defaults.history_max`.

## Behavior & flows

- **Config read:** every command's dispatch (C1) calls `loadConfig()` which merges
  the four layers. This spec implements `loadConfig()` + the `config` command.
- **Config write (`set`):** validate against schema → write the target scope file
  → journal a `change_id` (C7) → emit envelope. Invalid key/value → exit 2.
- **History write** is the runtime's job (C1); `history` only reads.
- **init:** create `./.righthand/` (+ `.git` version store per C7), write a
  minimal `config.json` from defaults, seed empty `history.jsonl`. With `--from`,
  copy source `config.json` + plugin list verbatim; rewrite any absolute paths;
  emit a summary of what was copied.

## Security

- `config get/list` output **must redact** any resolved credential (show
  `env:OPENAI_API_KEY`, never the value). Bar #4.
- `init --from` refuses to copy credentials.

## Error handling & exit codes

- Use C1's exit codes. Unknown config key → 2. Missing scope file on read →
  treat as empty (not an error). `--from` path missing → 2 with a message.

## Testing strategy

- **Unit:** config merge across 4 layers + env override; redaction in `list`/`get`;
  history parse/filter; `init` idempotency; `--from` copy + path rewrite.
- **Integration:** round-trip `config set` → `config get`; `history --last N`
  after a real (mocked) command.
- **Self-check:** a `__main__` that loads a fixture config tree and asserts
  precedence.

## Open questions

- Whether `providers` supports multiple named providers per type and a
  `defaults.provider` switch (assumed yes above — confirm in C4).
- History retention default (10k proposed) — confirm.
- Whether `init` should auto-run `doctor` at the end (probably yes, as a soft
  check) — coordinate with C10.

## Out of scope

- `tools --json` discovery mechanism → **C1** (this spec's help *uses* it).
- Rollback store mechanics → **C7**.
- Credential resolution internals → **C4**.
- Plugin install/version-pinning enforcement → **C2**.
