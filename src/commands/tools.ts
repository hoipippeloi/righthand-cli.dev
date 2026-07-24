import { makeEnvelope } from "../envelope.ts";
import { getMergedManifest } from "../manifest.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "tools",
  description: "List available commands as MCP-shaped tool descriptors",
  inputSchema: {
    type: "object",
    properties: { json: { type: "boolean", default: true } },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const tools = await getMergedManifest();
  return makeEnvelope({
    command: "tools",
    summary: `${tools.length} commands available`,
    result: { tools },
  });
}
