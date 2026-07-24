import { makeEnvelope } from "../envelope.js";
import {
  loadConfig,
  readScopedConfig,
  writeScopedConfig,
  setConfigKey,
  redactConfig,
  DEFAULT_CONFIG
} from "../config.js";
import { footprintFor, resolveActiveScope } from "../footprint.js";
import { journal } from "../journal.js";
const descriptor = {
  name: "config",
  description: "Read/edit layered config: get <key> | set <key> <value> | list",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["get", "set", "list"] },
      key: { type: "string" },
      value: { type: "string" },
      scope: { type: "string", enum: ["project", "user"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free"
};
function scopeFrom(ctx) {
  const s = ctx.flags.scope;
  if (s === "user" || s === "project") return s;
  return resolveActiveScope(ctx.flags);
}
function getByPath(obj, path) {
  return path.split(".").reduce(
    (acc, k) => acc == null ? acc : acc[k],
    obj
  );
}
function fmt(v) {
  if (v === void 0) return "<unset>";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
async function run(ctx) {
  const action = ctx.args.action ?? "list";
  const scope = scopeFrom(ctx);
  if (action === "get") {
    const key = ctx.args.key;
    if (!key) {
      return makeEnvelope({ command: "config", ok: false, summary: "config get requires <key>" });
    }
    const base = ctx.flags.scope ? { ...DEFAULT_CONFIG, ...readScopedConfig(scope) } : loadConfig();
    const value = getByPath(redactConfig(base), key);
    return makeEnvelope({
      command: "config",
      summary: `${key} = ${fmt(value)}`,
      result: { key, value, scope }
    });
  }
  if (action === "list") {
    return makeEnvelope({
      command: "config",
      summary: "config (apiKeys redacted)",
      result: { config: redactConfig(loadConfig()) }
    });
  }
  if (action === "set") {
    const key = ctx.args.key;
    const value = ctx.args.value;
    if (!key || value === void 0) {
      return makeEnvelope({ command: "config", ok: false, summary: "config set requires <key> <value>" });
    }
    if (ctx.flags["dry-run"]) {
      return makeEnvelope({
        command: "config",
        summary: `would set ${key}=${value} (${scope})`,
        result: { key, value, scope, dry_run: true }
      });
    }
    const fp = footprintFor(scope);
    const id = await journal(scope, `config set ${key}=${value}`, () => {
      const updated = setConfigKey(scope, key, String(value));
      writeScopedConfig(scope, updated);
    });
    return makeEnvelope({
      command: "config",
      summary: `set ${key}=${value} (${scope})`,
      result: { key, value, scope, footprint: fp.root },
      meta: { change_id: id }
    });
  }
  return makeEnvelope({ command: "config", ok: false, summary: `unknown config action: ${action}` });
}
export {
  descriptor,
  run
};
