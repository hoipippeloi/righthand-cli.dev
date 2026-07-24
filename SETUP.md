# SETUP.md — adding righthand to a project

> **Audience: an LLM agent.** This is an executable runbook. Run it from the **root of the target project** (the repo/folder/codebase you want to give a right-hand). Do every step in order; run each **Verify** check before moving on. If a check fails, follow its **On failure** note — do not skip ahead.

righthand is a CLI a coding agent shells out to for non-coding ops (CI/CD, logs, docs, tasks, admin, research). Onboarding a project = create its footprint, ignore the local-only bits, optionally wire an LLM, grant capabilities, verify, then tell the project's agent it exists.

---

## Prerequisites

- **Node ≥ 20** (≥ 24 preferred) **or Bun**. righthand runs `.ts` directly — no build step. Check: `node --version` (or `bun --version`).
- **The target project has a root directory you can write to** (this is where `./.righthand/` will live).
- Optional, per capability: `gh` on PATH for `ci`/`tasks`; an LLM API key for `llm`/`research`/`build`.

---

## Step 0 — Detect the environment

```bash
pwd                       # MUST be the target project root
node --version            # need >= 20 (>= 24 preferred); or `bun --version`
command -v righthand      # present? prints a path if installed
```

- If `pwd` is wrong, `cd` to the project root and stop — re-evaluate.
- Record whether `righthand` is already on PATH. That decides Step 1.

## Step 1 — Ensure righthand is installed

If Step 0 showed `righthand` on PATH, **skip to Step 2.** Otherwise install it:

```bash
# Preferred (once published):
npm install -g righthand

# Fallback (from source — use if the line above fails / not yet published):
git clone <righthand-repo-url> /tmp/righthand.cli
cd /tmp/righthand.cli && npm install && npm link && cd -   # back to project root
```

**Verify:**
```bash
righthand version    # prints a JSON envelope with "version":"0.0.x", exit 0
```
**On failure:** `npm install -g` needs network + npm registry access; if absent, you must use the from-source fallback. If `npm link` fails on permissions, retry with the appropriate prefix for the OS. Do not continue until `righthand version` succeeds.

## Step 2 — Initialize the project footprint

```bash
righthand init
```

This creates `./.righthand/` with `config.json` (safe defaults, no credentials), `history.jsonl`, and an internal `isomorphic-git` rollback store (`.git`).

**Verify:**
```bash
test -f .righthand/config.json && test -d .righthand/.git && echo OK
righthand changes     # exit 0; lists the "init" change (journal is working)
```
**On failure:** if `init` refuses because a footprint exists, the project is already onboarded — skip to Step 4. If it errors on `.git` init, ensure the dir is writable.

## Step 3 — Ignore the local-only footprint bits in git

`config.json` and `commands/` are **shareable** (team config + project commands). The rest is machine-local and must not be committed. Append to the project's `.gitignore` (create it if absent):

```gitignore
# righthand — keep config.json + commands/, ignore machine-local state
.righthand/.git/
.righthand/history.jsonl
.righthand/manifest.json
.righthand/plugins/
.righthand/._resets/
# righthand — secrets live here, never commit
.env
.env.*
!.env.example
```

**Verify:**
```bash
# only if the project is a git repo:
git check-ignore .righthand/history.jsonl .env && echo OK
```
**On failure:** if `.gitignore` didn't exist, you created it — fine. If `git check-ignore` errors, the project may not be a git repo yet; that's OK, the entries will apply once it is.

## Step 4 — (Optional) Wire an LLM provider

Skip this step only if the project will never use `llm` / `research` / `build`. Otherwise add credentials to `.env` (never to `config.json` directly) and reference them by `env:` indirection.

Create `./.env` (it is auto-loaded; ensure it's gitignored — Step 3 already covers it):

```bash
# .env — fill in one provider. Examples:
DEEPSEEK_API_KEY=sk-...
CHAT_MODEL=deepseek-chat
CHAT_BASE_URL=https://api.deepseek.com/v1

# OR a generic OpenAI-compatible endpoint:
# OPENAI_API_KEY=sk-...
# CHAT_MODEL=gpt-4o-mini
# CHAT_BASE_URL=https://api.openai.com/v1
```

Point the default provider at those vars (values stay in `.env`):

```bash
righthand config set providers.default.type openai-compatible
righthand config set providers.default.baseURL env:CHAT_BASE_URL
righthand config set providers.default.apiKey  env:DEEPSEEK_API_KEY     # or OPENAI_API_KEY
righthand config set providers.default.model   env:CHAT_MODEL
righthand config set defaults.provider default
```

**Verify:**
```bash
righthand config list    # the provider shows env: refs — NO plaintext key anywhere in output
righthand llm ask "reply with exactly: pong"    # requires Step 5's net:llm grant
```
**On failure:** `config list` showing a raw key value means you pasted the secret into config — remove it and use the `env:` reference. An `auth` (exit 4) on `llm ask` means the `.env` var is unset/empty or the name doesn't match the `env:` reference. A network error means `CHAT_BASE_URL` is wrong for the provider.

## Step 5 — Grant the capabilities this project needs

Capabilities are **deny-by-default**. A command's declared caps (`exec:gh`, `net:api.github.com`, `net:llm`, `fs:write`, …) must be granted in `permissions.allow` before it runs. `*` is a wildcard.

```bash
# Read-only first to see what's allowed now:
righthand config get permissions.allow

# Grant what you need. Examples (append to the allow list):
righthand config set permissions.allow '["net:llm","fs:write"]'     # for llm/research/build
righthand config set permissions.allow '["exec:gh","net:api.github.com"]'  # for ci/tasks
# or, simplest for a trusted local setup:
righthand config set permissions.allow '["*"]'
```

> Note: `config set` on `permissions.allow` **replaces** the array — merge the values you want into one JSON array rather than running it twice.

**Verify:**
```bash
righthand doctor        # the "capabilities" check should be green/informational
righthand ci status     # if you granted exec:gh + net:api.github.com — no longer exit 6
```
**On failure:** exit `6` (capability-denied) = add the named capability to `permissions.allow` and retry. Run `righthand doctor` to see exactly what each command needs.

## Step 6 — Verify the whole setup

```bash
righthand doctor        # assert: overall is "green" or "yellow" with NO red checks
righthand tools         # assert: lists the command surface (>= 20 commands)
righthand hello onboard # assert: exit 0, envelope ok:true
righthand web --no-open & sleep 1; curl -s http://127.0.0.1:8787/api/tools | head -c 80; kill %1
                        # assert: returns JSON tool descriptors
```

**Definition of done:** `doctor` has no red checks; `tools` enumerates commands; `hello` returns `ok:true`. If you configured a provider, `llm ask` returns the model's reply.

**On failure — read the exit code:**

| Exit | Meaning | Fix |
|---|---|---|
| `2` | usage | check the command spelling / args |
| `3` | NEEDS_HUMAN | a destructive/expensive op — re-run with `--yes`, or it genuinely needs a human |
| `4` | auth | provider key missing/unset — check `.env` + the `env:` ref |
| `5` | dep-missing | a wrapped CLI isn't installed (e.g. `gh`) — install it, or skip that command |
| `6` | capability-denied | grant the named capability in `permissions.allow` (Step 5) |

## Step 7 — Tell the project's coding agent righthand exists

Append a short instruction to the project's agent file so its coding LLM knows to hand off ops work. Create/append one of: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/righthand.mdc`, or whatever the project's agent reads.

```markdown
## righthand — operations right-hand

This project has **righthand** available. For any non-coding operational task
(CI/CD, logs, docs, issues, admin, web research), hand it off instead of
fumbling raw CLIs:

1. Enumerate once:   `righthand tools --json`
2. Dispatch a task:  `righthand <command> [args] --json`

Every command returns a small JSON envelope: `{ ok, command, summary, result,
needs_human, meta }`. Read `summary` first; only dig into `result` if needed.
If `needs_human` is set or the exit code is 3/4/5/6, stop and surface it —
don't retry blindly. Generated/scaffolded commands are rollback-able via
`righthand rollback`.
```

**Verify:** open the file and confirm the block is present.

---

## Rollback / removal

- Undo the last righthand change: `righthand rollback --yes`
- Remove righthand from the project entirely: `rm -rf .righthand .env` (and remove the agent-instruction block from Step 7, plus the `.gitignore` lines from Step 3).
- Uninstall the tool: `npm uninstall -g righthand` (or `npm unlink -g righthand` if installed from source).

## Notes for the executing agent

- Run commands **from the project root**; the footprint is resolved relative to cwd.
- Never paste API keys into `config.json` or echo them — always `env:` references, values in `.env`.
- `config set <array-key>` **replaces** the array; construct the full JSON array in one call.
- If the project already has a `.righthand/`, it's already onboarded — jump to Step 4/5/6 as needed.
- `doctor` is the single source of truth for "what's missing" — run it whenever something is denied or unavailable.
