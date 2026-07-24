import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { footprintFor, ensureFootprintDirs } from "../src/footprint.ts";
import { run as resetRun } from "../src/commands/reset.ts";
import { run as initRun } from "../src/commands/init.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { CommandContext } from "../src/contracts.ts";

const PROJ = mkdtempSync(join(tmpdir(), "rh-rs-proj-"));

const ctx = (args: Record<string, unknown> = {}, flags: Record<string, unknown> = {}): CommandContext => ({
  args,
  flags,
  config: DEFAULT_CONFIG,
  isTTY: false,
});

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
});

after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
});

test("init (via command) creates footprint + is journaled", async () => {
  const env = await initRun(ctx({}, { yes: true }));
  assert.equal(env.ok, true);
  assert.ok(env.meta.change_id, "init produces a change_id");
});

test("reset --dry-run lists items and mutates nothing", async () => {
  const fp = footprintFor("project");
  writeFileSync(fp.configPath, JSON.stringify({ defaults: { output: "full", history_max: 10 } }) + "\n");
  const before = readFileSync(fp.configPath, "utf8");
  const env = await resetRun(ctx({ target: "config" }, { "dry-run": true }));
  assert.equal(env.result.dry_run, true);
  assert.ok((env.result.files as string[]).includes("config.json"));
  assert.equal(readFileSync(fp.configPath, "utf8"), before, "dry-run must not write");
});

test("reset config restores defaults and writes an undo manifest", async () => {
  const fp = footprintFor("project");
  writeFileSync(fp.configPath, JSON.stringify({ defaults: { output: "full", history_max: 1 } }) + "\n");
  const env = await resetRun(ctx({ target: "config" }, { yes: true }));
  assert.equal(env.ok, true);
  assert.ok((env.result.undo_manifest as string), "undo manifest path returned");
  assert.ok(existsSync(env.result.undo_manifest as string), "undo manifest dir exists");
  // config.json restored to defaults shape.
  const restored = JSON.parse(readFileSync(fp.configPath, "utf8"));
  assert.equal(restored.defaults.output, "summary");
  assert.equal(restored.defaults.history_max, 10000);
});

test("ROOT GUARD: reset all never touches a file outside the footprint", async () => {
  const fp = footprintFor("project");
  ensureFootprintDirs(fp);
  // Sentinel in the PROJECT root (outside ./.righthand) — app code righthand must never delete.
  const sentinel = join(PROJ, "app-source-file.ts");
  writeFileSync(sentinel, "important");
  await resetRun(ctx({ target: "all" }, { yes: true }));
  assert.equal(existsSync(sentinel), true, "app source outside footprint must survive reset all");
  assert.equal(readFileSync(sentinel, "utf8"), "important", "sentinel content intact");
});

test("reset without --yes in non-TTY refuses (needs_human)", async () => {
  const env = await resetRun(ctx({ target: "history" }, {}));
  assert.equal(env.ok, false);
  assert.ok(env.needs_human);
});

test("reset history clears history.jsonl; ._resets + .git preserved", async () => {
  const fp = footprintFor("project");
  writeFileSync(fp.historyPath, "line1\nline2\n");
  const resetsBefore = readdirSync(fp.resetsDir).length;
  await resetRun(ctx({ target: "history" }, { yes: true }));
  assert.equal(readFileSync(fp.historyPath, "utf8"), "", "history truncated");
  assert.ok(existsSync(join(fp.root, ".git")), "version store preserved");
  assert.ok(readdirSync(fp.resetsDir).length >= resetsBefore, "._resets preserved/grown");
});
