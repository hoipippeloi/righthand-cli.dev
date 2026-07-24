// C2 — `righthand plugins install|list|remove <pkg> [--scope project|user]`.
//
// install: npm-installs the package into the footprint plugins dir, reads its
//   manifest.json fragment, and records {name,version} in config.plugins.
//   Missing manifest -> warn (still register the name).
// list: merges config.plugins + a scan of pluginsDir/node_modules.
// remove: npm-uninstalls + drops the entry from config.plugins.
//
// Mutating ops (install/remove) own their journaling (snapshot before/after),
// honor --dry-run, and confirm via src/confirm.ts — see
// decisions/mutating-commands-own-their-journaling-not-a-dispatch-auto-w.
// List is read-only. npm calls go through plugininstall.ts's NpmRunner seam.
import { makeEnvelope } from "../envelope.ts";
import {
  footprintFor,
  resolveActiveScope,
  ensureFootprintDirs,
  type Scope,
  type Footprint,
} from "../footprint.ts";
import { readScopedConfig, writeScopedConfig } from "../config.ts";
import { journal } from "../journal.ts";
import { confirm } from "../confirm.ts";
import {
  installPlugin,
  uninstallPlugin,
  listPlugins,
  type InstalledPlugin,
} from "../plugininstall.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "plugins",
  description: "Manage plugins: install|list|remove [--scope project|user] (C2)",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["install", "list", "remove"] },
      pkg: { type: "string", description: "package spec (install) / name (remove)" },
      scope: { type: "string", enum: ["project", "user"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true,
};

export const cli = {
  scope: true,
  args: {
    action: { type: "positional", description: "install|list|remove (default: list)" },
    pkg: { type: "positional", description: "package spec (install) / name (remove)" },
  },
};

const ACTIONS = new Set(["install", "list", "remove"]);

function scopeFrom(ctx: CommandContext): Scope {
  return ctx.flags.scope === "user" || ctx.flags.scope === "project"
    ? ctx.flags.scope
    : resolveActiveScope(ctx.flags);
}

// Distinguish an npm failure (-> fail envelope; the journaled mutate is
// abandoned as an incomplete before/after pair) from other throws.
class PluginNpmError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PluginNpmError";
  }
}

type PluginEntry = { name: string; version?: string };

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "list";
  if (!ACTIONS.has(action)) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: `unknown action: ${action} (install|list|remove)`,
    });
  }
  const scope = scopeFrom(ctx);
  const fp = footprintFor(scope);

  if (action === "list") {
    const cfg = readScopedConfig(scope);
    const cfgPlugins: PluginEntry[] = Array.isArray(cfg.plugins)
      ? (cfg.plugins as PluginEntry[])
      : [];
    const installed = listPlugins(scope, cfgPlugins);
    return makeEnvelope({
      command: "plugins",
      summary: `${installed.length} plugin(s) in ${scope} footprint`,
      result: { installed, scope, footprint: fp.root },
    });
  }

  const pkgSpec = ctx.args.pkg as string | undefined;
  if (!pkgSpec) {
    const what = action === "install" ? "spec" : "name";
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: `plugins ${action} requires a package ${what}`,
    });
  }

  if (action === "install") return installFlow(ctx, scope, pkgSpec, fp);
  return removeFlow(ctx, scope, pkgSpec, fp);
}

// Upsert a {name,version?} entry (de-dupe by name). Returns a NEW array.
function upsertPlugin(plugins: PluginEntry[], name: string, version?: string): PluginEntry[] {
  const entry: PluginEntry = { name };
  if (version) entry.version = version;
  const idx = plugins.findIndex((p) => p.name === name);
  if (idx >= 0) {
    const out = [...plugins];
    out[idx] = entry;
    return out;
  }
  return [...plugins, entry];
}

async function installFlow(
  ctx: CommandContext,
  scope: Scope,
  pkgSpec: string,
  fp: Footprint,
): Promise<Envelope> {
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "plugins",
      summary: `would install ${pkgSpec} into ${fp.pluginsDir}`,
      result: { dry_run: true, action: "install", pkg: pkgSpec, scope, footprint: fp.root },
    });
  }

  const ok = await confirm(
    ctx,
    `Install plugin '${pkgSpec}' into ${scope} footprint (${fp.root})?`,
  );
  if (!ok) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: "plugins install requires --yes (or interactive confirm)",
      needs_human: "mutating op: pass --yes to apply, or run with --dry-run first",
    });
  }

  // npm install + config write land in ONE journaled change so rollback
  // restores both the files and the config entry. npm failure throws ->
  // mutate is abandoned as an incomplete pair (skipped by the change log);
  // run() maps it to a fail envelope.
  let info: InstalledPlugin | null = null;
  let id: string;
  try {
    id = await journal(scope, `plugins install ${pkgSpec}`, () => {
      ensureFootprintDirs(fp);
      const { ran, installed } = installPlugin(scope, pkgSpec);
      if (!ran.ok) {
        throw new PluginNpmError(ran.stderr || ran.stdout || "npm exited non-zero");
      }
      info = installed;
      const cfg = readScopedConfig(scope);
      const plugins = upsertPlugin(
        Array.isArray(cfg.plugins) ? (cfg.plugins as PluginEntry[]) : [],
        installed.name,
        installed.version,
      );
      writeScopedConfig(scope, { ...cfg, plugins });
    });
  } catch (e) {
    if (e instanceof PluginNpmError) {
      return makeEnvelope({
        command: "plugins",
        ok: false,
        summary: `npm install failed: ${e.message}`,
      });
    }
    throw e;
  }

  const installed = info as InstalledPlugin;
  const summary = installed.hasManifest
    ? `installed ${installed.name}${installed.version ? "@" + installed.version : ""}`
    : `installed ${installed.name} (no manifest.json)`;

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
      warning: installed.manifestMissing
        ? `${installed.name} has no manifest.json fragment — registered by name but not discoverable by 'righthand tools' until a manifest.json ({plugin,handler,tools}) ships in the package.`
        : null,
    },
    meta: { change_id: id },
  });
}

async function removeFlow(
  ctx: CommandContext,
  scope: Scope,
  pkgName: string,
  fp: Footprint,
): Promise<Envelope> {
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "plugins",
      summary: `would remove ${pkgName} from ${fp.pluginsDir} + config`,
      result: { dry_run: true, action: "remove", pkg: pkgName, scope, footprint: fp.root },
    });
  }

  const ok = await confirm(
    ctx,
    `Remove plugin '${pkgName}' from ${scope} footprint (${fp.root})?`,
  );
  if (!ok) {
    return makeEnvelope({
      command: "plugins",
      ok: false,
      summary: "plugins remove requires --yes (or interactive confirm)",
      needs_human: "mutating op: pass --yes to apply, or run with --dry-run first",
    });
  }

  // npm uninstall (best-effort) + config removal in one journaled change. The
  // config entry is the source of truth for "is this plugin registered", so a
  // flaky npm uninstall still yields a consistent config + list.
  let npmOk = true;
  let npmMsg = "";
  const id = await journal(scope, `plugins remove ${pkgName}`, () => {
    const ran = uninstallPlugin(scope, pkgName);
    npmOk = ran.ok;
    npmMsg = (ran.stderr || ran.stdout).trim();
    const cfg = readScopedConfig(scope);
    const plugins = (Array.isArray(cfg.plugins) ? (cfg.plugins as PluginEntry[]) : []).filter(
      (p) => p.name !== pkgName,
    );
    writeScopedConfig(scope, { ...cfg, plugins });
  });

  return makeEnvelope({
    command: "plugins",
    summary: npmOk
      ? `removed ${pkgName}`
      : `removed ${pkgName} from config (npm: ${npmMsg || "non-zero exit"})`,
    result: { action: "remove", name: pkgName, npmOk, scope, footprint: fp.root },
    meta: { change_id: id },
  });
}
