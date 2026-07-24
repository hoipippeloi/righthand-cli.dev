// C10 — `righthand doctor`: bounded health & integration diagnostics.
// Read-only, costTier free, declares no capabilities. Wraps src/doctor.ts's
// runDoctor() into the standard envelope. `--json` is a global flag (cli.ts),
// so this command takes no special args.
import { makeEnvelope } from "../envelope.ts";
import { runDoctor } from "../doctor.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "doctor",
  description: "Health & integration diagnostics — green/yellow/red per integration (C10)",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@righthand/core",
  costTier: "free",
};

export const cli = {};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const { overall, checks } = await runDoctor({ config: ctx.config });
  const red = checks.filter((c) => c.status === "red").length;
  const yellow = checks.filter((c) => c.status === "yellow").length;
  const summary =
    red > 0
      ? `${red} critical issue(s), ${yellow} warning(s)`
      : yellow > 0
        ? `${yellow} warning(s), no critical issues`
        : `all ${checks.length} checks passed`;
  return makeEnvelope({
    command: "doctor",
    summary,
    result: { overall, checks },
  });
}
