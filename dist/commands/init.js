import { existsSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.js";
import {
  defaultProjectConfig,
  readScopedConfig
} from "../config.js";
import { ensureFootprintDirs, footprintFor } from "../footprint.js";
import { ensureStore } from "../versionstore.js";
import { journal } from "../journal.js";
const descriptor = {
  name: "init",
  description: "Initialize a project footprint (./.righthand) with defaults",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Copy config + plugins from another project" },
      scope: { type: "string", enum: ["project", "user"], default: "project" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true
};
const cli = {
  scope: true,
  args: { from: { type: "string", description: "Copy config + plugins from another project path" } }
};
async function run(ctx) {
  const scope = ctx.flags.scope === "user" ? "user" : "project";
  const from = ctx.args.from;
  const fp = footprintFor(scope);
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "init",
      summary: `would initialize footprint at ${fp.root}`,
      result: { footprint: fp.root, scope, dry_run: true }
    });
  }
  const created = [];
  const id = await journal(scope, "init", async () => {
    ensureFootprintDirs(fp);
    await ensureStore(fp);
    if (!existsSync(fp.configPath)) {
      if (from) {
        const src = join(from, ".righthand", "config.json");
        if (existsSync(src)) {
          copyFileSync(src, fp.configPath);
        } else {
          writeFileSync(fp.configPath, JSON.stringify(defaultProjectConfig(), null, 2) + "\n", "utf8");
        }
      } else {
        writeFileSync(fp.configPath, JSON.stringify(defaultProjectConfig(), null, 2) + "\n", "utf8");
      }
      created.push("config.json");
    }
    if (!existsSync(fp.historyPath)) {
      writeFileSync(fp.historyPath, "", "utf8");
      created.push("history.jsonl");
    }
  });
  let plugins = [];
  try {
    const cfg = readScopedConfig(scope);
    if (Array.isArray(cfg.plugins)) plugins = cfg.plugins;
  } catch {
  }
  const verb = created.length ? "initialized" : "already initialized";
  return makeEnvelope({
    command: "init",
    summary: `${verb}: ${fp.root}`,
    result: { footprint: fp.root, scope, created, plugins },
    meta: { change_id: id }
  });
}
export {
  cli,
  descriptor,
  run
};
