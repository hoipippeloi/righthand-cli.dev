import { makeEnvelope } from "../envelope.js";
import {
  footprintFor,
  resolveActiveScope,
  ensureFootprintDirs
} from "../footprint.js";
import { readScopedConfig, writeScopedConfig } from "../config.js";
import { journal } from "../journal.js";
import { confirm } from "../confirm.js";
import {
  installPlugin,
  uninstallPlugin,
  listPlugins
} from "../plugininstall.js";
const descriptor = {
  name: "plugins",
  description: "Manage plugins: install|list|remove [--scope project|user] (C2)",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["install", "list", "remove"] },
      pkg: { type: "string", description: "package spec (install) / name (remove)" },
      scope: { type: "string", enum: ["project", "user"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true
};
const cli = {
  scope: true,
  args: {
    action: { type: "positional", description: "install|list|remove (default: list)" },
    pkg: { type: "positional", description: "package spec (install) / name (remove)" }
  }
};
const ACTIONS = /* @__PURE__ */ new Set(["install", "list", "remove"]);
function scopeFrom(ctx) {
  return ctx.flags.scope === "user" || ctx.flags.scope === "project" ? ctx.flags.scope : resolveActiveScope(ctx.flags);
}
class PluginNpmError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "PluginNpmError";
  }
}
async function run(ctx) {
  const action = ctx.args.action ?? "list";
  if (!ACTIONS.has(action)) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: `unknown action: ${action} (install|list|remove)`
    });
  }
  const scope = scopeFrom(ctx);
  const fp = footprintFor(scope);
  if (action === "list") {
    const cfg = readScopedConfig(scope);
    const cfgPlugins = Array.isArray(cfg.plugins) ? cfg.plugins : [];
    const installed = listPlugins(scope, cfgPlugins);
    return makeEnvelope({
      command: "plugins",
      summary: `${installed.length} plugin(s) in ${scope} footprint`,
      result: { installed, scope, footprint: fp.root }
    });
  }
  const pkgSpec = ctx.args.pkg;
  if (!pkgSpec) {
    const what = action === "install" ? "spec" : "name";
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: `plugins ${action} requires a package ${what}`
    });
  }
  if (action === "install") return installFlow(ctx, scope, pkgSpec, fp);
  return removeFlow(ctx, scope, pkgSpec, fp);
}
function upsertPlugin(plugins, name, version) {
  const entry = { name };
  if (version) entry.version = version;
  const idx = plugins.findIndex((p) => p.name === name);
  if (idx >= 0) {
    const out = [...plugins];
    out[idx] = entry;
    return out;
  }
  return [...plugins, entry];
}
async function installFlow(ctx, scope, pkgSpec, fp) {
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "plugins",
      summary: `would install ${pkgSpec} into ${fp.pluginsDir}`,
      result: { dry_run: true, action: "install", pkg: pkgSpec, scope, footprint: fp.root }
    });
  }
  const ok = await confirm(
    ctx,
    `Install plugin '${pkgSpec}' into ${scope} footprint (${fp.root})?`
  );
  if (!ok) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: "plugins install requires --yes (or interactive confirm)",
      needs_human: "mutating op: pass --yes to apply, or run with --dry-run first"
    });
  }
  let info = null;
  let id;
  try {
    id = await journal(scope, `plugins install ${pkgSpec}`, () => {
      ensureFootprintDirs(fp);
      const { ran, installed: installed2 } = installPlugin(scope, pkgSpec);
      if (!ran.ok) {
        throw new PluginNpmError(ran.stderr || ran.stdout || "npm exited non-zero");
      }
      info = installed2;
      const cfg = readScopedConfig(scope);
      const plugins = upsertPlugin(
        Array.isArray(cfg.plugins) ? cfg.plugins : [],
        installed2.name,
        installed2.version
      );
      writeScopedConfig(scope, { ...cfg, plugins });
    });
  } catch (e) {
    if (e instanceof PluginNpmError) {
      return makeEnvelope({
        command: "plugins",
        ok: false,
        summary: `npm install failed: ${e.message}`
      });
    }
    throw e;
  }
  const installed = info;
  const summary = installed.hasManifest ? `installed ${installed.name}${installed.version ? "@" + installed.version : ""}` : `installed ${installed.name} (no manifest.json)`;
  return makeEnvelope({
    command: "plugins",
    summary,
    result: {
      action: "install",
      name: installed.name,
      version: installed.version,
      hasManifest: installed.hasManifest,
      scope,
      footprint: fp.root,
      warning: installed.manifestMissing ? `${installed.name} has no manifest.json fragment \u2014 registered by name but not discoverable by 'righthand tools' until a manifest.json ({plugin,handler,tools}) ships in the package.` : null
    },
    meta: { change_id: id }
  });
}
async function removeFlow(ctx, scope, pkgName, fp) {
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "plugins",
      summary: `would remove ${pkgName} from ${fp.pluginsDir} + config`,
      result: { dry_run: true, action: "remove", pkg: pkgName, scope, footprint: fp.root }
    });
  }
  const ok = await confirm(
    ctx,
    `Remove plugin '${pkgName}' from ${scope} footprint (${fp.root})?`
  );
  if (!ok) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: "plugins remove requires --yes (or interactive confirm)",
      needs_human: "mutating op: pass --yes to apply, or run with --dry-run first"
    });
  }
  let npmOk = true;
  let npmMsg = "";
  const id = await journal(scope, `plugins remove ${pkgName}`, () => {
    const ran = uninstallPlugin(scope, pkgName);
    npmOk = ran.ok;
    npmMsg = (ran.stderr || ran.stdout).trim();
    const cfg = readScopedConfig(scope);
    const plugins = (Array.isArray(cfg.plugins) ? cfg.plugins : []).filter(
      (p) => p.name !== pkgName
    );
    writeScopedConfig(scope, { ...cfg, plugins });
  });
  return makeEnvelope({
    command: "plugins",
    summary: npmOk ? `removed ${pkgName}` : `removed ${pkgName} from config (npm: ${npmMsg || "non-zero exit"})`,
    result: { action: "remove", name: pkgName, npmOk, scope, footprint: fp.root },
    meta: { change_id: id }
  });
}
export {
  cli,
  descriptor,
  run
};
