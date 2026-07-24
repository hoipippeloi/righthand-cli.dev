// C5 — Self-Recursive Self-Builder: `righthand build "<description>"`.
//
// The LLM writes a NEW command into righthand: generate -> validate ->
// smoke-test -> (confirm) -> install (journaled, rollback-able). costTier
// "expensive" so the dispatch approval gate requires --yes (the primary
// confirm); the buildCommand-level step-5 confirm shows the code when
// auto_confirm_destructive bypasses that gate. See .prds/righthand-cli/prd.md §C5.
import { buildCommand } from "../selfbuilder.ts";
import { makeEnvelope } from "../envelope.ts";
import type { Scope } from "../footprint.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "build",
  description: 'Have the LLM generate + smoke-test + install a new command: `righthand build "<what it should do>"`',
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "What the new command should do (natural language)",
      },
      scope: { type: "string", enum: ["project", "user"], default: "project" },
      name: {
        type: "string",
        description: "Command name (kebab-case); derived from the description if omitted",
      },
      provider: { type: "string", description: "LLM provider name (default: config.defaults.provider)" },
    },
    required: ["description"],
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  capabilities: ["fs:write", "net:llm"],
  costTier: "expensive",
  mutates: true,
};

export const cli = {
  scope: true,
  args: {
    description: { type: "positional", description: "What the new command should do (natural language)" },
    name: { type: "string", description: "Command name (kebab-case); derived if omitted" },
    provider: { type: "string", description: "LLM provider name" },
  },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const description = (ctx.args.description as string | undefined) ?? "";
  if (!description) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: 'description is required: `righthand build "<what it should do>"`',
    });
  }
  const scope: Scope = ctx.flags.scope === "user" ? "user" : "project";
  const name = (ctx.args.name as string | undefined) || undefined;
  const provider =
    (ctx.flags.provider as string | undefined) ?? (ctx.args.provider as string | undefined);
  return buildCommand({
    description,
    scope,
    name,
    yes: ctx.flags.yes === true,
    dryRun: ctx.flags["dry-run"] === true,
    config: ctx.config,
    provider,
  });
}
