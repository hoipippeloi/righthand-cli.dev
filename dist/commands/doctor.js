import { makeEnvelope } from "../envelope.js";
import { runDoctor } from "../doctor.js";
const descriptor = {
  name: "doctor",
  description: "Health & integration diagnostics \u2014 green/yellow/red per integration (C10)",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@righthand/core",
  costTier: "free"
};
const cli = {};
async function run(ctx) {
  const { overall, checks } = await runDoctor({ config: ctx.config });
  const red = checks.filter((c) => c.status === "red").length;
  const yellow = checks.filter((c) => c.status === "yellow").length;
  const summary = red > 0 ? `${red} critical issue(s), ${yellow} warning(s)` : yellow > 0 ? `${yellow} warning(s), no critical issues` : `all ${checks.length} checks passed`;
  return makeEnvelope({
    command: "doctor",
    summary,
    result: { overall, checks }
  });
}
export {
  cli,
  descriptor,
  run
};
