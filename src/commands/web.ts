// `righthand web` — launch the visual command-runner webapp. Auto-discovered.
// A long-running (foreground) command: startServer, print the URL, open the
// browser, then block forever (Ctrl+C stops it). execute() never reaches
// process.exit because run() never resolves.
import { startServer, urlFor, openBrowser } from "../web/server.ts";
import { makeEnvelope } from "../envelope.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "web",
  description: "Launch the righthand web UI (visual command runner) at http://127.0.0.1:8787",
  inputSchema: {
    type: "object",
    properties: {
      port: { type: "number", default: 8787, description: "Port to serve on" },
      open: { type: "boolean", default: true, description: "Open a browser" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
};

export const cli = {
  args: {
    port: { type: "string", description: "Port (default 8787)" },
    "no-open": { type: "boolean", description: "Do not auto-open a browser" },
  },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const port = ctx.flags.port != null ? Number(ctx.flags.port) : 8787;
  const open = ctx.flags["no-open"] !== true;
  const server = startServer({ port });
  server.on("listening", () => {
    const url = urlFor(server);
    process.stdout.write(`righthand web → ${url}\n`);
    if (open) openBrowser(url);
  });
  // Block forever so the CLI process keeps the server alive. Ctrl+C (SIGINT)
  // terminates the process. The return below is unreachable.
  await new Promise<void>(() => {});
  return makeEnvelope({ command: "web", summary: "server stopped" });
}
