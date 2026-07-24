# Findings 3 — Plugin / Command Extensibility Models for an Agent-Invoked Node CLI

> Research for **righthand**: a stateless, Node+TS CLI that a coding LLM shells out to
> per-task. Extensibility ("others can build tasks/commands into it") is a first-class
> pillar, and cold-start must stay lean via lazy plugin loading. This doc compares how
> mature Node CLIs structure third-party command systems, how discovery/registration
> works, and what an **LLM-discoverable** command surface should look like. Ends with a
> concrete recommendation.

## TL;DR recommendation

Build the **cheapest discovery layer possible**: plugins declare their commands in a
**static JSON manifest** (borrowed from oclif's `oclif.manifest.json`) so the LLM can
enumerate every command and its argument schema **without importing a single plugin
module** — satisfying the lazy-load / cold-start constraint. Expose that manifest to the
agent as **MCP-shaped tool descriptors** via `righthand tools --json` (`name`,
`description`, `inputSchema`), and dispatch by `righthand <command> [args]`. Do **not**
adopt Nx's heavy infer-tasks/generator model, and do **not** run a live MCP server (it
contradicts the stateless-subprocess decision). See §6.

---

## 1. oclif (Salesforce / Heroku) — the reference plugin CLI

oclif is the dominant framework for multi-command Node CLIs (Salesforce CLI, Heroku CLI,
Shopify, Stripe, AWS SDK v2 CLI). A CLI is itself a "plugin"; everything else is a plugin too.

### How discovery / registration works

- **Convention-based**: a plugin is an npm package. Commands live in
  `src/commands/**/*.{ts,js}`; file path maps to command id (`commands/hello/world.ts` →
  `hello:world`). Classes extend `Command` and declare `static description`, flags, args.
- **Three plugin sources**, merged into one command set:
  1. **Core plugins** — bundled in the CLI's own package (the `plugins` array in
     `package.json`). Always present, versioned with the CLI.
  2. **User plugins** — added at runtime to a writable config (`~/.<cli>/plugins.json` or
     the `plugins` config key); `cli plugins install <pkg>` does an npm install into a
     user-owned dir. Survives upgrades of the core CLI.
  3. **JIT (Just-In-Time) plugins** — declared in `package.json` `oclif.jitPlugins`;
     resolved/transpiled on demand via `ts-node`. Lazy by design.
- **Manifest** (`oclif manifest` → `oclif.manifest.json`): a **static, pre-generated JSON
  index of every command's id, description, args, and flags. This is the key machine-
  readable surface — it exists precisely so command lookup/help does not have to import
  every plugin module.
- **Help auto-generation**: `--help` output (flags, args, descriptions) derives from the
  same command metadata; `oclif readme` regenerates the README from it.

### Pros / cons

- **Pros**: battle-tested, large ecosystem, first-class TS, manifest = cheap enumeration,
  the user-plugin install story is already solved (`plugins install`), auto-update via
  `plugin-update`.
- **Cons**: heavy framework with strong opinions (config layout, hook system, topic
  model). Pulling the whole framework in just for its plugin seam is a lot for a new CLI.
  Default discovery scans the filesystem on startup unless a manifest is shipped.

Sources: [oclif/oclif README](https://github.com/oclif/oclif), [oclif/oclif
manifest.md](https://github.com/oclif/oclif/blob/main/docs/manifest.md), [oclif/core
README](https://github.com/oclif/core) ("Plugins… users can extend it… a CLI can be split
into modular components"), [oclif.io plugins docs](https://oclif.io/docs/plugins).

---

## 2. clipanion (Yarn) — type-safe, explicit-registration CLI engine

clipanion is the CLI engine behind Yarn (Berry). Minimal, zero runtime dependencies,
fully TS-typed. It is the "less framework, more library" counterpoint to oclif.

### How discovery / registration works

- **Explicit, not scanned**: you build the CLI with `Cli.from([Command1, Command2, ...])`.
  There is **no filesystem convention and no auto-discovery** — every command class is
  registered by hand (or by composing arrays of classes exported from plugin packages).
- **Class-based commands**: each `Command` declares `static paths = [['build']]`,
  `static usage`, and typed positional/option fields (via the `@Option`-decorator API or
  the decorator-free static-property style). Routing is exact-match against the declared
  path tokens; clipanion supports positional, option, and a single "default" command.
- **A plugin = an exported array of Command classes** the host concatenates into the
  `Cli.from([...])` list. So extensibility is trivial (import and spread), but the host
  owns the composition — there is no "install a plugin and it shows up" UX without the
  host wiring it.

### Pros / cons

- **Pros**: tiny, typed, predictable, no magic. Great when the host wants full control.
  No startup filesystem scan → fast cold start, which lines up with righthand's lazy-load
  goal.
- **Cons**: **no built-in discovery** — you must hand-compose the command list, so the
  third-party "drop in a plugin" UX has to be built from scratch (read a config, import
  packages, concat). No manifest/help-JSON standard out of the box.

Sources: [clipanion on npm](https://www.npmjs.com/package/clipanion) ("Type-safe CLI
library / framework with no runtime dependencies"), [yarnpkg/clipanion](https://github.com/yarnpkg/clipanion).

---

## 3. Nx — local + distributed plugins, executors, generators

Nx is a monorepo build system. Its extensibility model is the richest (and heaviest) of
the three, and is oriented around **build-time automation** more than ad-hoc commands.

### How discovery / registration works

- **A plugin is an npm package** that can provide up to four things:
  1. **Executors** — "pre-packaged node scripts that run tasks", named `pkg:executor`
     (e.g. `@nx/webpack:webpack`), configured per-project in `project.json` under
     `targets.<name>.executor` + `options`. Invoked as `nx <target> <project>`.
  2. **Generators** — codegen (`nx g @nx/...`).
  3. **Inferred tasks (Project Crystal)** — the plugin *reads your tooling config* and
     **infers** targets/inputs/outputs automatically (no manual `project.json`). This is
     Nx's signature move: zero-config task detection.
  4. **Migration generators** — automating upgrades.
- **Local plugins**: a plugin that lives inside your own workspace, used privately.
  **Distributed plugins**: published to npm, discovered via the [plugin
  registry](https://nx.dev/docs/plugin-registry).
- **Dispatch is config-driven, not name-driven**: targets point at `pkg:executor` strings;
  Nx resolves the string to the executor implementation at run time. Caching and the
  task-DAG are layered on top.

### Pros / cons

- **Pros**: extremely powerful, auto-inference means zero boilerplate for users, strong
  registry/discovery story, mature.
- **Cons**: **massively more than righthand needs**. Nx plugins are about *build
  orchestration* (caching, task graph, inference from config files). righthand wants
  discrete "do this ops task" commands invoked one-off by an LLM — not a build graph. The
  inference model also actively fights the stateless-subprocess assumption (it needs deep
  workspace analysis per invocation).

Sources: [Nx — What Are Nx Plugins?](https://nx.dev/docs/concepts/nx-plugins), [Nx —
Executors and Configurations](https://nx.dev/docs/concepts/executors-and-configurations),
[Nx — Inferred Tasks](https://nx.dev/docs/concepts/inferred-tasks), [Nx — Extending
Nx](https://nx.dev/docs/extending-nx), [Nx plugin registry](https://nx.dev/docs/plugin-registry).

---

## 4. The agent-discoverable command surface: how CLIs expose themselves to an LLM

Three real precedents exist today; they are **composable, not competing**.

### 4a. MCP `tools/list` + `tools/call` — the native LLM tool protocol

MCP (Model Context Protocol) is *the* standard for model-invoked capabilities. A server
declares a `tools` capability; the client lists tools and calls them. The descriptor is
exactly what an LLM expects to consume:

```jsonc
// tools/list response
{ "tools": [ {
    "name": "get_weather",
    "title": "Weather Information Provider",
    "description": "Get current weather for a location",
    "inputSchema": { "type": "object",
      "properties": { "location": { "type": "string", "description": "City or zip" } },
      "required": ["location"] }
} ] }
// tools/call
{ "name": "get_weather", "arguments": { "location": "New York" } }
```

Tools are **model-controlled** — "the language model can discover and invoke tools
automatically based on its contextual understanding." Each tool is a name + description +
JSON-Schema `inputSchema` (SEP-2106 aligns it to JSON Schema 2020-12; SEP-986 standardizes
tool-name format).

### 4b. CLI `--help` / JSON manifest — the oclif precedent

oclif's `oclif.manifest.json` is a pre-built JSON index of every command's id,
description, args, and flags, generated by `oclif manifest`. Its purpose: enumerate
commands **without importing modules**. This is the cheapest possible discovery surface
and the direct ancestor of what righthand needs. The same metadata drives `--help`.

### 4c. `llms.txt` — doc-level discovery

Many doc sites (Mintlify-hosted: MCP, Nx) now publish `/llms.txt`, a plain-text index of
all pages so an agent can discover documentation without scraping HTML. Same philosophy
(machine-readable index, cheap to fetch) applied to docs.

### Precedent: "agent-discoverable command registries"

There is **no widely-adopted, standalone standard for "a CLI that advertises its commands
to an agent"** beyond MCP. The emerging consensus: emit **MCP-shaped descriptors** (name,
description, JSON-Schema input) from a stable endpoint, and enumerate without running
plugin code. oclif's manifest is the CLI-side implementation of the same idea; MCP is the
protocol-side. righthand should combine them (see §6).

Sources: [MCP — Tools (spec 2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[MCP — Tools concept](https://modelcontextprotocol.io/docs/concepts/tools), [MCP
llms.txt](https://modelcontextprotocol.io/llms.txt), [SEP-2106 (JSON Schema 2020-12 for
tool schemas)](https://modelcontextprotocol.io/seps/2106-json-schema-2020-12.md),
[SEP-986 (tool name format)](https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names.md).

---

## 5. Side-by-side comparison

| Dimension | oclif | clipanion | Nx |
|---|---|---|---|
| Discovery style | FS convention **or** static manifest | **None** — explicit `Cli.from([...])` | `pkg:executor` strings in `project.json` + inference |
| Registration work | `package.json` plugins / user install | hand-compose command array | install npm pkg; configure/infer targets |
| Enumerate without loading code? | **Yes** (manifest.json) | No | Partly (target graph) |
| Machine-readable surface | manifest JSON + `--help` | none built-in | `project.json` / graph |
| Weight | heavy framework | tiny library | very heavy (build system) |
| Fit for "agent invokes one task" | medium | high (needs surface added) | low |

---

## 6. Recommendation for righthand (simplest model that hits all constraints)

**Model: "oclif manifest for discovery + MCP descriptors for the LLM surface + clipanion-
style explicit dispatch, minus the frameworks."**

### Command-author contract (per plugin package)

- A plugin is an npm package exporting a **static manifest fragment** (no code runs to
  enumerate) — an array of command descriptors, each shaped like an MCP tool:

  ```jsonc
  { "name": "deploy:preview",
    "description": "Deploy the current branch to a preview environment",
    "inputSchema": { "type": "object",
      "properties": { "branch": { "type": "string" } },
      "required": ["branch"] },
    "plugin": "@acme/righthand-deploy",  // which package implements it
    "handler": "default" }                // export name
  ```

- Plugins register by being listed in righthand's config (a `plugins: [...]` array, like
  oclif's core-plugin list), or by being discoverable via an `righthand-plugin` keyword on
  npm (registry search only — **never** a startup filesystem scan).

### Discovery = read JSON only (cold-start friendly)

- At startup, righthand **merges the manifest fragments** (core + listed plugins) into one
  in-memory list. **No plugin code is imported** to enumerate — only JSON is read. This
  satisfies the lazy-load / cold-start rule from the stateless-subprocess and
  Node+TS-runtime decisions.
- Optionally cache the merged manifest to disk (`~/.righthand/manifest.json`) keyed on
  installed-plugin versions, so a no-op enumeration is a single file read.

### LLM-facing surface (agent-discoverable)

- `righthand tools --json` → emits the merged list as **MCP tool descriptors** (`name`,
  `description`, `inputSchema`). The agent runs this once per session, then dispatches.
  This is the §4a precedent and is exactly what an LLM already knows how to consume.
- `righthand <command> --help` and `righthand <command> [args]` run the handler — **the
  handler module is imported only on actual invocation** (true lazy loading).
- Use JSON-Schema for `inputSchema` (aligns with MCP / SEP-2106); do not invent a new
  schema format.

### Why this and not the alternatives

- **vs full oclif**: steals oclif's best idea (static manifest = enumeration without
  imports) without its framework weight, topic model, and hook system.
- **vs clipanion**: keeps clipanion's explicit, no-magic dispatch but *adds* the discovery
  layer clipanion lacks.
- **vs Nx**: rejects Nx's inference/build-graph model — wrong abstraction for discrete,
  one-shot, stateless ops tasks, and it fights the cold-start budget.
- **vs running a live MCP server**: the LLM talks to righthand as a subprocess
  (`righthand tools --json` + `righthand <cmd>`), *not* a long-lived server — consistent
  with the stateless-subprocess decision. We borrow MCP's **descriptor shape**, not its
  transport.

### Simplest possible v1

If even the manifest-merge feels heavy: start with **core commands only + a single
`righthand tools --json`** emitting MCP descriptors for them, and add the third-party
plugin-list merge as the *first* extensibility feature once the descriptor/dispatch
contract is proven. The descriptor contract is the load-bearing decision; everything else
is additive.

---

## Sources

- **oclif**
  - oclif CLI repo: https://github.com/oclif/oclif
  - oclif manifest command (`oclif.manifest.json`): https://github.com/oclif/oclif/blob/main/docs/manifest.md
  - oclif core (framework + plugins): https://github.com/oclif/core
  - oclif plugins docs: https://oclif.io/docs/plugins
- **clipanion**
  - npm ("Type-safe CLI library / framework with no runtime dependencies"): https://www.npmjs.com/package/clipanion
  - repo: https://github.com/yarnpkg/clipanion
- **Nx**
  - What Are Nx Plugins?: https://nx.dev/docs/concepts/nx-plugins
  - Executors and Configurations: https://nx.dev/docs/concepts/executors-and-configurations
  - Inferred Tasks (Project Crystal): https://nx.dev/docs/concepts/inferred-tasks
  - Extending Nx: https://nx.dev/docs/extending-nx
  - Plugin registry: https://nx.dev/docs/plugin-registry
- **MCP / agent-discoverable surfaces**
  - Tools (spec 2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/server/tools
  - Tools concept (model-controlled): https://modelcontextprotocol.io/docs/concepts/tools
  - llms.txt: https://modelcontextprotocol.io/llms.txt
  - SEP-2106 (JSON Schema 2020-12 for tool schemas): https://modelcontextprotocol.io/seps/2106-json-schema-2020-12.md
  - SEP-986 (tool name format): https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names.md
