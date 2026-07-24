import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { footprintFor, ensureFootprintDirs } from "../src/footprint.ts";
import { journal, listChanges, planRevert, revertTo } from "../src/journal.ts";
import { ensureStore } from "../src/versionstore.ts";

const PROJ = mkdtempSync(join(tmpdir(), "rh-rl-proj-"));

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
});

after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
});

const configText = (): string => {
  const fp = footprintFor("project");
  try {
    return readFileSync(fp.configPath, "utf8").trim();
  } catch {
    return "<missing>";
  }
};

test("before/after snapshot pair: journal records one change with a change_id", async () => {
  const fp = footprintFor("project");
  ensureFootprintDirs(fp);
  await ensureStore(fp);
  const id = await journal("project", "set a=1", () => {
    writeFileSync(fp.configPath, JSON.stringify({ a: 1 }) + "\n");
  });
  assert.match(id, /^chg_/);
  const changes = await listChanges("project");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].change_id, id);
});

test("rollback restores prior state (undo the last change)", async () => {
  const fp = footprintFor("project");
  await journal("project", "set a=2", () => {
    writeFileSync(fp.configPath, JSON.stringify({ a: 2 }) + "\n");
  });
  assert.equal(JSON.parse(configText()).a, 2);
  const { written } = await revertTo("project", {}, "undo a=2");
  assert.ok(written.includes("config.json"));
  assert.equal(JSON.parse(configText()).a, 1, "rolled back to a=1");
});

test("undo-the-undo: a rollback is itself rollbackable", async () => {
  const changes = await listChanges("project");
  await revertTo("project", { to: changes[0].change_id }, "undo the undo");
  assert.equal(JSON.parse(configText()).a, 2, "state restored to a=2");
});

test("rollback removes a file added by a later change", async () => {
  const fp = footprintFor("project");
  await journal("project", "add plugin file", () => {
    mkdirSync(fp.pluginsDir, { recursive: true });
    writeFileSync(join(fp.pluginsDir, "x.txt"), "hi");
  });
  assert.equal(existsSync(join(fp.pluginsDir, "x.txt")), true);
  await revertTo("project", {}, "undo add");
  assert.equal(existsSync(join(fp.pluginsDir, "x.txt")), false, "added file removed on rollback");
});

test("planRevert (--dry-run) names files without mutating", async () => {
  const before = configText();
  const plan = await planRevert("project", {});
  assert.ok(Array.isArray(plan.files));
  assert.equal(configText(), before, "dry-run must not change state");
});

test("planRevert steps=N targets progressively older changes", async () => {
  const plan1 = await planRevert("project", { steps: 1 });
  const plan2 = await planRevert("project", { steps: 2 });
  assert.ok(plan1.change_id, "steps=1 resolves to a change");
  assert.notEqual(plan1.change_id, plan2.change_id, "steps=2 targets an older change");
});

test("unknown change id is rejected", async () => {
  await assert.rejects(() => planRevert("project", { to: "chg_does_not_exist" }), /unknown change id/);
});
