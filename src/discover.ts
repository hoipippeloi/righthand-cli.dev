// Command auto-discovery (C1).
//
// Core commands: ONE file per command at src/commands/<name>.ts exporting
// `descriptor: ToolDescriptor` + `run`. discover.ts scans that dir and imports
// each to build an in-memory table. Adding a command = drop a file in
// src/commands/ — NO edits to shared files (manifest/registry/cli).
//
// Plugin manifest fragments are read as JSON ONLY here; their handler modules
// are lazy-imported on dispatch. So the lazy-import guarantee applies to
// PLUGINS (untrusted, cold-start-critical), not bundled core commands.
//
// The core table is built once at module load via top-level await (validated
// under Node 24 native TS stripping). This keeps getMergedManifest() sync —
// the table is ready by the time any importer runs.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ToolDescriptor, CommandContext, Envelope } from "./contracts.ts";
import { markPluginHandlerLoaded } from "./registry.ts";
import { footprintFor } from "./footprint.ts";

export type Handler = (ctx: CommandContext) => Envelope | Promise<Envelope>;

export interface CommandCli {
  // citty arg definitions specific to this command (beyond the shared global flags).
  args?: Record<string, unknown>;
  // expose the --scope (project|user) flag for this command.
  scope?: boolean;
}

export interface CoreCommand {
  name: string;
  descriptor: ToolDescriptor;
  run: Handler;
  cli?: CommandCli;
}

// A plugin fragment: descriptor data read from JSON + the handler module path
// (imported lazily only when the command is dispatched).
export interface PluginFragment {
  plugin: string;
  handlerModule: string;
  descriptors: ToolDescriptor[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(HERE, "commands");

async function loadCore(): Promise<Map<string, CoreCommand>> {
  const table = new Map<string, CoreCommand>();
  let files: string[] = [];
  try {
    files = readdirSync(COMMANDS_DIR);
  } catch {
    /* no bundled commands dir → start with an empty table */
  }
  const entries = await Promise.all(
    files
      // Accept .ts (dev: src/commands) and .js (published: dist/commands). HERE resolves
      // via import.meta.url to src/ in dev and dist/ when compiled — same code path either way.
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.startsWith("_"))
      .map(async (f) => {
        try {
          const mod = (await import("./commands/" + f)) as {
            descriptor?: ToolDescriptor;
            run?: Handler;
            cli?: CommandCli;
          };
          return { mod };
        } catch {
          return { mod: {} };
        }
      }),
  );
  for (const { mod } of entries) {
    if (!mod.descriptor || typeof mod.run !== "function") continue;
    table.set(mod.descriptor.name, {
      name: mod.descriptor.name,
      descriptor: mod.descriptor,
      run: mod.run,
      cli: mod.cli,
    });
  }
  // Footprint commands (./.righthand/commands + ~/.righthand/commands) are
  // first-class: a generated (C5) or scaffolded (C3) command is immediately
  // auto-discovered + dispatchable the moment it lands on disk. Core always
  // wins — a footprint command never shadows a bundled one. Footprint commands
  // are still subject to capability enforcement at dispatch (like any command).
  await loadFootprintCommands(table);
  return table;
}

// Scan footprint command dirs (project then user) and merge any command files
// into the table. A file that fails to import is skipped with a warning rather
// than poisoning discovery for every other command.
async function loadFootprintCommands(table: Map<string, CoreCommand>): Promise<void> {
  for (const scope of ["project", "user"] as const) {
    const dir = join(footprintFor(scope).root, "commands");
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue; // no footprint commands dir yet — the normal case
    }
    for (const f of files) {
      if (!f.endsWith(".ts") || f.startsWith("_")) continue;
      const abs = join(dir, f);
      try {
        const mod = (await import(pathToFileURL(abs).href)) as {
          descriptor?: ToolDescriptor;
          run?: Handler;
          cli?: CommandCli;
        };
        if (!mod.descriptor || typeof mod.run !== "function") continue;
        if (table.has(mod.descriptor.name)) continue; // core / earlier scope wins
        table.set(mod.descriptor.name, {
          name: mod.descriptor.name,
          descriptor: mod.descriptor,
          run: mod.run,
          cli: mod.cli,
        });
      } catch (e) {
        process.stderr.write(
          `[righthand] warn: skipping footprint command ${abs}: ${(e as Error).message}\n`,
        );
      }
    }
  }
}

// The core table is built lazily on first access (memoized). Built once per
// process; subsequent calls return the same resolved table.
let coreTablePromise: Promise<Map<string, CoreCommand>> | null = null;

export function discoverCore(): Promise<Map<string, CoreCommand>> {
  if (!coreTablePromise) coreTablePromise = loadCore();
  return coreTablePromise;
}

export async function getCoreDescriptors(): Promise<ToolDescriptor[]> {
  const table = await discoverCore();
  return [...table.values()].map((c) => c.descriptor);
}

// Test-only: force a re-discovery (e.g. after dropping a new command file).
export function resetDiscovery(): void {
  coreTablePromise = null;
}

// Read plugin manifest fragments as JSON ONLY — never import handlers here.
// Fragment schema (manifest.json in each plugin dir):
//   { "plugin": "@scope/name", "handler": "./handler.js", "tools": ToolDescriptor[] }
export function discoverPluginFragments(pluginDirs: string[]): PluginFragment[] {
  const out: PluginFragment[] = [];
  for (const dir of pluginDirs) {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    let frag: { plugin?: string; handler?: string; tools?: ToolDescriptor[] };
    try {
      frag = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue; // malformed fragment → skip, warn in --full (C1 error handling)
    }
    out.push({
      plugin: frag.plugin ?? dir,
      handlerModule: frag.handler ?? join(dir, "handler.js"),
      descriptors: Array.isArray(frag.tools) ? frag.tools : [],
    });
  }
  return out;
}

// Lazy-import a plugin handler module — only on dispatch of that command.
export async function loadPluginHandler(
  handlerModule: string,
): Promise<{ run: Handler } | null> {
  try {
    const mod = (await import(handlerModule)) as { run?: Handler };
    markPluginHandlerLoaded(handlerModule);
    return typeof mod.run === "function" ? { run: mod.run } : null;
  } catch {
    return null;
  }
}
