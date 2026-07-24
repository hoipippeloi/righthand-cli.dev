// Tests for the righthand web server. Runs headlessly on an ephemeral port in
// an isolated temp HOME/cwd so nothing touches the real footprint.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/web/server.ts";

let base = "";
let server;
const tmpHome = mkdtempSync(join(tmpdir(), "rh-web-"));

before(async () => {
  mkdirSync(join(tmpHome, ".righthand"), { recursive: true });
  writeFileSync(join(tmpHome, ".righthand", "history.jsonl"), "");
  // Isolate both the user footprint (HOME/USERPROFILE) and the project root
  // (cwd) so history/config writes stay in the temp dir.
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.chdir(tmpHome);
  server = startServer({ port: 0 });
  // listen() is async — wait for the port to actually be assigned.
  await new Promise((resolve) => server.on("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after((done) => server.close(done));

const post = (body: unknown) =>
  fetch(base + "/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("GET / serves the SPA (contains marker)", async () => {
  const r = await fetch(base + "/");
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /righthand-web-app/);
});

test("GET /api/tools returns MCP-shaped descriptors incl. core commands", async () => {
  const r = await fetch(base + "/api/tools");
  const { tools } = await r.json();
  assert.ok(Array.isArray(tools) && tools.length > 0);
  for (const t of tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.description, "string");
    assert.equal(typeof t.inputSchema, "object");
  }
  assert.ok(tools.some((t) => t.name === "hello"));
});

test("POST /api/run hello ada -> ok envelope, exit 0", async () => {
  const r = await post({ command: "hello", args: { name: "ada" } });
  const data = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.exitCode, 0);
  assert.equal(data.envelope.ok, true);
  assert.deepEqual(data.envelope.result, { greeted: "ada" });
});

test("POST /api/run unknown command -> exit 2 (USAGE)", async () => {
  const data = await (await post({ command: "nope" })).json();
  assert.equal(data.exitCode, 2);
});

test("POST /api/run refuses to run 'web' inside the server (400)", async () => {
  const r = await post({ command: "web" });
  assert.equal(r.status, 400);
});

test("POST /api/run hello --needs-human -> needs_human, exit 3", async () => {
  const data = await (await post({ command: "hello", flags: { "needs-human": true } })).json();
  assert.equal(data.exitCode, 3);
  assert.ok(data.envelope.needs_human);
});

test("POST /api/run missing command -> 400", async () => {
  const r = await post({ args: {} });
  assert.equal(r.status, 400);
});
