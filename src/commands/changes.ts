import { makeEnvelope } from "../envelope.ts";
import { footprintFor, resolveActiveScope } from "../footprint.ts";
import { listChanges } from "../journal.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "changes",
  description: "List the change log (reversible righthand mutations): [--last N]",
  inputSchema: {
    type: "object",
    properties: {
      last: { type: "number", default: 50 },
      scope: { type: "string", enum: ["project", "user"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
};

export const cli = {
  scope: true,
  args: { last: { type: "string", description: "Last N changes" } },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const scope =
    ctx.flags.scope === "user" || ctx.flags.scope === "project"
      ? ctx.flags.scope
      : resolveActiveScope(ctx.flags);
  const last = ctx.flags.last != null ? Number(ctx.flags.last) : 50;
  const changes = await listChanges(scope, { last });
  const fp = footprintFor(scope);
  return makeEnvelope({
    command: "changes",
    summary: `${changes.length} change(s) (${scope})`,
    result: { changes, scope, footprint: fp.root },
  });
}
