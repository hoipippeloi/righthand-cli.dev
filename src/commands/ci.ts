// C8.1 — CI/CD ops domain. Wraps `gh` (GitHub Actions), compresses output.
// Missing gh -> exit 5 (DEP_MISSING) with a needs_human hint (graceful degrade).
import { makeEnvelope } from "../envelope.ts";
import { CommandError } from "../errors.ts";
import { EXIT, type ToolDescriptor, type CommandContext, type Envelope } from "../contracts.ts";
import { runCli } from "../shell.ts";

const CAPS = ["exec:gh", "net:api.github.com"];
const GH_MISSING = "install the GitHub CLI (gh) and run `gh auth login` to use CI commands";

export const descriptor: ToolDescriptor = {
  name: "ci",
  description: "CI/CD: status [--branch <b>] | logs [--run <id>] — wraps gh, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["status", "logs"] },
      branch: { type: "string" },
      run: { type: "string" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: CAPS,
};

export const cli = {
  args: {
    action: { type: "positional", description: "status | logs", required: false },
    branch: { type: "string", description: "Branch filter (status)" },
    run: { type: "string", description: "Run id (logs; default: latest)" },
  },
};

interface GhRun {
  status?: string | null;
  conclusion?: string | null;
  name?: string;
  createdAt?: string;
}

// Compress a gh run list into a one-line summary: "main: 2 failed, 1 running".
export function summarizeRuns(branch: string | undefined, runs: GhRun[]): string {
  let failed = 0,
    running = 0,
    ok = 0,
    other = 0;
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
  const parts: string[] = [];
  if (failed) parts.push(`${failed} failed`);
  if (running) parts.push(`${running} running`);
  if (ok) parts.push(`${ok} succeeded`);
  if (other) parts.push(`${other} other`);
  const label = branch ? `${branch}:` : "latest:";
  return `${label} ${parts.join(", ") || "none"}`;
}

// Compress a `gh run view --log` dump: keep the tail + any error-ish lines.
export function compressRunLog(stdout: string, runId: string | undefined): {
  run: string;
  lines: number;
  failed_step: string | null;
  tail: string[];
  errors: string[];
} {
  const nonEmpty = stdout.split(/\r?\n/).filter(Boolean);
  const errors = nonEmpty.filter((l) => /error|fail|exception|exit code [1-9]/i.test(l)).slice(-10);
  return {
    run: runId ?? "latest",
    lines: nonEmpty.length,
    failed_step: errors[errors.length - 1] ?? null,
    tail: nonEmpty.slice(-30),
    errors,
  };
}

function ensureGh(res: { missing: boolean }): void {
  if (res.missing) throw new CommandError(EXIT.DEP_MISSING, "gh (GitHub CLI) not found", GH_MISSING);
}

// gh present but FAILED (non-zero exit — not a git repo, not authed, etc.).
// Do NOT swallow as an empty success; surface the failure honestly.
function ghFailed(action: string, res: { ok: boolean; code: number | null; stdout: string; stderr: string }): Envelope {
  const tail = (res.stderr || res.stdout || "").split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "";
  return makeEnvelope({
    command: "ci",
    ok: false,
    summary: `gh failed (exit ${res.code})${tail ? ": " + tail.slice(0, 120) : ""}`,
    result: { action, code: res.code, hint: GH_MISSING },
  });
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "status";
  const branch = (ctx.flags.branch ?? ctx.args.branch) as string | undefined;
  const runId = (ctx.flags.run ?? ctx.args.run) as string | undefined;

  if (action === "logs") {
    const args = ["run", "view", ...(runId ? [runId] : []), "--log"];
    const res = runCli("gh", args);
    ensureGh(res);
    if (!res.ok) return ghFailed("logs", res);
    const c = compressRunLog(res.stdout, runId);
    return makeEnvelope({
      command: "ci",
      summary: `run ${c.run}: ${c.lines} lines, ${c.errors.length} error(s)`,
      result: c,
    });
  }

  // default: status
  const args = [
    "run",
    "list",
    ...(branch ? ["--branch", branch] : []),
    "--json",
    "status,conclusion,name,createdAt",
    "--limit",
    "5",
  ];
  const res = runCli("gh", args);
  ensureGh(res);
  if (!res.ok) return ghFailed("status", res);
  let runs: GhRun[] = [];
  try {
    runs = JSON.parse(res.stdout || "[]");
  } catch {
    runs = [];
  }
  const items = runs.map((r) => ({
    name: r.name,
    status: r.status ?? null,
    conclusion: r.conclusion ?? null,
  }));
  return makeEnvelope({
    command: "ci",
    summary: summarizeRuns(branch, runs),
    result: { branch: branch ?? null, runs: items },
  });
}
