import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { userRoot, projectRoot, footprintFor } from "./footprint.js";
import { loadDotEnv } from "./dotenv.js";
const DEFAULT_CONFIG = {
  providers: {},
  plugins: [],
  permissions: { allow: [], deny: [], auto_confirm_destructive: false },
  defaults: { output: "summary", history_max: 1e4 }
};
function defaultProjectConfig() {
  return {
    providers: {},
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 1e4 }
  };
}
function readJsonSafe(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function mergeLayer(acc, layer) {
  if (layer.providers && typeof layer.providers === "object") {
    for (const [name, p] of Object.entries(layer.providers)) {
      if (!p || typeof p !== "object") continue;
      acc.providers[name] = { ...acc.providers[name] ?? {}, ...p };
    }
  }
  if (Array.isArray(layer.plugins)) {
    const byName = new Map(acc.plugins.map((p) => [p.name, p]));
    for (const p of layer.plugins) {
      if (!p?.name) continue;
      byName.set(p.name, { ...byName.get(p.name) ?? {}, ...p });
    }
    acc.plugins = [...byName.values()];
  }
  if (layer.permissions && typeof layer.permissions === "object") {
    const perm = layer.permissions;
    if (Array.isArray(perm.allow)) {
      acc.permissions.allow = [.../* @__PURE__ */ new Set([...acc.permissions.allow, ...perm.allow])];
    }
    if (Array.isArray(perm.deny)) {
      acc.permissions.deny = [.../* @__PURE__ */ new Set([...acc.permissions.deny, ...perm.deny])];
    }
    if (typeof perm.auto_confirm_destructive === "boolean") {
      acc.permissions.auto_confirm_destructive = perm.auto_confirm_destructive;
    }
  }
  if (layer.defaults && typeof layer.defaults === "object") {
    acc.defaults = { ...acc.defaults, ...layer.defaults };
  }
}
const PROVIDER_FIELD = {
  API_KEY: "apiKey",
  BASE_URL: "baseURL",
  BASEURL: "baseURL",
  MODEL: "model",
  TYPE: "type"
};
function applyEnv(cfg) {
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
    if (!k.startsWith("RIGHTHAND_PROVIDERS__") || v === void 0) continue;
    const rest = k.slice("RIGHTHAND_PROVIDERS__".length).split("__");
    if (rest.length < 2) continue;
    const name = rest[0].toLowerCase();
    const fieldRaw = rest.slice(1).join("_").toUpperCase();
    const field = PROVIDER_FIELD[fieldRaw] ?? fieldRaw.toLowerCase();
    const existing = cfg.providers[name] ?? {};
    const merged = { ...existing, type: existing.type ?? "openai-compatible" };
    merged[field] = v;
    cfg.providers[name] = merged;
  }
}
function loadConfig(opts = {}) {
  const uRoot = opts.userRoot ?? userRoot();
  const pRoot = opts.projectRoot ?? projectRoot();
  loadDotEnv(join(uRoot, ".env"));
  loadDotEnv(join(pRoot, ".env"));
  const merged = {
    providers: {},
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { ...DEFAULT_CONFIG.defaults }
  };
  mergeLayer(merged, readJsonSafe(join(uRoot, "config.json")) ?? {});
  mergeLayer(merged, readJsonSafe(join(pRoot, ".righthand", "config.json")) ?? {});
  applyEnv(merged);
  return merged;
}
function readScopedConfig(scope) {
  return readJsonSafe(footprintFor(scope).configPath) ?? {};
}
function writeScopedConfig(scope, obj) {
  const fp = footprintFor(scope);
  mkdirSync(dirname(fp.configPath), { recursive: true });
  writeFileSync(fp.configPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function setConfigKey(scope, dottedPath, value) {
  const obj = readScopedConfig(scope);
  const parts = dottedPath.split(".");
  if (parts.length === 0 || parts.some((p) => !p)) {
    throw new Error(`invalid config key: ${dottedPath}`);
  }
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = node[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      node[k] = {};
    }
    node = node[k];
  }
  const leaf = parts[parts.length - 1];
  node[leaf] = coerceValue(value);
  return obj;
}
function coerceValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]") || v.startsWith("{") && v.endsWith("}")) {
    try {
      return JSON.parse(v);
    } catch {
    }
  }
  return v;
}
function redactProvider(p) {
  if (p.apiKey && !/^(env:|keychain:)/.test(p.apiKey)) {
    return { ...p, apiKey: "<redacted>" };
  }
  return { ...p };
}
function redactConfig(cfg) {
  const providers = {};
  for (const [k, v] of Object.entries(cfg.providers)) providers[k] = redactProvider(v);
  return { ...cfg, providers };
}
export {
  DEFAULT_CONFIG,
  defaultProjectConfig,
  loadConfig,
  readScopedConfig,
  redactConfig,
  redactProvider,
  setConfigKey,
  writeScopedConfig
};
