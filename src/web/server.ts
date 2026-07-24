// righthand web server (C-web). Stdlib node:http — no framework, no build step.
// Serves the SPA + two JSON endpoints backed by the SAME in-process dispatch
// the CLI uses, so the web UI respects config, capabilities, and rollback.
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getMergedManifest } from "../manifest.ts";
import { dispatch } from "../runtime.ts";
import { loadConfig } from "../config.ts";
import type { CommandContext } from "../contracts.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_HTML = readFileSync(join(HERE, "app.html"), "utf8");

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }): void {
  res.writeHead(status, headers);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => {
      data += c.toString();
      if (data.length > 1_000_000) reject(new Error("request body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export interface StartOptions {
  port?: number;
  host?: string;
}

// Start the server. Returns the http.Server (caller reads .address().port for
// the assigned port when port=0). Does NOT open a browser — the `web` command
// does that so tests can use startServer() headlessly.
export function startServer(opts: StartOptions = {}): Server {
  const server = createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";

      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        return send(res, 200, APP_HTML, { "content-type": "text/html; charset=utf-8" });
      }

      if (req.method === "GET" && url === "/api/tools") {
        const tools = await getMergedManifest();
        return send(res, 200, { tools });
      }

      if (req.method === "POST" && url === "/api/run") {
        const raw = await readBody(req);
        let parsed: { command?: string; args?: Record<string, unknown>; flags?: Record<string, unknown> };
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: "invalid JSON body" });
        }
        const command = parsed.command;
        if (typeof command !== "string") return send(res, 400, { error: "missing 'command'" });
        // Can't run the server inside the server.
        if (command === "web") return send(res, 400, { error: "cannot run 'web' inside the web server" });

        const config = loadConfig();
        // The human clicking "Run" is the consent path; destructive/expensive
        // commands still escalate unless the UI sends --yes.
        const ctx: CommandContext = {
          args: parsed.args ?? {},
          flags: parsed.flags ?? {},
          config,
          isTTY: false,
          recordHistory: true,
        };
        const { env, exitCode } = await dispatch(command, ctx);
        return send(res, 200, { envelope: env, exitCode });
      }

      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 500, { error: (e as Error).message });
    }
  });

  server.listen(opts.port ?? 8787, opts.host ?? "127.0.0.1");
  return server;
}

export function urlFor(server: Server, host = "127.0.0.1"): string {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : optsPortFallback(server);
  return `http://${host}:${port}/`;
}

function optsPortFallback(_server: Server): number {
  return 8787;
}

// Best-effort browser open (Windows `start`, macOS `open`, Linux `xdg-open`).
export function openBrowser(url: string): void {
  try {
    const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
    spawnSync(cmd, process.platform === "win32" ? ["", url] : [url], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
  } catch {
    /* ignore — the URL is printed either way */
  }
}
