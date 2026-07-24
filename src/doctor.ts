// C10 — `righthand doctor`: health & integration diagnostics.
//
// One Check per integration → {name, status, detail}; overall rolls up
// red > yellow > green. Read-only: touches no state, declares no capabilities.
//
// TEST SEAMS: `hasBinary` + `listPlugins` are injectable (binary presence and
// the footprint vary per machine); `config` is passed in (tests never call
// loadConfig). The footprint + version-store checks read the filesystem with
// existsSync only (cheap, side-effect-free) — never mutating, never network.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VERSION, type Config } from "./contracts.ts";
import { resolveProvider, resolveApiKey } from "./llm.ts";
import { loadConfig } from "./config.ts";
import { footprintFor, type Scope } from "./footprint.ts";
import { listPlugins, type InstalledPlugin } from "./plugininstall.ts";
import { hasBinary } from "./shell.ts";
import { getMergedManifest } from "./manifest.ts";

export type CheckStatus = "green" | "yellow" | "red";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorResult {
  overall: CheckStatus;
  checks: Check[];
}

export interface DoctorOptions {
  config?: Config;
  // TEST SEAM: inject binary presence (tests don't need gh/kubectl/etc installed).
  hasBinary?: (bin: string) => boolean;
  // TEST SEAM: inject plugin listing (tests don't read the real footprint).
  listPlugins?: (scope: Scope) => InstalledPlugin[];
}

// Wrapped CLIs the C8 ops domains depend on. All OPTIONAL — a missing one only
// disables its matching ops domain, so absence is yellow, never red.
const WRAPPED_CLIS = ["gh", "kubectl", "terraform", "aws"];

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorResult> {
  const config = opts.config ?? loadConfig();
  const checks: Check[] = [];

  // --- runtime/version (always green; informational) ---
  const isBun = typeof (globalThis as Record<string, unknown>).Bun !== "undefined";
  const runtime = isBun ? "bun" : `node ${process.versions.node}`;
  checks.push({
    name: "runtime",
    status: "green",
    detail: `righthand ${VERSION} on ${runtime}`,
  });

  // --- project footprint exists? ---
  const fp = footprintFor("project");
  const footprintExists = existsSync(fp.root);
  checks.push({
    name: "footprint",
    status: footprintExists ? "green" : "yellow",
    detail: footprintExists
      ? `project footprint present (${fp.root})`
      : "no project footprint — run `righthand init`",
  });

  // --- version store healthy? ---
  // The footprint's .git dir is what versionstore.ts (ensureStore) creates; its
  // presence == isomorphic-git init'd. Cheap + side-effect-free (no git import).
  const storeInit = footprintExists && existsSync(join(fp.root, ".git"));
  checks.push({
    name: "version-store",
    status: storeInit ? "green" : "yellow",
    detail: storeInit
      ? "rollback store initialized (.git present)"
      : footprintExists
        ? "footprint present but rollback store not initialized (run `righthand init`)"
        : "no project footprint — run `righthand init`",
  });

  // --- providers: per-provider key resolvability + a red when zero configured ---
  const providerEntries = Object.entries(config.providers);
  if (providerEntries.length === 0) {
    checks.push({
      name: "providers",
      status: "red",
      detail: "no LLM provider configured — build/research/llm unavailable",
    });
  } else {
    for (const [name, provider] of providerEntries) {
      const key = resolveApiKey(provider);
      checks.push({
        name: `provider:${name}`,
        status: key ? "green" : "yellow",
        detail: key
          ? `${provider.type} provider resolvable`
          : `provider '${name}' configured but no API key resolved`,
      });
    }
  }

  // --- default provider set? (only meaningful when providers exist) ---
  if (providerEntries.length > 0) {
    if (!config.defaults.provider) {
      checks.push({
        name: "default-provider",
        status: "yellow",
        detail: "no default provider set — set config.defaults.provider",
      });
    } else {
      try {
        resolveProvider(config);
        checks.push({
          name: "default-provider",
          status: "green",
          detail: `default provider: ${config.defaults.provider}`,
        });
      } catch {
        checks.push({
          name: "default-provider",
          status: "yellow",
          detail: `configured default '${config.defaults.provider}' does not resolve`,
        });
      }
    }
  }

  // --- plugins: green if none or all have manifests, yellow per missing manifest ---
  const lister = opts.listPlugins ?? ((scope: Scope) => listPlugins(scope, config.plugins));
  const installed: InstalledPlugin[] = [];
  for (const scope of ["project", "user"] as Scope[]) {
    for (const p of lister(scope)) installed.push(p);
  }
  const missingManifest = installed.filter((p) => !p.hasManifest);
  checks.push({
    name: "plugins",
    status: missingManifest.length === 0 ? "green" : "yellow",
    detail:
      installed.length === 0
        ? "no plugins installed"
        : missingManifest.length === 0
          ? `${installed.length} plugin(s) healthy`
          : `${missingManifest.length}/${installed.length} plugin(s) missing manifest.json: ${missingManifest.map((p) => p.name).join(", ")}`,
  });

  // --- wrapped CLIs presence (optional integrations; never red) ---
  const hb = opts.hasBinary ?? ((bin: string) => hasBinary(bin));
  for (const bin of WRAPPED_CLIS) {
    const present = hb(bin);
    checks.push({
      name: `cli:${bin}`,
      status: present ? "green" : "yellow",
      detail: present
        ? `${bin} available`
        : `${bin} not found (optional — disables related ops commands)`,
    });
  }

  // --- capabilities hint: how many commands declare capabilities vs. allow grants ---
  // Informational: capability-declaring commands run denied unless permissions.allow
  // grants them. Yellow when such commands exist but nothing is allowed.
  let capCount = 0;
  try {
    const descs = await getMergedManifest();
    capCount = descs.filter(
      (d) => Array.isArray(d.capabilities) && d.capabilities.length > 0,
    ).length;
  } catch {
    capCount = 0; // discovery failure is non-fatal for a hint
  }
  const allow = config.permissions.allow ?? [];
  checks.push({
    name: "capabilities",
    status: capCount > 0 && allow.length === 0 ? "yellow" : "green",
    detail:
      capCount > 0
        ? `${capCount} command(s) declare capabilities; ${allow.length} grant(s) in permissions.allow`
        : "no commands declare capabilities",
  });

  const overall: CheckStatus = checks.some((c) => c.status === "red")
    ? "red"
    : checks.some((c) => c.status === "yellow")
      ? "yellow"
      : "green";

  return { overall, checks };
}
