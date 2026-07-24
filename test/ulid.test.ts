import { test } from "node:test";
import assert from "node:assert/strict";
import { ulid, actionId, changeId } from "../src/ulid.ts";

test("ulid is 26 chars, Crockford Base32 (no I/L/O/U)", () => {
  const id = ulid();
  assert.equal(id.length, 26);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test("ulid sorts by timestamp across distinct milliseconds", () => {
  // Same-millisecond ULIDs differ only in their random tail (unordered by
  // spec); distinct-millisecond ULIDs are strictly sortable.
  const a = ulid(1_700_000_000_000);
  const b = ulid(1_700_000_001_000);
  const c = ulid(1_700_000_002_000);
  assert.ok(a < b, `${a} should sort before ${b}`);
  assert.ok(b < c, `${b} should sort before ${c}`);
});

test("ulid with explicit earlier time sorts before a later one", () => {
  const old = ulid(1_000_000);
  const young = ulid(2_000_000);
  assert.ok(old < young);
});

test("actionId / changeId carry the right prefix", () => {
  assert.match(actionId(), /^act_[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.match(changeId(), /^chg_[0-9A-HJKMNP-TV-Z]{26}$/);
});
