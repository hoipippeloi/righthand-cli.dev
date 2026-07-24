import { existsSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "./contracts.js";
import { resolveProvider, resolveApiKey } from "./llm.js";
import { loadConfig } from "./config.js";
import { footprintFor } from "./footprint.js";
import { listPlugins } from "./plugininstall.js";
import { hasBinary } from "./shell.js";
import { getMergedManifest } from "./manifest.js";
const WRAPPED_CLIS = ["gh", "kubectl", "terraform", "aws"];
async function runDoctor(opts = {}) {
  const config = opts.config ?? loadConfig();
  const checks = [];
  const isBun = typeof globalThis.Bun !== "undefined";
  const runtime = isBun ? "bun" : `node ${process.versions.node}`;
  checks.push({
    name: "runtime",
    status: "green",
    detail: `righthand ${VERSION} on ${runtime}`
  });
  const fp = footprintFor("project");
  const footprintExists = existsSync(fp.root);
  checks.push({
    name: "footprint",
    status: footprintExists ? "green" : "yellow",
    detail: footprintExists ? `project footprint present (${fp.root})` : "no project footprint \u2014 run `righthand init`"
  });
  const storeInit = footprintExists && existsSync(join(fp.root, ".git"));
  checks.push({
    name: "version-store",
    status: storeInit ? "green" : "yellow",
    detail: storeInit ? "rollback store initialized (.git present)" : footprintExists ? "footprint present but rollback store not initialized (run `righthand init`)" : "no project footprint \u2014 run `righthand init`"
  });
  const providerEntries = Object.entries(config.providers);
  if (providerEntries.length === 0) {
    checks.push({
      name: "providers",
      status: "red",
      detail: "no LLM provider configured \u2014 build/research/llm unavailable"
    });
  } else {
    for (const [name, provider] of providerEntries) {
      const key = resolveApiKey(provider);
      checks.push({
        name: `provider:${name}`,
        status: key ? "green" : "yellow",
        detail: key ? `${provider.type} provider resolvable` : `provider '${name}' configured but no API key resolved`
      });
    }
  }
  if (providerEntries.length > 0) {
    if (!config.defaults.provider) {
      checks.push({
        name: "default-provider",
        status: "yellow",
        detail: "no default provider set \u2014 set config.defaults.provider"
      });
    } else {
      try {
        resolveProvider(config);
        checks.push({
          name: "default-provider",
          status: "green",
          detail: `default provider: ${config.defaults.provider}`
        });
      } catch {
        checks.push({
          name: "default-provider",
          status: "yellow",
          detail: `configured default '${config.defaults.provider}' does not resolve`
        });
      }
    }
  }
  const lister = opts.listPlugins ?? ((scope) => listPlugins(scope, config.plugins));
  const installed = [];
  for (const scope of ["project", "user"]) {
    for (const p of lister(scope)) installed.push(p);
  }
  const missingManifest = installed.filter((p) => !p.hasManifest);
  checks.push({
    name: "plugins",
    status: missingManifest.length === 0 ? "green" : "yellow",
    detail: installed.length === 0 ? "no plugins installed" : missingManifest.length === 0 ? `${installed.length} plugin(s) healthy` : `${missingManifest.length}/${installed.length} plugin(s) missing manifest.json: ${missingManifest.map((p) => p.name).join(", ")}`
  });
  const hb = opts.hasBinary ?? ((bin) => hasBinary(bin));
  for (const bin of WRAPPED_CLIS) {
    const present = hb(bin);
    checks.push({
      name: `cli:${bin}`,
      status: present ? "green" : "yellow",
      detail: present ? `${bin} available` : `${bin} not found (optional \u2014 disables related ops commands)`
    });
  }
  let capCount = 0;
  try {
    const descs = await getMergedManifest();
    capCount = descs.filter(
      (d) => Array.isArray(d.capabilities) && d.capabilities.length > 0
    ).length;
  } catch {
    capCount = 0;
  }
  const allow = config.permissions.allow ?? [];
  checks.push({
    name: "capabilities",
    status: capCount > 0 && allow.length === 0 ? "yellow" : "green",
    detail: capCount > 0 ? `${capCount} command(s) declare capabilities; ${allow.length} grant(s) in permissions.allow` : "no commands declare capabilities"
  });
  const overall = checks.some((c) => c.status === "red") ? "red" : checks.some((c) => c.status === "yellow") ? "yellow" : "green";
  return { overall, checks };
}
export {
  runDoctor
};
