import { makeEnvelope } from "../envelope.ts";
import { footprintFor, resolveActiveScope } from "../footprint.ts";
import { planRevert, revertTo, type RevertTarget } from "../journal.ts";
import { confirm } from "../confirm.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "rollback",
  description: "Undo changes: [--steps N] [--to <change-id>] [--dry-run] [--scope]",
  inputSchema: {
    type: "object",
    properties: {
      steps: { type: "number", default: 1 },
      to: { type: "string", description: "change-id to roll back to" },
      scope: { type: "string", enum: ["project", "user"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  mutates: true,
};

function scopeFrom(ctx: CommandContext) {
  return ctx.flags.scope === "user" || ctx.flags.scope === "project"
    ? ctx.flags.scope
    : resolveActiveScope(ctx.flags);
}

export const cli = {
  scope: true,
  args: {
    steps: { type: "string", description: "Undo last N changes (default 1)" },
    to: { type: "string", description: "change-id to roll back to" },
  },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const scope = scopeFrom(ctx);
  const target: RevertTarget = {
    to: ctx.args.to as string | undefined,
    steps: ctx.args.steps != null ? Number(ctx.args.steps) : undefined,
  };

  // Dry-run: show the file diff a rollback would apply, mutate nothing.
  if (ctx.flags["dry-run"]) {
    try {
      const plan = await planRevert(scope, target);
      return makeEnvelope({
        command: "rollback",
        summary: `would restore ${plan.files.length} file(s) (to before ${plan.change_id})`,
        result: { dry_run: true, files: plan.files, target_change: plan.change_id, scope },
      });
    } catch (e) {
      return makeEnvelope({
        command: "rollback",
        ok: false,
        summary: (e as Error).message,
      });
    }
  }

  const ok = await confirm(ctx, `Rollback ${scope} footprint? This restores files to a prior snapshot.`);
  if (!ok) {
    return makeEnvelope({
      command: "rollback",
      ok: false,
      summary: "rollback requires --yes (or interactive confirm)",
      needs_human: "destructive op: pass --yes to apply, or run with --dry-run first",
    });
  }

  try {
    const r = await revertTo(scope, target, `rollback (${scope})`);
    const fp = footprintFor(scope);
    return makeEnvelope({
      command: "rollback",
      summary: `restored ${r.written.length} file(s), removed ${r.deleted.length}`,
      result: { written: r.written, deleted: r.deleted, scope, footprint: fp.root },
      meta: { change_id: r.change_id },
    });
  } catch (e) {
    return makeEnvelope({ command: "rollback", ok: false, summary: (e as Error).message });
  }
}
