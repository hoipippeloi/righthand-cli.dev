import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getMergedManifest } from "../manifest.js";
import { dispatch } from "../runtime.js";
import { loadConfig } from "../config.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_HTML = readFileSync(join(HERE, "app.html"), "utf8");
function send(res, status, body, headers = { "content-type": "application/json" }) {
  res.writeHead(status, headers);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c.toString();
      if (data.length > 1e6) reject(new Error("request body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function startServer(opts = {}) {
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
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return send(res, 400, { error: "invalid JSON body" });
        }
        const command = parsed.command;
        if (typeof command !== "string") return send(res, 400, { error: "missing 'command'" });
        if (command === "web") return send(res, 400, { error: "cannot run 'web' inside the web server" });
        const config = loadConfig();
        const ctx = {
          args: parsed.args ?? {},
          flags: parsed.flags ?? {},
          config,
          isTTY: false,
          recordHistory: true
        };
        const { env, exitCode } = await dispatch(command, ctx);
        return send(res, 200, { envelope: env, exitCode });
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });
  server.listen(opts.port ?? 8787, opts.host ?? "127.0.0.1");
  return server;
}
function urlFor(server, host = "127.0.0.1") {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : optsPortFallback(server);
  return `http://${host}:${port}/`;
}
function optsPortFallback(_server) {
  return 8787;
}
function openBrowser(url) {
  try {
    const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
    spawnSync(cmd, process.platform === "win32" ? ["", url] : [url], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32"
    });
  } catch {
  }
}
export {
  openBrowser,
  startServer,
  urlFor
};
