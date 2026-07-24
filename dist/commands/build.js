import { buildCommand } from "../selfbuilder.js";
import { makeEnvelope } from "../envelope.js";
const descriptor = {
  name: "build",
  description: 'Have the LLM generate + smoke-test + install a new command: `righthand build "<what it should do>"`',
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "What the new command should do (natural language)"
      },
      scope: { type: "string", enum: ["project", "user"], default: "project" },
      name: {
        type: "string",
        description: "Command name (kebab-case); derived from the description if omitted"
      },
      provider: { type: "string", description: "LLM provider name (default: config.defaults.provider)" }
    },
    required: ["description"],
    additionalProperties: false
  },
  plugin: "@righthand/core",
  capabilities: ["fs:write", "net:llm"],
  costTier: "expensive",
  mutates: true
};
const cli = {
  scope: true,
  args: {
    description: { type: "positional", description: "What the new command should do (natural language)" },
    name: { type: "string", description: "Command name (kebab-case); derived if omitted" },
    provider: { type: "string", description: "LLM provider name" }
  }
};
async function run(ctx) {
  const description = ctx.args.description ?? "";
  if (!description) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: 'description is required: `righthand build "<what it should do>"`'
    });
  }
  const scope = ctx.flags.scope === "user" ? "user" : "project";
  const name = ctx.args.name || void 0;
  const provider = ctx.flags.provider ?? ctx.args.provider;
  return buildCommand({
    description,
    scope,
    name,
    yes: ctx.flags.yes === true,
    dryRun: ctx.flags["dry-run"] === true,
    config: ctx.config,
    provider
  });
}
export {
  cli,
  descriptor,
  run
};
