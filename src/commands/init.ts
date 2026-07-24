import { existsSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.ts";
import {
  defaultProjectConfig,
  readScopedConfig,
  writeScopedConfig,
} from "../config.ts";
import { ensureFootprintDirs, footprintFor, type Scope } from "../footprint.ts";
import { ensureStore } from "../versionstore.ts";
import { journal } from "../journal.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "init",
  description: "Initialize a project footprint (./.righthand) with defaults",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Copy config + plugins from another project" },
      scope: { type: "string", enum: ["project", "user"], default: "project" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true,
};

export const cli = {
  scope: true,
  args: { from: { type: "string", description: "Copy config + plugins from another project path" } },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const scope: Scope = ctx.flags.scope === "user" ? "user" : "project";
  const from = ctx.args.from as string | undefined;
  const fp = footprintFor(scope);

  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "init",
      summary: `would initialize footprint at ${fp.root}`,
      result: { footprint: fp.root, scope, dry_run: true },
    });
  }

  const created: string[] = [];
  const id = await journal(scope, "init", async () => {
    ensureFootprintDirs(fp);
    await ensureStore(fp);

    // config.json: copy from source if --from, else defaults. Idempotent.
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

    // history.jsonl: seed empty so subsequent dispatches can append.
    if (!existsSync(fp.historyPath)) {
      writeFileSync(fp.historyPath, "", "utf8");
      created.push("history.jsonl");
    }
  });

  // Report current plugin list (from --from config, if any).
  let plugins: unknown[] = [];
  try {
    const cfg = readScopedConfig(scope);
    if (Array.isArray(cfg.plugins)) plugins = cfg.plugins;
  } catch {
    /* ignore */
  }

  const verb = created.length ? "initialized" : "already initialized";
  return makeEnvelope({
    command: "init",
    summary: `${verb}: ${fp.root}`,
    result: { footprint: fp.root, scope, created, plugins },
    meta: { change_id: id },
  });
}
