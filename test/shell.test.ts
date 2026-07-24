import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli, hasBinary, setRunnerForTest, resetRunnerForTest, type Runner } from "../src/shell.ts";

// A fake runner that returns a fixed result.
const fake = (r: { stdout?: string; stderr?: string; status?: number | null }): Runner =>
  () => ({ stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 0 });

// A fake runner that signals a missing binary (ENOENT).
const missing = (): Runner => () => {
  const e = new Error("spawn ENOENT");
  (e as NodeJS.ErrnoException).code = "ENOENT";
  throw e;
};

test("runCli with a fake runner parses stdout + exit 0", () => {
  const r = runCli("gh", ["run", "list"], { runner: fake({ stdout: "ok", status: 0 }) });
  assert.equal(r.ok, true);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "ok");
  assert.equal(r.stderr, "");
  assert.equal(r.missing, false);
});

test("runCli with a non-zero exit -> ok:false, code preserved", () => {
  const r = runCli("x", [], { runner: fake({ stdout: "", stderr: "boom", status: 2 }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 2);
  assert.equal(r.missing, false);
});

test("runCli with a null status (signal) -> ok:false", () => {
  // Inline runner: the `fake` helper would coerce null->0 via `?? 0`.
  const r = runCli("x", [], { runner: () => ({ stdout: "", stderr: "", status: null }) });
  assert.equal(r.ok, false);
  assert.equal(r.missing, false);
});

test("runCli missing binary (ENOENT) -> missing:true, code:-1", () => {
  const r = runCli("nope", [], { runner: missing() });
  assert.equal(r.ok, false);
  assert.equal(r.missing, true);
  assert.equal(r.code, -1);
});

test("hasBinary true when present, false when absent", () => {
  assert.equal(hasBinary("present", { runner: fake({ status: 0 }) }), true);
  // A binary that exists but exits non-zero is still "present".
  assert.equal(hasBinary("present-but-failing", { runner: fake({ status: 1 }) }), true);
  assert.equal(hasBinary("absent", { runner: missing() }), false);
});

test("module-level test seam is honored and resettable", () => {
  setRunnerForTest(fake({ stdout: "seamed", status: 0 }));
  try {
    const r = runCli("anything", []);
    assert.equal(r.stdout, "seamed");
  } finally {
    resetRunnerForTest();
  }
  // After reset, a fake that throws ENOENT again maps to missing.
  const r2 = runCli("anything", [], { runner: missing() });
  assert.equal(r2.missing, true);
});
