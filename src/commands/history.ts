import { makeEnvelope } from "../envelope.ts";
import { footprintFor, readHistory, resolveActiveScope } from "../footprint.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "history",
  description: "Read the append-only action log: [--last N] [--scope project|user]",
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
  args: { last: { type: "string", description: "Last N actions" } },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const scope =
    ctx.flags.scope === "user" || ctx.flags.scope === "project"
      ? ctx.flags.scope
      : resolveActiveScope(ctx.flags);
  const last = ctx.flags.last != null ? Number(ctx.flags.last) : 50;
  const rows = readHistory(footprintFor(scope), { last });
  const fp = footprintFor(scope);
  return makeEnvelope({
    command: "history",
    summary: `${rows.length} action(s) (${scope})`,
    result: { actions: rows, scope, history_path: fp.historyPath },
  });
}
