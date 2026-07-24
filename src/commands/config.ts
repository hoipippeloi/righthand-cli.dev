import { makeEnvelope } from "../envelope.ts";
import {
  loadConfig,
  readScopedConfig,
  writeScopedConfig,
  setConfigKey,
  redactConfig,
  DEFAULT_CONFIG,
} from "../config.ts";
import { footprintFor, resolveActiveScope, type Scope } from "../footprint.ts";
import { journal } from "../journal.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "config",
  description: "Read/edit layered config: get <key> | set <key> <value> | list",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["get", "set", "list"] },
      key: { type: "string" },
      value: { type: "string" },
      scope: { type: "string", enum: ["project", "user"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
};

function scopeFrom(ctx: CommandContext): Scope {
  const s = ctx.flags.scope;
  if (s === "user" || s === "project") return s;
  return resolveActiveScope(ctx.flags);
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]),
    obj,
  );
}

function fmt(v: unknown): string {
  if (v === undefined) return "<unset>";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string) ?? "list";
  const scope = scopeFrom(ctx);

  if (action === "get") {
    const key = ctx.args.key as string | undefined;
    if (!key) {
      return makeEnvelope({ command: "config", ok: false, summary: "config get requires <key>" });
    }
    const base = ctx.flags.scope
      ? ({ ...DEFAULT_CONFIG, ...(readScopedConfig(scope) as object) } as typeof DEFAULT_CONFIG)
      : loadConfig();
    const value = getByPath(redactConfig(base), key);
    return makeEnvelope({
      command: "config",
      summary: `${key} = ${fmt(value)}`,
      result: { key, value, scope },
    });
  }

  if (action === "list") {
    return makeEnvelope({
      command: "config",
      summary: "config (apiKeys redacted)",
      result: { config: redactConfig(loadConfig()) },
    });
  }

  if (action === "set") {
    const key = ctx.args.key as string | undefined;
    const value = ctx.args.value as string | undefined;
    if (!key || value === undefined) {
      return makeEnvelope({ command: "config", ok: false, summary: "config set requires <key> <value>" });
    }
    if (ctx.flags["dry-run"]) {
      return makeEnvelope({
        command: "config",
        summary: `would set ${key}=${value} (${scope})`,
        result: { key, value, scope, dry_run: true },
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
      meta: { change_id: id },
    });
  }

  return makeEnvelope({ command: "config", ok: false, summary: `unknown config action: ${action}` });
}
