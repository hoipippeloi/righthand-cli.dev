import { makeEnvelope } from "../envelope.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "hello",
  description: "Demo command — greets a name; exercises envelope + exit codes",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name to greet" },
      "needs-human": { type: "boolean", default: false },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
};

// Demo command proving the envelope + exit-code contract:
//  - `righthand hello world`        -> ok envelope, exit 0
//  - `righthand hello --needs-human` -> needs_human envelope, exit 3
export const cli = {
  args: {
    name: { type: "positional", description: "Name to greet", required: false },
    "needs-human": { type: "boolean", description: "Force a human escalation (exit 3)" },
  },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const name = (ctx.args.name as string) ?? "world";
  if (ctx.flags["needs-human"]) {
    return makeEnvelope({
      command: "hello",
      ok: false,
      summary: `would greet ${name} but needs confirmation`,
      needs_human: "demo: --needs-human forces a human escalation",
    });
  }
  return makeEnvelope({
    command: "hello",
    summary: `hello, ${name}!`,
    result: { greeted: name },
  });
}
