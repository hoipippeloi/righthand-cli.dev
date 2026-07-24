import { makeEnvelope } from "../envelope.js";
import { getMergedManifest } from "../manifest.js";
const descriptor = {
  name: "tools",
  description: "List available commands as MCP-shaped tool descriptors",
  inputSchema: {
    type: "object",
    properties: { json: { type: "boolean", default: true } },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free"
};
async function run(ctx) {
  const tools = await getMergedManifest();
  return makeEnvelope({
    command: "tools",
    summary: `${tools.length} commands available`,
    result: { tools }
  });
}
export {
  descriptor,
  run
};
