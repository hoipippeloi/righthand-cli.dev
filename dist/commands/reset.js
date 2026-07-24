import {
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  statSync
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { makeEnvelope } from "../envelope.js";
import { defaultProjectConfig } from "../config.js";
import { footprintFor, resolveActiveScope, ensureFootprintDirs } from "../footprint.js";
import { journal } from "../journal.js";
import { confirm } from "../confirm.js";
import { ulid } from "../ulid.js";
const descriptor = {
  name: "reset",
  description: "Factory-reset a footprint: plugins|config|history|all [--dry-run] [--yes]",
  inputSchema: {
    type: "object",
    properties: {
      target: { type: "string", enum: ["plugins", "config", "history", "all"], default: "all" },
      scope: { type: "string", enum: ["project", "user"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true
};
const TARGETS = /* @__PURE__ */ new Set(["plugins", "config", "history", "all"]);
function assertWithin(root, abs) {
  const r = root.endsWith(sep) ? root : root + sep;
  if (abs !== root && !abs.startsWith(r)) {
    throw new Error(`root guard: refusing to touch path outside footprint: ${abs}`);
  }
}
function listDirRel(root, dirRel, out) {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(dirRel);
    return;
  }
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    listDirRel(root, dirRel ? `${dirRel}/${e.name}` : e.name, out);
  }
}
function affectedRelpaths(fp, target) {
  const out = [];
  if ((target === "all" || target === "config") && existsSync(fp.configPath)) out.push("config.json");
  if ((target === "all" || target === "history") && existsSync(fp.historyPath)) out.push("history.jsonl");
  if (target === "all" || target === "plugins") {
    listDirRel(fp.root, "plugins", out);
    if (existsSync(fp.manifestPath)) out.push("manifest.json");
  }
  return out;
}
const cli = {
  scope: true,
  args: { target: { type: "positional", description: "plugins|config|history|all" } }
};
async function run(ctx) {
  const target = ctx.args.target ?? "all";
  if (!TARGETS.has(target)) {
    return makeEnvelope({
      command: "reset",
      ok: false,
      summary: `unknown reset target: ${target} (plugins|config|history|all)`
    });
  }
  const scope = ctx.flags.scope === "user" || ctx.flags.scope === "project" ? ctx.flags.scope : resolveActiveScope(ctx.flags);
  const fp = footprintFor(scope);
  ensureFootprintDirs(fp);
  const affected = affectedRelpaths(fp, target);
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "reset",
      summary: `would reset ${target} (${affected.length} item(s))`,
      result: { dry_run: true, target, files: affected, scope, footprint: fp.root }
    });
  }
  const ok = await confirm(ctx, `Factory-reset '${target}' in ${scope} footprint (${fp.root})?`);
  if (!ok) {
    return makeEnvelope({
      command: "reset",
      ok: false,
      summary: "reset requires --yes (or interactive confirm)",
      needs_human: "destructive op: pass --yes to apply, or run with --dry-run first"
    });
  }
  let undoDir = "";
  const id = await journal(scope, `reset ${target}`, () => {
    const stamp = ulid();
    undoDir = join(fp.resetsDir, stamp);
    mkdirSync(undoDir, { recursive: true });
    const copied = [];
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
      "utf8"
    );
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
    meta: { change_id: id }
  });
}
export {
  cli,
  descriptor,
  run
};
