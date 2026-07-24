// C8.5 — Admin/infra ops domain. `admin env [--name <var>]`: reads process.env
// (+ project .env if present). NEVER prints secret values — keys + set-ness +
// a fully masked value only. capabilities: fs:read (reads .env, not exec).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "admin",
  description: "Admin/infra: env [--name <var>] — keys + set-ness only; values fully redacted",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["env"] },
      name: { type: "string", description: "Specific var to check" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: ["fs:read"],
};

export const cli = {
  args: {
    action: { type: "positional", description: "env", required: false },
    name: { type: "string", description: "Specific var name to check" },
  },
};

// A .env value is NEVER emitted verbatim. We reveal only a fixed-length mask
// and the length category, so the caller knows it's set + roughly sized without
// ever seeing the secret (R3 / credential-isolation bar).
export function maskValue(v: string): string {
  if (!v) return "<empty>";
  return "•".repeat(Math.min(v.length, 8));
}

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// process.env wins over .env. Reads ./.env relative to cwd when present.
function loadEnv(cwd: string = process.cwd()): Record<string, string> {
  const env: Record<string, string> = {};
  const dotenv = join(cwd, ".env");
  if (existsSync(dotenv)) {
    try {
      Object.assign(env, parseDotenv(readFileSync(dotenv, "utf8")));
    } catch {
      /* ignore unreadable .env */
    }
  }
  Object.assign(env, process.env as Record<string, string>);
  return env;
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "env";
  const name = (ctx.flags.name ?? ctx.args.name) as string | undefined;

  if (action !== "env") {
    return makeEnvelope({ command: "admin", ok: false, summary: `unknown admin action: ${action}` });
  }

  const env = loadEnv();

  if (name) {
    const set = name in env;
    return makeEnvelope({
      command: "admin",
      summary: `${name}: ${set ? "set" : "unset"}`,
      result: { name, set, value: set ? maskValue(env[name]) : null },
    });
  }

  const vars = Object.keys(env)
    .sort()
    .map((k) => ({ key: k, set: true, value: maskValue(env[k]) }));
  return makeEnvelope({
    command: "admin",
    summary: `${vars.length} env var(s) (values redacted)`,
    result: { vars },
  });
}
