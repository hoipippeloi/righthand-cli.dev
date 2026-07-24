import { spawnSync } from "node:child_process";
function defaultRunner(bin, args, opts = {}) {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    ...opts.cwd ? { cwd: opts.cwd } : {},
    ...opts.timeoutMs ? { timeout: opts.timeoutMs } : {}
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}
let runnerForTest = null;
function setRunnerForTest(r) {
  runnerForTest = r;
}
function resetRunnerForTest() {
  runnerForTest = null;
}
function runCli(bin, args, opts = {}) {
  const runner = opts.runner ?? runnerForTest ?? defaultRunner;
  try {
    const raw = runner(bin, args, opts);
    const code = raw.status;
    return { ok: code === 0, stdout: raw.stdout, stderr: raw.stderr, code, missing: false };
  } catch (e) {
    const err = e;
    if (err && err.code === "ENOENT") {
      return { ok: false, stdout: "", stderr: String(err.message ?? "not found"), code: -1, missing: true };
    }
    throw e;
  }
}
function hasBinary(bin, opts = {}) {
  return !runCli(bin, ["--version"], opts).missing;
}
export {
  defaultRunner,
  hasBinary,
  resetRunnerForTest,
  runCli,
  setRunnerForTest
};
