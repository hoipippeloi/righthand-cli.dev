import {
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { makeEnvelope } from "../envelope.ts";
import { defaultProjectConfig } from "../config.ts";
import { footprintFor, resolveActiveScope, ensureFootprintDirs } from "../footprint.ts";
import { journal } from "../journal.ts";
import { confirm } from "../confirm.ts";
import { ulid } from "../ulid.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "reset",
  description: "Factory-reset a footprint: plugins|config|history|all [--dry-run] [--yes]",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string", enum: ["plugins", "config", "history", "all"], default: "all" },
      scope: { type: "string", enum: ["project", "user"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true,
};

const TARGETS = new Set(["plugins", "config", "history", "all"]);

// Hard root guard (bar #2): every path we touch must live under the footprint.
function assertWithin(root: string, abs: string): void {
  const r = root.endsWith(sep) ? root : root + sep;
  if (abs !== root && !abs.startsWith(r)) {
    throw new Error(`root guard: refusing to touch path outside footprint: ${abs}`);
  }
}

function listDirRel(root: string, dirRel: string, out: string[]): void {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(dirRel);
    return;
  }
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === ".git") continue; // never descend into the version store
    listDirRel(root, dirRel ? `${dirRel}/${e.name}` : e.name, out);
  }
}

function affectedRelpaths(fp: { root: string; configPath: string; historyPath: string; manifestPath: string; pluginsDir: string }, target: string): string[] {
  const out: string[] = [];
  if ((target === "all" || target === "config") && existsSync(fp.configPath)) out.push("config.json");
  if ((target === "all" || target === "history") && existsSync(fp.historyPath)) out.push("history.jsonl");
  if (target === "all" || target === "plugins") {
    listDirRel(fp.root, "plugins", out);
    if (existsSync(fp.manifestPath)) out.push("manifest.json");
  }
  return out;
}

export const cli = {
  scope: true,
  args: { target: { type: "positional", description: "plugins|config|history|all" } },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const target = (ctx.args.target as string) ?? "all";
  if (!TARGETS.has(target)) {
    return makeEnvelope({
      command: "reset",
      ok: false,
      summary: `unknown reset target: ${target} (plugins|config|history|all)`,
    });
  }
  const scope =
    ctx.flags.scope === "user" || ctx.flags.scope === "project"
      ? ctx.flags.scope
      : resolveActiveScope(ctx.flags);
  const fp = footprintFor(scope);
  ensureFootprintDirs(fp); // also creates ._resets/

  const affected = affectedRelpaths(fp, target);

  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "reset",
      summary: `would reset ${target} (${affected.length} item(s))`,
      result: { dry_run: true, target, files: affected, scope, footprint: fp.root },
    });
  }

  const ok = await confirm(ctx, `Factory-reset '${target}' in ${scope} footprint (${fp.root})?`);
  if (!ok) {
    return makeEnvelope({
      command: "reset",
      ok: false,
      summary: "reset requires --yes (or interactive confirm)",
      needs_human: "destructive op: pass --yes to apply, or run with --dry-run first",
    });
  }

  let undoDir = "";
  const id = await journal(scope, `reset ${target}`, () => {
    // 1. Undo manifest: copy everything affected into ._resets/<ulid>/ first.
    const stamp = ulid();
    undoDir = join(fp.resetsDir, stamp);
    mkdirSync(undoDir, { recursive: true });
    const copied: string[] = [];
    for (const rel of affected) {
      const src = join(fp.root, ...rel.split("/"));
      assertWithin(fp.root, src);
      if (!existsSync(src)) continue;
      const dest = join(undoDir, ...rel.split("/"));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copied.push(rel);
    }
    writeFileSync(
      join(undoDir, "index.json"),
      JSON.stringify({ ts: stamp, target, scope, files: copied, footprint: fp.root }, null, 2),
      "utf8",
    );

    // 2. Apply the reset. .git and ._resets are never touched.
    if (target === "all" || target === "plugins") {
      if (existsSync(fp.pluginsDir)) rmSync(fp.pluginsDir, { recursive: true, force: true });
      mkdirSync(fp.pluginsDir, { recursive: true });
      if (existsSync(fp.manifestPath)) rmSync(fp.manifestPath, { force: true });
    }
    if (target === "all" || target === "config") {
      writeFileSync(fp.configPath, JSON.stringify(defaultProjectConfig(), null, 2) + "\n", "utf8");
    }
    if (target === "all" || target === "history") {
      writeFileSync(fp.historyPath, "", "utf8");
    }
  });

  return makeEnvelope({
    command: "reset",
    summary: `reset ${target} (${affected.length} item(s))`,
    result: { target, reset: affected, undo_manifest: undoDir, scope, footprint: fp.root },
    meta: { change_id: id },
  });
}
