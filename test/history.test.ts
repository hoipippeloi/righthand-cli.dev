import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  footprintFor,
  resolveActiveScope,
  ensureFootprintDirs,
  appendHistoryRow,
  readHistory,
  type HistoryRow,
} from "../src/footprint.ts";

const PROJ = mkdtempSync(join(tmpdir(), "rh-fp-proj-"));
const USER = mkdtempSync(join(tmpdir(), "rh-fp-user-"));

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
  process.env.RIGHTHAND_USER_ROOT = USER;
});

after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  delete process.env.RIGHTHAND_USER_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
  rmSync(USER, { recursive: true, force: true });
});

test("resolveActiveScope: explicit flag wins", () => {
  assert.equal(resolveActiveScope({ scope: "user" }), "user");
  assert.equal(resolveActiveScope({ scope: "project" }), "project");
});

test("resolveActiveScope: defaults to project when a project footprint exists", () => {
  ensureFootprintDirs(footprintFor("project"));
  assert.equal(resolveActiveScope({}), "project");
});

test("appendHistoryRow is a no-op before history.jsonl exists", () => {
  const fp = footprintFor("user");
  const row: HistoryRow = {
    ts: new Date().toISOString(),
    id: "act_test",
    command: "x",
    args: {},
    ok: true,
    exit: 0,
    duration_ms: 1,
    change_id: null,
    tokens_used: 0,
    needs_human: null,
  };
  appendHistoryRow(fp, row);
  assert.equal(existsSync(fp.historyPath), false, "must not create history before init");
  assert.equal(readHistory(fp).length, 0);
});

test("appendHistoryRow writes + readHistory returns rows; last slices", () => {
  const fp = footprintFor("project");
  ensureFootprintDirs(fp);
  writeFileSync(fp.historyPath, "", "utf8"); // `init` seeds empty history

  for (let i = 0; i < 5; i++) {
    appendHistoryRow(fp, {
      ts: new Date().toISOString(),
      id: `act_${i}`,
      command: "x",
      args: {},
      ok: true,
      exit: 0,
      duration_ms: i,
      change_id: i % 2 ? `chg_${i}` : null,
      tokens_used: 0,
      needs_human: null,
    });
  }
  assert.equal(readHistory(fp).length, 5);
  assert.equal(readHistory(fp, { last: 2 }).length, 2);
  assert.equal(readHistory(fp, { last: 2 })[1].id, "act_4");
});

test("history read is resilient to a malformed line", () => {
  const fp = footprintFor("project");
  appendFileSync(fp.historyPath, "this is not json\n");
  const rows = readHistory(fp);
  assert.ok(rows.length >= 5, "malformed line skipped, valid rows kept");
});
