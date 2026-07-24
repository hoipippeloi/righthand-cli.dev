import { startServer, urlFor, openBrowser } from "../web/server.js";
import { makeEnvelope } from "../envelope.js";
const descriptor = {
  name: "web",
  description: "Launch the righthand web UI (visual command runner) at http://127.0.0.1:8787",
  inputSchema: {
    type: "object",
    properties: {
      port: { type: "number", default: 8787, description: "Port to serve on" },
      open: { type: "boolean", default: true, description: "Open a browser" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free"
};
const cli = {
  args: {
    port: { type: "string", description: "Port (default 8787)" },
    "no-open": { type: "boolean", description: "Do not auto-open a browser" }
  }
};
async function run(ctx) {
  const port = ctx.flags.port != null ? Number(ctx.flags.port) : 8787;
  const open = ctx.flags["no-open"] !== true;
  const server = startServer({ port });
  server.on("listening", () => {
    const url = urlFor(server);
    process.stdout.write(`righthand web \u2192 ${url}
`);
    if (open) openBrowser(url);
  });
  await new Promise(() => {
  });
  return makeEnvelope({ command: "web", summary: "server stopped" });
}
export {
  cli,
  descriptor,
  run
};
