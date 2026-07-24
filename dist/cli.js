#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { VERSION } from "./contracts.js";
import { loadConfig } from "./config.js";
import { dispatch } from "./runtime.js";
import { renderEnvelope } from "./envelope.js";
import { getMergedManifest } from "./manifest.js";
import { discoverCore } from "./discover.js";
const commonFlags = {
  json: { type: "boolean", description: "Force JSON output" },
  full: { type: "boolean", description: "Verbose result" },
  raw: { type: "boolean", description: "Raw underlying output" },
  quiet: { type: "boolean", description: "Minimal output" },
  yes: { type: "boolean", description: "Auto-confirm destructive ops" },
  "dry-run": { type: "boolean", description: "Preview without mutating" }
};
const scopeFlag = { type: "string", description: "Target scope: project|user" };
async function execute(commandName, args) {
  const config = loadConfig();
  const isTTY = process.stdout.isTTY ?? false;
  const ctx = { args, flags: args, config, isTTY, recordHistory: true };
  const { env, exitCode } = await dispatch(commandName, ctx);
  const mode = args.json || !isTTY ? "json" : "human";
  if (!args.quiet) {
    process.stdout.write(renderEnvelope(env, mode) + "\n");
  }
  process.exit(exitCode);
}
const configGetCmd = defineCommand({
  meta: { name: "get", description: "config get <key>" },
  args: { ...commonFlags, scope: scopeFlag, key: { type: "positional", required: true } },
  run: ({ args }) => execute("config", { ...args, action: "get" })
});
const configSetCmd = defineCommand({
  meta: { name: "set", description: "config set <key> <value>" },
  args: {
    ...commonFlags,
    scope: scopeFlag,
    key: { type: "positional", required: true },
    value: { type: "positional", required: true }
  },
  run: ({ args }) => execute("config", { ...args, action: "set" })
});
const configListCmd = defineCommand({
  meta: { name: "list", description: "List merged (redacted) config" },
  args: { ...commonFlags, scope: scopeFlag },
  run: ({ args }) => execute("config", { ...args, action: "list" })
});
const configCmd = defineCommand({
  meta: { name: "config", description: "Read/edit layered config" },
  subCommands: { get: configGetCmd, set: configSetCmd, list: configListCmd }
});
const table = await discoverCore();
const subCommands = { config: configCmd };
for (const [name, cmd] of table) {
  if (name === "config") continue;
  const extra = cmd.cli?.args ?? {};
  const useScope = cmd.cli?.scope === true;
  subCommands[name] = defineCommand({
    meta: { name, description: cmd.descriptor.description },
    args: { ...commonFlags, ...useScope ? { scope: scopeFlag } : {}, ...extra },
    run: ({ args }) => execute(name, args)
  });
}
const main = defineCommand({
  meta: { name: "righthand", version: VERSION, description: "The coding agent's operations right-hand." },
  args: { ...commonFlags },
  subCommands,
  run: async () => {
    const tools = await getMergedManifest();
    process.stdout.write("righthand \u2014 available commands:\n");
    for (const t of tools) {
      process.stdout.write(`  ${t.name.padEnd(10)} ${t.description}
`);
    }
    process.exit(0);
  }
});
runMain(main);
