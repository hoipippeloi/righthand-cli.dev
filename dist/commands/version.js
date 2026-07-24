import { makeEnvelope } from "../envelope.js";
import {
  VERSION
} from "../contracts.js";
const descriptor = {
  name: "version",
  description: "Print righthand version and runtime",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@righthand/core",
  costTier: "free"
};
async function run(ctx) {
  const runtime = typeof globalThis.Bun !== "undefined" ? `bun` : `node ${process.versions.node}`;
  return makeEnvelope({
    command: "version",
    summary: `righthand ${VERSION} (${runtime})`,
    result: { version: VERSION, runtime }
  });
}
export {
  descriptor,
  run
};
