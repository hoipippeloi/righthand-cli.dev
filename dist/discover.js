import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markPluginHandlerLoaded } from "./registry.js";
import { footprintFor } from "./footprint.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(HERE, "commands");
async function loadCore() {
  const table = /* @__PURE__ */ new Map();
  let files = [];
  try {
    files = readdirSync(COMMANDS_DIR);
  } catch {
  }
  const entries = await Promise.all(
    files.filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.startsWith("_")).map(async (f) => {
      try {
        const mod = await import("./commands/" + f);
        return { mod };
      } catch {
        return { mod: {} };
      }
    })
  );
  for (const { mod } of entries) {
    if (!mod.descriptor || typeof mod.run !== "function") continue;
    table.set(mod.descriptor.name, {
      name: mod.descriptor.name,
      descriptor: mod.descriptor,
      run: mod.run,
      cli: mod.cli
    });
  }
  await loadFootprintCommands(table);
  return table;
}
async function loadFootprintCommands(table) {
  for (const scope of ["project", "user"]) {
    const dir = join(footprintFor(scope).root, "commands");
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".ts") || f.startsWith("_")) continue;
      const abs = join(dir, f);
      try {
        const mod = await import(pathToFileURL(abs).href);
        if (!mod.descriptor || typeof mod.run !== "function") continue;
        if (table.has(mod.descriptor.name)) continue;
        table.set(mod.descriptor.name, {
          name: mod.descriptor.name,
          descriptor: mod.descriptor,
          run: mod.run,
          cli: mod.cli
        });
      } catch (e) {
        process.stderr.write(
          `[righthand] warn: skipping footprint command ${abs}: ${e.message}
`
        );
      }
    }
  }
}
let coreTablePromise = null;
function discoverCore() {
  if (!coreTablePromise) coreTablePromise = loadCore();
  return coreTablePromise;
}
async function getCoreDescriptors() {
  const table = await discoverCore();
  return [...table.values()].map((c) => c.descriptor);
}
function resetDiscovery() {
  coreTablePromise = null;
}
function discoverPluginFragments(pluginDirs) {
  const out = [];
  for (const dir of pluginDirs) {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    let frag;
    try {
      frag = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    out.push({
      plugin: frag.plugin ?? dir,
      handlerModule: frag.handler ?? join(dir, "handler.js"),
      descriptors: Array.isArray(frag.tools) ? frag.tools : []
    });
  }
  return out;
}
async function loadPluginHandler(handlerModule) {
  try {
    const mod = await import(handlerModule);
    markPluginHandlerLoaded(handlerModule);
    return typeof mod.run === "function" ? { run: mod.run } : null;
  } catch {
    return null;
  }
}
export {
  discoverCore,
  discoverPluginFragments,
  getCoreDescriptors,
  loadPluginHandler,
  resetDiscovery
};
