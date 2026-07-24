// C2 — Plugin install/list/remove helpers.
//
// npm-install a plugin package into the footprint plugins dir, read its
// manifest.json fragment (the discover.ts contract: {plugin, handler, tools}),
// and scan installed packages. The command layer (commands/plugins.ts) owns
// journaling/confirm/dry-run; this module owns the npm shell-out + disk reads.
//
// TEST SEAM: every npm call goes through `activeNpmRunner()`, which is
// `defaultNpmRunner` (real `npm` via spawnSync) unless a test injects a fake
// via setNpmRunnerForTest(). Mirrors src/shell.ts's Runner seam so tests never
// hit the network.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { footprintFor, type Scope } from "./footprint.ts";

// manifest.json fragment, per the discover.ts contract. Presence + valid JSON
// is what we check here (hasManifest); discover.ts does the real parsing.
export interface PluginManifest {
  plugin?: string;
  handler?: string;
  tools?: unknown[];
}

export interface InstalledPlugin {
  name: string;
  version?: string;
  hasManifest: boolean;
}

// --- npm runner seam (mirrors src/shell.ts) ---

export interface NpmRunnerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type NpmRunner = (
  bin: string,
  args: string[],
  opts?: { cwd?: string },
) => NpmRunnerResult;

// The production runner: spawnSync `npm`. A missing/non-zero npm is reported
// via `ok: false`, not a throw — the caller decides whether to abort.
export function defaultNpmRunner(
  bin: string,
  args: string[],
  opts: { cwd?: string } = {},
): NpmRunnerResult {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
  if (r.error) {
    return { ok: false, stdout: "", stderr: String(r.error.message) };
  }
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

let npmRunnerForTest: NpmRunner | null = null;

export function setNpmRunnerForTest(r: NpmRunner | null): void {
  npmRunnerForTest = r;
}

export function resetNpmRunnerForTest(): void {
  npmRunnerForTest = null;
}

export function activeNpmRunner(): NpmRunner {
  return npmRunnerForTest ?? defaultNpmRunner;
}

// --- layout + reads ---

export function nodeModulesDir(scope: Scope): string {
  return join(footprintFor(scope).pluginsDir, "node_modules");
}

export function packageDir(scope: Scope, name: string): string {
  return join(nodeModulesDir(scope), name);
}

// Read a package's manifest.json fragment. null if absent or malformed JSON.
export function readManifest(scope: Scope, name: string): PluginManifest | null {
  const p = join(packageDir(scope, name), "manifest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PluginManifest;
  } catch {
    return null;
  }
}

function readVersion(scope: Scope, name: string): string | undefined {
  const p = join(packageDir(scope, name), "package.json");
  if (!existsSync(p)) return undefined;
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

// "pkg@1.2.3" -> "pkg"; "@scope/pkg@1.2.3" -> "@scope/pkg"; "pkg" -> "pkg".
export function packageNameFromSpec(spec: string): string {
  if (spec.startsWith("@")) {
    const at = spec.indexOf("@", 1);
    return at >= 0 ? spec.slice(0, at) : spec;
  }
  const at = spec.indexOf("@");
  return at >= 0 ? spec.slice(0, at) : spec;
}

// --- mutating npm ops ---

export interface InstallResult {
  name: string;
  version?: string;
  hasManifest: boolean;
  manifestMissing: boolean;
}

// `npm install --prefix <pluginsDir> <pkgSpec>` then read back name/version/manifest.
export function installPlugin(
  scope: Scope,
  pkgSpec: string,
  runner: NpmRunner = activeNpmRunner(),
): { ran: NpmRunnerResult; installed: InstallResult } {
  const fp = footprintFor(scope);
  const ran = runner("npm", ["install", "--prefix", fp.pluginsDir, pkgSpec], {
    cwd: fp.pluginsDir,
  });
  const name = packageNameFromSpec(pkgSpec);
  const version = readVersion(scope, name);
  const manifest = readManifest(scope, name);
  return {
    ran,
    installed: {
      name,
      version,
      hasManifest: manifest !== null,
      manifestMissing: manifest === null,
    },
  };
}

export function uninstallPlugin(
  scope: Scope,
  name: string,
  runner: NpmRunner = activeNpmRunner(),
): NpmRunnerResult {
  const fp = footprintFor(scope);
  return runner("npm", ["uninstall", "--prefix", fp.pluginsDir, name], {
    cwd: fp.pluginsDir,
  });
}

// --- list (read-only) ---

// Scan <pluginsDir>/node_modules for installed packages and merge with the
// config.plugins list. Disk truth wins for version/hasManifest; config adds
// entries that are registered but not physically present (e.g. missing manifest,
// or pending reinstall). De-duplicated + sorted by name.
export function listPlugins(
  scope: Scope,
  configPlugins: Array<{ name: string; version?: string }> = [],
): InstalledPlugin[] {
  const byName = new Map<string, InstalledPlugin>();
  for (const p of scanDisk(scope)) byName.set(p.name, p);
  for (const c of configPlugins) {
    if (!byName.has(c.name)) {
      byName.set(c.name, { name: c.name, version: c.version, hasManifest: false });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function scanDisk(scope: Scope): InstalledPlugin[] {
  const nm = nodeModulesDir(scope);
  const out: InstalledPlugin[] = [];
  let top: string[];
  try {
    top = readdirSync(nm, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return out; // no node_modules yet
  }
  for (const name of top) {
    if (name.startsWith("@")) {
      // scoped package: node_modules/@scope/pkg/
      let subs: string[];
      try {
        subs = readdirSync(join(nm, name), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        subs = [];
      }
      for (const sub of subs) {
        const full = `${name}/${sub}`;
        out.push({
          name: full,
          version: readVersion(scope, full),
          hasManifest: readManifest(scope, full) !== null,
        });
      }
      continue;
    }
    out.push({
      name,
      version: readVersion(scope, name),
      hasManifest: readManifest(scope, name) !== null,
    });
  }
  return out;
}
