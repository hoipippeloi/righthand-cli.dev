import { makeEnvelope } from "../envelope.js";
import { footprintFor, resolveActiveScope } from "../footprint.js";
import { planRevert, revertTo } from "../journal.js";
import { confirm } from "../confirm.js";
const descriptor = {
  name: "rollback",
  description: "Undo changes: [--steps N] [--to <change-id>] [--dry-run] [--scope]",
  inputSchema: {
    type: "object",
    properties: {
      steps: { type: "number", default: 1 },
      to: { type: "string", description: "change-id to roll back to" },
      scope: { type: "string", enum: ["project", "user"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true
};
function scopeFrom(ctx) {
  return ctx.flags.scope === "user" || ctx.flags.scope === "project" ? ctx.flags.scope : resolveActiveScope(ctx.flags);
}
const cli = {
  scope: true,
  args: {
    steps: { type: "string", description: "Undo last N changes (default 1)" },
    to: { type: "string", description: "change-id to roll back to" }
  }
};
async function run(ctx) {
  const scope = scopeFrom(ctx);
  const target = {
    to: ctx.args.to,
    steps: ctx.args.steps != null ? Number(ctx.args.steps) : void 0
  };
  if (ctx.flags["dry-run"]) {
    try {
      const plan = await planRevert(scope, target);
      return makeEnvelope({
        command: "rollback",
        summary: `would restore ${plan.files.length} file(s) (to before ${plan.change_id})`,
        result: { dry_run: true, files: plan.files, target_change: plan.change_id, scope }
      });
    } catch (e) {
      return makeEnvelope({
        command: "rollback",
        ok: false,
        summary: e.message
      });
    }
  }
  const ok = await confirm(ctx, `Rollback ${scope} footprint? This restores files to a prior snapshot.`);
  if (!ok) {
    return makeEnvelope({
      command: "rollback",
      ok: false,
      summary: "rollback requires --yes (or interactive confirm)",
      needs_human: "destructive op: pass --yes to apply, or run with --dry-run first"
    });
  }
  try {
    const r = await revertTo(scope, target, `rollback (${scope})`);
    const fp = footprintFor(scope);
    return makeEnvelope({
      command: "rollback",
      summary: `restored ${r.written.length} file(s), removed ${r.deleted.length}`,
      result: { written: r.written, deleted: r.deleted, scope, footprint: fp.root },
      meta: { change_id: r.change_id }
    });
  } catch (e) {
    return makeEnvelope({ command: "rollback", ok: false, summary: e.message });
  }
}
export {
  cli,
  descriptor,
  run
};
