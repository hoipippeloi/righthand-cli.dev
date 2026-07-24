import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverCore, getCoreDescriptors } from "../src/discover.ts";
import { getMergedManifest } from "../src/manifest.ts";
import { dispatch } from "../src/runtime.ts";
import { footprintFor, ensureFootprintDirs } from "../src/footprint.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { run as initRun } from "../src/commands/init.ts";
import type { CommandContext } from "../src/contracts.ts";

const PROJ = mkdtempSync(join(tmpdir(), "rh-ds-proj-"));

const ctx = (args: Record<string, unknown> = {}, flags: Record<string, unknown> = {}, extra: Partial<CommandContext> = {}): CommandContext => ({
  args,
  flags,
  config: DEFAULT_CONFIG,
  isTTY: false,
  ...extra,
});

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
});

after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
});

test("all core commands auto-discovered, each with descriptor + run", async () => {
  const table = await discoverCore();
  const names = [...table.keys()].sort();
  for (const expected of ["changes", "config", "hello", "history", "init", "reset", "rollback", "tools", "version"]) {
    assert.ok(names.includes(expected), `missing discovered command: ${expected}`);
    const cmd = table.get(expected)!;
    assert.equal(typeof cmd.run, "function");
    assert.equal(cmd.descriptor.name, expected);
  }
});

test("merged manifest surfaces the discovered commands", async () => {
  const tools = await getMergedManifest();
  const names = new Set(tools.map((t) => t.name));
  assert.ok(names.has("rollback") && names.has("changes") && names.has("config"));
});

test("recorded dispatch appends one history.jsonl row", async () => {
  const fp = footprintFor("project");
  await initRun(ctx({}, { yes: true })); // creates history.jsonl
  assert.equal(existsSync(fp.historyPath), true);

  const { exitCode } = await dispatch("version", ctx({}, {}, { recordHistory: true }));
  assert.equal(exitCode, 0);
  const lines = readFileSync(fp.historyPath, "utf8").trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.command, "version");
  assert.equal(last.ok, true);
  assert.match(last.id, /^act_/);
});

test("unrecorded dispatch (tests default) writes no history", async () => {
  const fp = footprintFor("project");
  const before = readFileSync(fp.historyPath, "utf8");
  await dispatch("tools", ctx()); // recordHistory undefined
  assert.equal(readFileSync(fp.historyPath, "utf8"), before, "no history when recordHistory unset");
});

test("dispatch of a mutating command (config set) yields a change_id", async () => {
  ensureFootprintDirs(footprintFor("project"));
  const { env } = await dispatch(
    "config",
    ctx({ action: "set", key: "defaults.output", value: "full" }, { yes: true }, { recordHistory: true }),
  );
  assert.equal(env.ok, true);
  assert.match(env.meta.change_id ?? "", /^chg_/, "config set is journaled with a change_id");
});
