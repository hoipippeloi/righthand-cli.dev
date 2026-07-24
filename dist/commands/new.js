import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.js";
import { footprintFor, ensureFootprintDirs } from "../footprint.js";
import { journal } from "../journal.js";
import { renderCommand, validateName } from "../scaffold.js";
const descriptor = {
  name: "new",
  description: "Scaffold a starter command file into the footprint (C3 authoring)",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Command name (kebab-case)" },
      scope: { type: "string", enum: ["project", "user"], default: "project" },
      desc: { type: "string", description: "One-line command description" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true
};
const cli = {
  scope: true,
  args: {
    name: { type: "positional", description: "Command name (kebab-case)" },
    desc: { type: "string", description: "One-line command description" },
    force: { type: "boolean", description: "Overwrite an existing command file" }
  }
};
function commandPath(scope, name) {
  return join(footprintFor(scope).root, "commands", `${name}.ts`);
}
async function run(ctx) {
  const name = ctx.args.name;
  const nameErr = validateName(name ?? "");
  if (nameErr) {
    return makeEnvelope({ command: "new", ok: false, summary: nameErr });
  }
  const scope = ctx.flags.scope === "user" ? "user" : "project";
  const desc = ctx.args.desc || "";
  const path = commandPath(scope, name);
  const content = renderCommand({ name, description: desc });
  if (existsSync(path) && !ctx.flags.force) {
    return makeEnvelope({
      command: "new",
      ok: false,
      summary: `refusing to overwrite ${path} (pass --force)`,
      needs_human: `command file exists: ${path}. Re-run with --force to overwrite.`
    });
  }
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "new",
      summary: `would write ${path} (${content.length} bytes)`,
      result: { dry_run: true, path, scope, name, content }
    });
  }
  const fp = footprintFor(scope);
  const id = await journal(scope, `new ${name}`, () => {
    ensureFootprintDirs(fp);
    mkdirSync(join(fp.root, "commands"), { recursive: true });
    writeFileSync(path, content, "utf8");
  });
  const snippet = content.split("\n").slice(0, 8).join("\n");
  return makeEnvelope({
    command: "new",
    summary: `scaffolded ${name} -> ${path} (now discoverable; run 'righthand ${name}')`,
    result: { path, scope, name, snippet, bytes: content.length },
    meta: { change_id: id }
  });
}
export {
  cli,
  descriptor,
  run
};
