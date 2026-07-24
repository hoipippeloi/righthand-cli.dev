import { makeEnvelope } from "../envelope.ts";
import {
  VERSION,
  type ToolDescriptor,
  type CommandContext,
  type Envelope,
} from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "version",
  description: "Print righthand version and runtime",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@righthand/core",
  costTier: "free",
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const runtime =
    typeof (globalThis as Record<string, unknown>).Bun !== "undefined"
      ? `bun`
      : `node ${process.versions.node}`;
  return makeEnvelope({
    command: "version",
    summary: `righthand ${VERSION} (${runtime})`,
    result: { version: VERSION, runtime },
  });
}
