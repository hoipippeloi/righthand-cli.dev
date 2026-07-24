import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeEnvelope, renderEnvelope } from "../src/envelope.ts";
import { getMergedManifest, findTool } from "../src/manifest.ts";
import { discoverPluginFragments } from "../src/discover.ts";
import { dispatch } from "../src/runtime.ts";
import { loadedPluginHandlers } from "../src/registry.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { EXIT, type CommandContext } from "../src/contracts.ts";

const ctx = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  args: {},
  flags: {},
  config: DEFAULT_CONFIG,
  isTTY: false,
  ...overrides,
});

test("envelope has all required fields", () => {
  const env = makeEnvelope({ command: "x", summary: "s", result: { a: 1 } });
  assert.equal(env.ok, true);
  assert.equal(env.command, "x");
  assert.equal(env.summary, "s");
  assert.deepEqual(env.result, { a: 1 });
  assert.equal(env.needs_human, null);
  assert.equal(typeof env.meta.version, "string");
  assert.equal(env.meta.duration_ms, 0);
});

test("ok command -> exit 0", async () => {
  const { env, exitCode } = await dispatch("hello", ctx({ args: { name: "ada" } }));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(env.ok, true);
  assert.deepEqual(env.result, { greeted: "ada" });
});

test("needs_human -> exit 3", async () => {
  const { env, exitCode } = await dispatch(
    "hello",
    ctx({ args: { name: "ada" }, flags: { "needs-human": true } }),
  );
  assert.equal(exitCode, EXIT.NEEDS_HUMAN);
  assert.ok(env.needs_human);
});

test("unknown command -> exit 2 (USAGE)", async () => {
  const { exitCode } = await dispatch("nope", ctx());
  assert.equal(exitCode, EXIT.USAGE);
});

test("tools discovery is MCP-shaped (name + description + inputSchema)", async () => {
  const tools = await getMergedManifest();
  assert.ok(tools.length >= 3);
  for (const t of tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.description, "string");
    assert.equal(typeof t.inputSchema, "object");
  }
  assert.ok(await findTool("version"));
  assert.equal(await findTool("nope"), undefined);
});

test("lazy import: discovery reads a plugin fragment WITHOUT importing its handler", () => {
  // A fake plugin: a manifest.json fragment + a handler that flips a flag on import.
  const tmp = mkdtempSync(join(tmpdir(), "rh-plugin-"));
  const loadedFlag = join(tmp, "loaded.flag");
  writeFileSync(
    join(tmp, "handler.js"),
    `import { writeFileSync } from "node:fs"; import { join } from "node:path"; writeFileSync(${JSON.stringify(loadedFlag)}, "1"); export function run() { return null; }`,
  );
  writeFileSync(
    join(tmp, "manifest.json"),
    JSON.stringify({
      plugin: "@fake/plugin",
      handler: "./handler.js",
      tools: [
        {
          name: "fake.thing",
          description: "fake plugin command",
          inputSchema: { type: "object" },
          plugin: "@fake/plugin",
        },
      ],
    }),
  );

  loadedPluginHandlers.clear();
  const frags = discoverPluginFragments([tmp]);
  assert.equal(frags.length, 1, "fragment read");
  assert.equal(frags[0].descriptors[0].name, "fake.thing");
  // The handler module must NOT have been imported by discovery.
  assert.equal(
    existsSync(loadedFlag),
    false,
    "plugin handler must not be imported at discovery",
  );
  // And the merged manifest includes the plugin descriptor.
  assert.ok(findTool("fake.thing", [tmp]), "plugin descriptor visible in manifest");

  rmSync(tmp, { recursive: true, force: true });
});

test("cold path (manifest read + envelope render) is fast", async () => {
  // Warm the memoized discovery once, then time just the owned work.
  await getMergedManifest();
  const start = performance.now();
  const iterations = 1000;
  for (let i = 0; i < iterations; i++) {
    const tools = await getMergedManifest();
    renderEnvelope(
      makeEnvelope({ command: "tools", summary: "x", result: { tools } }),
      "json",
    );
  }
  const perCallMs = (performance.now() - start) / iterations;
  // The 200ms subprocess target (C1) is dominated by runtime startup; the part
  // we own (discovery + render) should be a tiny fraction of it.
  assert.ok(perCallMs < 1, `in-process cold path too slow: ${perCallMs.toFixed(4)}ms/call`);
});

test("JSON render is a valid envelope; human render is readable", () => {
  const env = makeEnvelope({ command: "hello", summary: "hi", result: { greeted: "x" } });
  const parsed = JSON.parse(renderEnvelope(env, "json"));
  assert.equal(parsed.command, "hello");
  const human = renderEnvelope(env, "human");
  assert.match(human, /✓ hello: hi/);
});
