import { makeEnvelope } from "../envelope.js";
const descriptor = {
  name: "hello",
  description: "Demo command \u2014 greets a name; exercises envelope + exit codes",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name to greet" },
      "needs-human": { type: "boolean", default: false }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free"
};
const cli = {
  args: {
    name: { type: "positional", description: "Name to greet", required: false },
    "needs-human": { type: "boolean", description: "Force a human escalation (exit 3)" }
  }
};
async function run(ctx) {
  const name = ctx.args.name ?? "world";
  if (ctx.flags["needs-human"]) {
    return makeEnvelope({
      command: "hello",
      ok: false,
      summary: `would greet ${name} but needs confirmation`,
      needs_human: "demo: --needs-human forces a human escalation"
    });
  }
  return makeEnvelope({
    command: "hello",
    summary: `hello, ${name}!`,
    result: { greeted: name }
  });
}
export {
  cli,
  descriptor,
  run
};
