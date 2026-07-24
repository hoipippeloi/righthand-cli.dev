import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { footprintFor } from "./footprint.js";
function defaultNpmRunner(bin, args, opts = {}) {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    ...opts.cwd ? { cwd: opts.cwd } : {}
  });
  if (r.error) {
    return { ok: false, stdout: "", stderr: String(r.error.message) };
  }
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
let npmRunnerForTest = null;
function setNpmRunnerForTest(r) {
  npmRunnerForTest = r;
}
function resetNpmRunnerForTest() {
  npmRunnerForTest = null;
}
function activeNpmRunner() {
  return npmRunnerForTest ?? defaultNpmRunner;
}
function nodeModulesDir(scope) {
  return join(footprintFor(scope).pluginsDir, "node_modules");
}
function packageDir(scope, name) {
  return join(nodeModulesDir(scope), name);
}
function readManifest(scope, name) {
  const p = join(packageDir(scope, name), "manifest.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function readVersion(scope, name) {
  const p = join(packageDir(scope, name), "package.json");
  if (!existsSync(p)) return void 0;
  try {
    return JSON.parse(readFileSync(p, "utf8")).version;
  } catch {
    return void 0;
  }
}
function packageNameFromSpec(spec) {
  if (spec.startsWith("@")) {
    const at2 = spec.indexOf("@", 1);
    return at2 >= 0 ? spec.slice(0, at2) : spec;
  }
  const at = spec.indexOf("@");
  return at >= 0 ? spec.slice(0, at) : spec;
}
function installPlugin(scope, pkgSpec, runner = activeNpmRunner()) {
  const fp = footprintFor(scope);
  const ran = runner("npm", ["install", "--prefix", fp.pluginsDir, pkgSpec], {
    cwd: fp.pluginsDir
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
      manifestMissing: manifest === null
    }
  };
}
function uninstallPlugin(scope, name, runner = activeNpmRunner()) {
  const fp = footprintFor(scope);
  return runner("npm", ["uninstall", "--prefix", fp.pluginsDir, name], {
    cwd: fp.pluginsDir
  });
}
function listPlugins(scope, configPlugins = []) {
  const byName = /* @__PURE__ */ new Map();
  for (const p of scanDisk(scope)) byName.set(p.name, p);
  for (const c of configPlugins) {
    if (!byName.has(c.name)) {
      byName.set(c.name, { name: c.name, version: c.version, hasManifest: false });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function scanDisk(scope) {
  const nm = nodeModulesDir(scope);
  const out = [];
  let top;
  try {
    top = readdirSync(nm, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return out;
  }
  for (const name of top) {
    if (name.startsWith("@")) {
      let subs;
      try {
        subs = readdirSync(join(nm, name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        subs = [];
      }
      for (const sub of subs) {
        const full = `${name}/${sub}`;
        out.push({
          name: full,
          version: readVersion(scope, full),
          hasManifest: readManifest(scope, full) !== null
        });
      }
      continue;
    }
    out.push({
      name,
      version: readVersion(scope, name),
      hasManifest: readManifest(scope, name) !== null
    });
  }
  return out;
}
export {
  activeNpmRunner,
  defaultNpmRunner,
  installPlugin,
  listPlugins,
  nodeModulesDir,
  packageDir,
  packageNameFromSpec,
  readManifest,
  resetNpmRunnerForTest,
  setNpmRunnerForTest,
  uninstallPlugin
};
