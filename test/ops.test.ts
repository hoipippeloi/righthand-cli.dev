import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "../src/runtime.ts";
import { setRunnerForTest, resetRunnerForTest, type Runner } from "../src/shell.ts";
import { summarizeRuns, compressRunLog } from "../src/commands/ci.ts";
import { maskValue, parseDotenv } from "../src/commands/admin.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { EXIT, type CommandContext, type Config } from "../src/contracts.ts";

// Ops commands declare capabilities (exec:gh, net:*, fs:read, ...). Dispatch
// gates them against config.permissions (deny-by-default). Tests grant all caps
// so the handlers actually run — simulating a permissive environment. The
// declarations themselves remain correct + meaningful for `righthand tools`.
const TEST_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  permissions: { allow: ["*"], deny: [], auto_confirm_destructive: true },
};

const ctx = (args: Record<string, unknown> = {}): CommandContext => ({
  args,
  flags: {},
  config: TEST_CONFIG,
  isTTY: false,
});

afterEach(() => resetRunnerForTest());

// A fake runner that routes on (bin, args[0..1]).
function route(cases: { match: (bin: string, args: string[]) => boolean; out: { stdout: string; status: number } }[]): Runner {
  return (bin, args) => {
    for (const c of cases) {
      if (c.match(bin, args)) return { stdout: c.out.stdout, stderr: "", status: c.out.status };
    }
    return { stdout: "", stderr: "", status: 0 };
  };
}

const missingRunner = (): Runner => () => {
  const e = new Error("spawn ENOENT");
  (e as NodeJS.ErrnoException).code = "ENOENT";
  throw e;
};

// ---- pure compressors (no subprocess) --------------------------------------

test("summarizeRuns: main: 2 failed, 1 running", () => {
  const s = summarizeRuns("main", [
    { status: "completed", conclusion: "failure", name: "CI", createdAt: "" },
    { status: "completed", conclusion: "failure", name: "Build", createdAt: "" },
    { status: "in_progress", conclusion: null, name: "Deploy", createdAt: "" },
  ]);
  assert.match(s, /main/);
  assert.match(s, /2 failed/);
  assert.match(s, /1 running/);
});

test("summarizeRuns with no branch -> latest: label", () => {
  assert.match(summarizeRuns(undefined, []), /^latest:/);
});

test("compressRunLog keeps tail + error lines, finds failed_step", () => {
  const out = compressRunLog(["a", "b", "##[error]Process completed with exit code 1", "c"].join("\n"), "123");
  assert.equal(out.run, "123");
  assert.equal(out.lines, 4);
  assert.ok(out.errors.length >= 1);
  assert.match(out.failed_step ?? "", /exit code 1/);
});

test("maskValue never reveals the secret; parseDotenv strips quotes", () => {
  const secret = "super-secret-value-12345";
  assert.equal(maskValue(secret).includes("super"), false);
  assert.equal(JSON.stringify(maskValue(secret)).includes(secret), false);
  assert.deepEqual(parseDotenv('A="quoted"\nB=bare\n# comment\n_X=skip\n'), { A: "quoted", B: "bare", _X: "skip" });
});

// ---- ci --------------------------------------------------------------------

test("ci status with fake gh JSON -> compressed summary + exit 0", async () => {
  const runs = [
    { name: "CI", status: "completed", conclusion: "failure", createdAt: "x" },
    { name: "Build", status: "completed", conclusion: "failure", createdAt: "x" },
    { name: "Deploy", status: "in_progress", conclusion: null, createdAt: "x" },
  ];
  setRunnerForTest(
    route([
      { match: (_b, a) => a[0] === "run" && a[1] === "list", out: { stdout: JSON.stringify(runs), status: 0 } },
    ]),
  );
  const { env, exitCode } = await dispatch("ci", ctx({ action: "status", branch: "main" }));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(env.ok, true);
  assert.match(env.summary, /main/);
  assert.match(env.summary, /2 failed/);
  assert.match(env.summary, /1 running/);
  const result = env.result as { branch: string; runs: { name: string }[] };
  assert.equal(result.branch, "main");
  assert.equal(result.runs.length, 3);
});

test("ci status with gh missing -> exit 5 (DEP_MISSING) + needs_human", async () => {
  setRunnerForTest(missingRunner());
  const { env, exitCode } = await dispatch("ci", ctx({ action: "status" }));
  assert.equal(exitCode, EXIT.DEP_MISSING);
  assert.equal(env.ok, false);
  assert.ok(env.needs_human);
  assert.match(env.needs_human!, /gh/i);
});

test("ci logs compresses a run log to tail + errors", async () => {
  const log = ["line a", "line b", "##[error]Process completed with exit code 1", "line c"].join("\n");
  setRunnerForTest(
    route([
      { match: (_b, a) => a[0] === "run" && a[1] === "view", out: { stdout: log, status: 0 } },
    ]),
  );
  const { env, exitCode } = await dispatch("ci", ctx({ action: "logs", run: "123" }));
  assert.equal(exitCode, EXIT.OK);
  const r = env.result as { run: string; errors: string[]; failed_step: string | null };
  assert.equal(r.run, "123");
  assert.ok(r.errors.length >= 1);
  assert.match(r.failed_step ?? "", /exit code 1/);
});

// ---- tasks -----------------------------------------------------------------

test("tasks list compresses gh issue list -> open count + items", async () => {
  const issues = [
    { number: 1, title: "a", state: "OPEN" },
    { number: 2, title: "b", state: "CLOSED" },
    { number: 3, title: "c", state: "OPEN" },
  ];
  setRunnerForTest(
    route([{ match: (_b, a) => a[0] === "issue", out: { stdout: JSON.stringify(issues), status: 0 } }]),
  );
  const { env, exitCode } = await dispatch("tasks", ctx({ action: "list" }));
  assert.equal(exitCode, EXIT.OK);
  const r = env.result as { open: number; items: { number: number; state: string }[] };
  assert.equal(r.open, 2);
  assert.equal(r.items.length, 3);
});

// ---- logs ------------------------------------------------------------------

test("logs tail with no log CLI -> exit 5 + needs_human", async () => {
  setRunnerForTest(missingRunner());
  const { env, exitCode } = await dispatch("logs", ctx({ action: "tail" }));
  assert.equal(exitCode, EXIT.DEP_MISSING);
  assert.ok(env.needs_human);
});

test("logs tail with kubectl present compresses tail + errors", async () => {
  setRunnerForTest(
    route([
      { match: (_b, a) => a[0] === "--version", out: { stdout: "", status: 0 } }, // present
      {
        match: (bin, a) => bin === "kubectl" && a[0] === "logs",
        out: { stdout: ["info ok", "ERROR boom", "warn", "failed to connect"].join("\n"), status: 0 },
      },
    ]),
  );
  const { env, exitCode } = await dispatch("logs", ctx({ action: "tail", source: "my-pod" }));
  assert.equal(exitCode, EXIT.OK);
  const r = env.result as { backend: string; source: string; errors: string[]; tail: string[] };
  assert.equal(r.backend, "kubectl");
  assert.equal(r.source, "my-pod");
  assert.ok(r.errors.length >= 1);
});

// ---- docs ------------------------------------------------------------------

test("docs lint naive flags TODO/FIXME when no linter present", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "rh-docs-"));
  try {
    writeFileSync(join(tmp, "a.md"), "# A\n- TODO: fix me\n- FIXME: also\n");
    mkdirSync(join(tmp, "sub"));
    writeFileSync(join(tmp, "sub", "b.md"), "clean file\n");
    setRunnerForTest(missingRunner()); // no linter -> naive path
    const { env, exitCode } = await dispatch("docs", ctx({ action: "lint", path: tmp }));
    assert.equal(exitCode, EXIT.OK);
    const r = env.result as { linter: string | null; files: string[]; issues: { file: string }[] };
    assert.equal(r.linter, null);
    assert.ok(r.files.includes("a.md"), `expected a.md in ${JSON.stringify(r.files)}`);
    assert.ok(r.files.includes("sub/b.md"), `expected sub/b.md in ${JSON.stringify(r.files)}`);
    assert.equal(r.issues.length, 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("docs lint runs markdownlint when present, parses file:line issues", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "rh-docs2-"));
  try {
    writeFileSync(join(tmp, "a.md"), "x\n");
    const mdFile = join(tmp, "a.md");
    setRunnerForTest(
      route([
        { match: (_b, a) => a[0] === "--version", out: { stdout: "", status: 0 } }, // present
        { match: (bin) => bin === "markdownlint-cli2", out: { stdout: `${mdFile}:3:81 MD013/line-length Line too long`, status: 1 } },
      ]),
    );
    const { env, exitCode } = await dispatch("docs", ctx({ action: "lint", path: tmp }));
    assert.equal(exitCode, EXIT.OK);
    const r = env.result as { linter: string; issues: { line: number; file: string }[] };
    assert.equal(r.linter, "markdownlint-cli2");
    assert.ok(r.issues.length >= 1);
    assert.equal(r.issues[0].line, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- admin -----------------------------------------------------------------

test("admin env --name redacts the value; secret never appears in envelope", async () => {
  const secret = "super-secret-value-12345";
  process.env.RH_TEST_SECRET = secret;
  try {
    const { env, exitCode } = await dispatch("admin", ctx({ action: "env", name: "RH_TEST_SECRET" }));
    assert.equal(exitCode, EXIT.OK);
    const r = env.result as { name: string; set: boolean; value: string };
    assert.equal(r.set, true);
    assert.equal(r.value.includes(secret), false, "secret leaked into value field");
    assert.equal(JSON.stringify(env).includes(secret), false, "secret leaked into envelope JSON");
  } finally {
    delete process.env.RH_TEST_SECRET;
  }
});

test("admin env list shows keys + set-ness, masks every value", async () => {
  process.env.RH_LIST_TEST = "abc123";
  try {
    const { env, exitCode } = await dispatch("admin", ctx({ action: "env" }));
    assert.equal(exitCode, EXIT.OK);
    const r = env.result as { vars: { key: string; set: boolean; value: string }[] };
    const entry = r.vars.find((v) => v.key === "RH_LIST_TEST");
    assert.ok(entry, "expected RH_LIST_TEST in list");
    assert.equal(entry.set, true);
    assert.equal(entry.value.includes("abc123"), false, "value leaked");
    assert.match(env.summary, /redacted/);
  } finally {
    delete process.env.RH_LIST_TEST;
  }
});
