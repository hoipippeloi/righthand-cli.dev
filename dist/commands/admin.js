import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.js";
const descriptor = {
  name: "admin",
  description: "Admin/infra: env [--name <var>] \u2014 keys + set-ness only; values fully redacted",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["env"] },
      name: { type: "string", description: "Specific var to check" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: ["fs:read"]
};
const cli = {
  args: {
    action: { type: "positional", description: "env", required: false },
    name: { type: "string", description: "Specific var name to check" }
  }
};
function maskValue(v) {
  if (!v) return "<empty>";
  return "\u2022".repeat(Math.min(v.length, 8));
}
function parseDotenv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}
function loadEnv(cwd = process.cwd()) {
  const env = {};
  const dotenv = join(cwd, ".env");
  if (existsSync(dotenv)) {
    try {
      Object.assign(env, parseDotenv(readFileSync(dotenv, "utf8")));
    } catch {
    }
  }
  Object.assign(env, process.env);
  return env;
}
async function run(ctx) {
  const action = ctx.args.action ?? "env";
  const name = ctx.flags.name ?? ctx.args.name;
  if (action !== "env") {
    return makeEnvelope({ command: "admin", ok: false, summary: `unknown admin action: ${action}` });
  }
  const env = loadEnv();
  if (name) {
    const set = name in env;
    return makeEnvelope({
      command: "admin",
      summary: `${name}: ${set ? "set" : "unset"}`,
      result: { name, set, value: set ? maskValue(env[name]) : null }
    });
  }
  const vars = Object.keys(env).sort().map((k) => ({ key: k, set: true, value: maskValue(env[k]) }));
  return makeEnvelope({
    command: "admin",
    summary: `${vars.length} env var(s) (values redacted)`,
    result: { vars }
  });
}
export {
  cli,
  descriptor,
  maskValue,
  parseDotenv,
  run
};
