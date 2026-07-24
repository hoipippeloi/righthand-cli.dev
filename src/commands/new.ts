// C3 — Authoring & Scaffolder: `righthand new <name>` generates a starter
// command file into the footprint, journaled so it is rollback-able.
//
// Scope project -> ./.righthand/commands/<name>.ts
// Scope user    -> ~/.righthand/commands/<name>.ts
// Mutating command: owns its journaling (snapshot before/after), sets
// meta.change_id. Honors --dry-run and --force. See
// decisions/mutating-commands-own-their-journaling-not-a-dispatch-auto-w.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeEnvelope } from "../envelope.ts";
import { footprintFor, ensureFootprintDirs, type Scope } from "../footprint.ts";
import { journal } from "../journal.ts";
import { renderCommand, validateName } from "../scaffold.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "new",
  description: "Scaffold a starter command file into the footprint (C3 authoring)",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Command name (kebab-case)" },
      scope: { type: "string", enum: ["project", "user"], default: "project" },
      desc: { type: "string", description: "One-line command description" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true,
};

export const cli = {
  scope: true,
  args: {
    name: { type: "positional", description: "Command name (kebab-case)" },
    desc: { type: "string", description: "One-line command description" },
    force: { type: "boolean", description: "Overwrite an existing command file" },
  },
};

function commandPath(scope: Scope, name: string): string {
  return join(footprintFor(scope).root, "commands", `${name}.ts`);
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const name = ctx.args.name as string | undefined;
  const nameErr = validateName(name ?? "");
  if (nameErr) {
    return makeEnvelope({ command: "new", ok: false, summary: nameErr });
  }
  const scope: Scope = ctx.flags.scope === "user" ? "user" : "project";
  const desc = (ctx.args.desc as string) || "";
  const path = commandPath(scope, name);
  const content = renderCommand({ name, description: desc });

  if (existsSync(path) && !ctx.flags.force) {
    return makeEnvelope({
      command: "new",
      ok: false,
      summary: `refusing to overwrite ${path} (pass --force)`,
      needs_human: `command file exists: ${path}. Re-run with --force to overwrite.`,
    });
  }

  // Dry-run: show the would-be path + full content, mutate nothing.
  if (ctx.flags["dry-run"]) {
    return makeEnvelope({
      command: "new",
      summary: `would write ${path} (${content.length} bytes)`,
      result: { dry_run: true, path, scope, name, content },
    });
  }

  // Mutate inside a before/after snapshot pair (rollback-able).
  const fp = footprintFor(scope);
  const id = await journal(scope, `new ${name}`, () => {
    ensureFootprintDirs(fp);
    mkdirSync(join(fp.root, "commands"), { recursive: true });
    writeFileSync(path, content, "utf8");
  });

  // The scaffolded command is auto-discovered from the footprint commands dir
  // (discover.ts scans ./.righthand/commands + ~/.righthand/commands), so it is
  // immediately runnable + rollback-able. Return path + a snippet for review.
  const snippet = content.split("\n").slice(0, 8).join("\n");
  return makeEnvelope({
    command: "new",
    summary: `scaffolded ${name} -> ${path} (now discoverable; run 'righthand ${name}')`,
    result: { path, scope, name, snippet, bytes: content.length },
    meta: { change_id: id },
  });
}
