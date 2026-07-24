import { makeEnvelope } from "../envelope.js";
import { CommandError } from "../errors.js";
import { EXIT } from "../contracts.js";
import { runCli } from "../shell.js";
const CAPS = ["exec:gh", "net:api.github.com"];
const GH_MISSING = "install the GitHub CLI (gh) and run `gh auth login` to use CI commands";
const descriptor = {
  name: "ci",
  description: "CI/CD: status [--branch <b>] | logs [--run <id>] \u2014 wraps gh, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["status", "logs"] },
      branch: { type: "string" },
      run: { type: "string" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: CAPS
};
const cli = {
  args: {
    action: { type: "positional", description: "status | logs", required: false },
    branch: { type: "string", description: "Branch filter (status)" },
    run: { type: "string", description: "Run id (logs; default: latest)" }
  }
};
function summarizeRuns(branch, runs) {
  let failed = 0, running = 0, ok = 0, other = 0;
  for (const r of runs) {
    const st = (r.status ?? "").toLowerCase();
    const co = (r.conclusion ?? "").toLowerCase();
    if (st === "in_progress" || st === "queued" || st === "waiting" || st === "pending")
      running++;
    else if (co === "success") ok++;
    else if (co === "failure" || co === "timed_out" || co === "cancelled" || co === "action_required")
      failed++;
    else other++;
  }
  const parts = [];
  if (failed) parts.push(`${failed} failed`);
  if (running) parts.push(`${running} running`);
  if (ok) parts.push(`${ok} succeeded`);
  if (other) parts.push(`${other} other`);
  const label = branch ? `${branch}:` : "latest:";
  return `${label} ${parts.join(", ") || "none"}`;
}
function compressRunLog(stdout, runId) {
  const nonEmpty = stdout.split(/\r?\n/).filter(Boolean);
  const errors = nonEmpty.filter((l) => /error|fail|exception|exit code [1-9]/i.test(l)).slice(-10);
  return {
    run: runId ?? "latest",
    lines: nonEmpty.length,
    failed_step: errors[errors.length - 1] ?? null,
    tail: nonEmpty.slice(-30),
    errors
  };
}
function ensureGh(res) {
  if (res.missing) throw new CommandError(EXIT.DEP_MISSING, "gh (GitHub CLI) not found", GH_MISSING);
}
function ghFailed(action, res) {
  const tail = (res.stderr || res.stdout || "").split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "";
  return makeEnvelope({
    command: "ci",
    ok: false,
    summary: `gh failed (exit ${res.code})${tail ? ": " + tail.slice(0, 120) : ""}`,
    result: { action, code: res.code, hint: GH_MISSING }
  });
}
async function run(ctx) {
  const action = ctx.args.action ?? "status";
  const branch = ctx.flags.branch ?? ctx.args.branch;
  const runId = ctx.flags.run ?? ctx.args.run;
  if (action === "logs") {
    const args2 = ["run", "view", ...runId ? [runId] : [], "--log"];
    const res2 = runCli("gh", args2);
    ensureGh(res2);
    if (!res2.ok) return ghFailed("logs", res2);
    const c = compressRunLog(res2.stdout, runId);
    return makeEnvelope({
      command: "ci",
      summary: `run ${c.run}: ${c.lines} lines, ${c.errors.length} error(s)`,
      result: c
    });
  }
  const args = [
    "run",
    "list",
    ...branch ? ["--branch", branch] : [],
    "--json",
    "status,conclusion,name,createdAt",
    "--limit",
    "5"
  ];
  const res = runCli("gh", args);
  ensureGh(res);
  if (!res.ok) return ghFailed("status", res);
  let runs = [];
  try {
    runs = JSON.parse(res.stdout || "[]");
  } catch {
    runs = [];
  }
  const items = runs.map((r) => ({
    name: r.name,
    status: r.status ?? null,
    conclusion: r.conclusion ?? null
  }));
  return makeEnvelope({
    command: "ci",
    summary: summarizeRuns(branch, runs),
    result: { branch: branch ?? null, runs: items }
  });
}
export {
  cli,
  compressRunLog,
  descriptor,
  run,
  summarizeRuns
};
