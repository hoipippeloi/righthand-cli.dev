import { makeEnvelope } from "../envelope.js";
import { footprintFor, readHistory, resolveActiveScope } from "../footprint.js";
const descriptor = {
  name: "history",
  description: "Read the append-only action log: [--last N] [--scope project|user]",
  inputSchema: {
    type: "object",
    properties: {
      last: { type: "number", default: 50 },
      scope: { type: "string", enum: ["project", "user"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free"
};
const cli = {
  scope: true,
  args: { last: { type: "string", description: "Last N actions" } }
};
async function run(ctx) {
  const scope = ctx.flags.scope === "user" || ctx.flags.scope === "project" ? ctx.flags.scope : resolveActiveScope(ctx.flags);
  const last = ctx.flags.last != null ? Number(ctx.flags.last) : 50;
  const rows = readHistory(footprintFor(scope), { last });
  const fp = footprintFor(scope);
  return makeEnvelope({
    command: "history",
    summary: `${rows.length} action(s) (${scope})`,
    result: { actions: rows, scope, history_path: fp.historyPath }
  });
}
export {
  cli,
  descriptor,
  run
};
