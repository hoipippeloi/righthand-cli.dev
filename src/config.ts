// Layered config (C9): defaults < user < project < env (env wins).
// Deep-ish merge so providers/plugins/permissions compose across layers instead
// of the later layer clobbering the earlier one.
import type { Config, Provider } from "./contracts.ts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { userRoot, projectRoot, footprintFor, type Scope } from "./footprint.ts";
import { loadDotEnv } from "./dotenv.ts";

export const DEFAULT_CONFIG: Config = {
  providers: {},
  plugins: [],
  permissions: { allow: [], deny: [], auto_confirm_destructive: false },
  defaults: { output: "summary", history_max: 10000 },
};

// A minimal config written by `init` — safe defaults, no credentials.
export function defaultProjectConfig(): Config {
  return {
    providers: {},
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10000 },
  };
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Merge a layer into the accumulator (mutates acc). Later layer wins per-field.
function mergeLayer(acc: Config, layer: Record<string, unknown>): void {
  if (layer.providers && typeof layer.providers === "object") {
    for (const [name, p] of Object.entries(layer.providers as Record<string, unknown>)) {
      if (!p || typeof p !== "object") continue;
      acc.providers[name] = { ...(acc.providers[name] ?? {}), ...(p as Provider) };
    }
  }
  if (Array.isArray(layer.plugins)) {
    const byName = new Map(acc.plugins.map((p) => [p.name, p]));
    for (const p of layer.plugins as Array<{ name: string; version?: string }>) {
      if (!p?.name) continue;
      byName.set(p.name, { ...(byName.get(p.name) ?? {}), ...p });
    }
    acc.plugins = [...byName.values()];
  }
  if (layer.permissions && typeof layer.permissions === "object") {
    const perm = layer.permissions as Partial<Config["permissions"]>;
    if (Array.isArray(perm.allow)) {
      acc.permissions.allow = [...new Set([...acc.permissions.allow, ...perm.allow])];
    }
    if (Array.isArray(perm.deny)) {
      acc.permissions.deny = [...new Set([...acc.permissions.deny, ...perm.deny])];
    }
    if (typeof perm.auto_confirm_destructive === "boolean") {
      acc.permissions.auto_confirm_destructive = perm.auto_confirm_destructive;
    }
  }
  if (layer.defaults && typeof layer.defaults === "object") {
    acc.defaults = { ...acc.defaults, ...(layer.defaults as Partial<Config["defaults"]>) };
  }
}

// RIGHTHAND_PROVIDERS__<NAME>__<FIELD> snake/camel map for known provider fields.
const PROVIDER_FIELD: Record<string, string> = {
  API_KEY: "apiKey",
  BASE_URL: "baseURL",
  BASEURL: "baseURL",
  MODEL: "model",
  TYPE: "type",
};

function applyEnv(cfg: Config): void {
  const out = process.env.RIGHTHAND_DEFAULTS__OUTPUT;
  if (out === "summary" || out === "full") cfg.defaults.output = out;
  const prov = process.env.RIGHTHAND_DEFAULTS__PROVIDER;
  if (prov) cfg.defaults.provider = prov;
  const hm = process.env.RIGHTHAND_DEFAULTS__HISTORY_MAX;
  if (hm && /^\d+$/.test(hm)) cfg.defaults.history_max = Number(hm);
  const acd = process.env.RIGHTHAND_PERMISSIONS__AUTO_CONFIRM_DESTRUCTIVE;
  if (acd === "true") cfg.permissions.auto_confirm_destructive = true;
  if (acd === "false") cfg.permissions.auto_confirm_destructive = false;
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("RIGHTHAND_PROVIDERS__") || v === undefined) continue;
    const rest = k.slice("RIGHTHAND_PROVIDERS__".length).split("__");
    if (rest.length < 2) continue;
    const name = rest[0].toLowerCase();
    const fieldRaw = rest.slice(1).join("_").toUpperCase();
    const field = PROVIDER_FIELD[fieldRaw] ?? fieldRaw.toLowerCase();
    const existing = (cfg.providers[name] ?? {}) as Provider;
    const merged = { ...existing, type: existing.type ?? "openai-compatible" } as Provider;
    (merged as Record<string, unknown>)[field] = v;
    cfg.providers[name] = merged;
  }
}

export function loadConfig(
  opts: { projectRoot?: string; userRoot?: string } = {},
): Config {
  const uRoot = opts.userRoot ?? userRoot();
  const pRoot = opts.projectRoot ?? projectRoot();
  // Load .env (user then project; real process.env always wins) BEFORE merging
  // so `env:` provider refs (apiKey/baseURL/model) resolve from it.
  loadDotEnv(join(uRoot, ".env"));
  loadDotEnv(join(pRoot, ".env"));
  const merged: Config = {
    providers: {},
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { ...DEFAULT_CONFIG.defaults },
  };
  mergeLayer(merged, readJsonSafe(join(uRoot, "config.json")) ?? {});
  mergeLayer(merged, readJsonSafe(join(pRoot, ".righthand", "config.json")) ?? {});
  applyEnv(merged);
  return merged;
}

// Read ONE scope's raw config object (for `config get/set --scope`). Returns
// {} when the file is absent (not an error).
export function readScopedConfig(scope: Scope): Record<string, unknown> {
  return readJsonSafe(footprintFor(scope).configPath) ?? {};
}

export function writeScopedConfig(scope: Scope, obj: Record<string, unknown>): void {
  const fp = footprintFor(scope);
  mkdirSync(dirname(fp.configPath), { recursive: true });
  writeFileSync(fp.configPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// Set a dotted key path (e.g. "providers.default.model") on a scope's config.
// Returns the updated object. Throws on an invalid path (caller maps to exit 2).
export function setConfigKey(
  scope: Scope,
  dottedPath: string,
  value: string,
): Record<string, unknown> {
  const obj = readScopedConfig(scope);
  const parts = dottedPath.split(".");
  if (parts.length === 0 || parts.some((p) => !p)) {
    throw new Error(`invalid config key: ${dottedPath}`);
  }
  let node: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = node[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      node[k] = {} as Record<string, unknown>;
    }
    node = node[k] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  node[leaf] = coerceValue(value);
  return obj;
}

// "true"/"false" -> bool, digits -> number, JSON array/object -> parsed, else string.
function coerceValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith("{") && v.endsWith("}"))) {
    try { return JSON.parse(v); } catch { /* not valid JSON — fall through to string */ }
  }
  return v;
}

// --- Redaction (bar #4: never emit resolved credential values) ---

// apiKey using indirection (env:/keychain:) is a REFERENCE — safe to show.
// A plaintext apiKey is a secret — redact it.
export function redactProvider(p: Provider): Provider {
  if (p.apiKey && !/^(env:|keychain:)/.test(p.apiKey)) {
    return { ...p, apiKey: "<redacted>" };
  }
  return { ...p };
}

export function redactConfig(cfg: Config): Config {
  const providers: Record<string, Provider> = {};
  for (const [k, v] of Object.entries(cfg.providers)) providers[k] = redactProvider(v);
  return { ...cfg, providers };
}
