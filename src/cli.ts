import { defineCommand, runMain } from "citty";
import { VERSION, type CommandContext } from "./contracts.ts";
import { loadConfig } from "./config.ts";
import { dispatch } from "./runtime.ts";
import { renderEnvelope } from "./envelope.ts";
import { getMergedManifest } from "./manifest.ts";
import { discoverCore } from "./discover.ts";

// Common global flags declared on every subcommand (C1 spec).
const commonFlags = {
  json: { type: "boolean", description: "Force JSON output" },
  full: { type: "boolean", description: "Verbose result" },
  raw: { type: "boolean", description: "Raw underlying output" },
  quiet: { type: "boolean", description: "Minimal output" },
  yes: { type: "boolean", description: "Auto-confirm destructive ops" },
  "dry-run": { type: "boolean", description: "Preview without mutating" },
} as const;

const scopeFlag = { type: "string", description: "Target scope: project|user" } as const;

async function execute(commandName: string, args: Record<string, unknown>): Promise<void> {
  const config = loadConfig();
  const isTTY = process.stdout.isTTY ?? false;
  // citty gives a single `args` object; treat it as both args + flags for handlers.
  const ctx: CommandContext = { args, flags: args, config, isTTY, recordHistory: true };
  const { env, exitCode } = await dispatch(commandName, ctx);
  const mode = args.json || !isTTY ? "json" : "human";
  if (!args.quiet) {
    process.stdout.write(renderEnvelope(env, mode) + "\n");
  }
  process.exit(exitCode);
}

// `config` is nested (get/set/list) — kept explicit; dispatches as "config" + action.
const configGetCmd = defineCommand({
  meta: { name: "get", description: "config get <key>" },
  args: { ...commonFlags, scope: scopeFlag, key: { type: "positional", required: true } },
  run: ({ args }) => execute("config", { ...args, action: "get" } as Record<string, unknown>),
});
const configSetCmd = defineCommand({
  meta: { name: "set", description: "config set <key> <value>" },
  args: {
    ...commonFlags,
    scope: scopeFlag,
    key: { type: "positional", required: true },
    value: { type: "positional", required: true },
  },
  run: ({ args }) => execute("config", { ...args, action: "set" } as Record<string, unknown>),
});
const configListCmd = defineCommand({
  meta: { name: "list", description: "List merged (redacted) config" },
  args: { ...commonFlags, scope: scopeFlag },
  run: ({ args }) => execute("config", { ...args, action: "list" } as Record<string, unknown>),
});
const configCmd = defineCommand({
  meta: { name: "config", description: "Read/edit layered config" },
  subCommands: { get: configGetCmd, set: configSetCmd, list: configListCmd },
});

// Auto-discover all other commands from the core table. Adding a command =
// drop a file in src/commands/ (optionally exporting `cli` for its args/scope).
// NO edits to this file required. (Collision-free for parallel capability work.)
// TLA is safe here: tests never import cli.ts.
const table = await discoverCore();
const subCommands: Record<string, ReturnType<typeof defineCommand>> = { config: configCmd };
for (const [name, cmd] of table) {
  if (name === "config") continue; // nested/special
  const extra = cmd.cli?.args ?? {};
  const useScope = cmd.cli?.scope === true;
  subCommands[name] = defineCommand({
    meta: { name, description: cmd.descriptor.description },
    args: { ...commonFlags, ...(useScope ? { scope: scopeFlag } : {}), ...extra },
    run: ({ args }) => execute(name, args as Record<string, unknown>),
  });
}

const main = defineCommand({
  meta: { name: "righthand", version: VERSION, description: "The coding agent's operations right-hand." },
  args: { ...commonFlags },
  subCommands,
  run: async () => {
    const tools = await getMergedManifest();
    process.stdout.write("righthand — available commands:\n");
    for (const t of tools) {
      process.stdout.write(`  ${t.name.padEnd(10)} ${t.description}\n`);
    }
    process.exit(0);
  },
});

runMain(main);
