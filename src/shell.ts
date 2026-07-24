// Shared subprocess helper for ops commands that wrap external CLIs (C8).
//
// Every ops command shells out to an existing CLI (gh, kubectl, aws,
// markdownlint...) and compresses its output. This module owns that shell-out
// so commands stay thin. The `runner` seam lets tests inject fake output
// without needing the real binaries installed.
import { spawnSync } from "node:child_process";

export interface RunnerResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

// A runner turns (bin, args) into a normalized result. The real one wraps
// spawnSync; tests pass a fake. opts is optional so a `(bin, args) => ...`
// fake still satisfies the type.
export type Runner = (bin: string, args: string[], opts?: RunCliOptions) => RunnerResult;

export interface RunCliOptions {
  cwd?: string;
  timeoutMs?: number;
  runner?: Runner;
}

export interface RunCliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  // True when the binary itself is absent (ENOENT). Callers emit exit 5
  // (DEP_MISSING) with a needs_human hint — see CommandError in errors.ts.
  missing: boolean;
}

// The production runner. spawnSync reports a missing binary via `.error`
// (code ENOENT) rather than throwing; we rethrow so runCli's catch maps it to
// `missing`. Keeps the Runner signature ({stdout,stderr,status}) clean —
// missing-ness is signalled by a thrown ENOENT, which test fakes can produce.
export function defaultRunner(bin: string, args: string[], opts: RunCliOptions = {}): RunnerResult {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

// TEST SEAM (module-level): tests set this before invoking a command's run(),
// then reset it. Commands call runCli(bin, args) with no opts and still get the
// injected runner. Global mutable state is acceptable here: it is test-only and
// explicitly named. Prefer per-call opts.runner where practical.
let runnerForTest: Runner | null = null;
export function setRunnerForTest(r: Runner | null): void {
  runnerForTest = r;
}
export function resetRunnerForTest(): void {
  runnerForTest = null;
}

export function runCli(bin: string, args: string[], opts: RunCliOptions = {}): RunCliResult {
  const runner = opts.runner ?? runnerForTest ?? defaultRunner;
  try {
    const raw = runner(bin, args, opts);
    const code = raw.status;
    return { ok: code === 0, stdout: raw.stdout, stderr: raw.stderr, code, missing: false };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err && err.code === "ENOENT") {
      return { ok: false, stdout: "", stderr: String(err.message ?? "not found"), code: -1, missing: true };
    }
    throw e;
  }
}

// Presence check used by commands that pick among several CLIs (logs/docs).
// True unless the binary is absent. Honors the test seam via runCli.
export function hasBinary(bin: string, opts: RunCliOptions = {}): boolean {
  return !runCli(bin, ["--version"], opts).missing;
}
