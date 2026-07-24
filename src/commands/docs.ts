// C8.3 — Documentation ops domain. `docs lint [--path]`: runs markdownlint if
// present, else a naive scan for .md files + TODO/FIXME markers. Compresses to
// { files, issues }.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { makeEnvelope } from "../envelope.ts";
import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";
import { runCli, hasBinary } from "../shell.ts";

export const descriptor: ToolDescriptor = {
  name: "docs",
  description: "Docs: lint [--path <p>] — markdownlint if present, else naive TODO/FIXME scan",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["lint"] },
      path: { type: "string" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: ["fs:read"],
};

export const cli = {
  args: {
    action: { type: "positional", description: "lint", required: false },
    path: { type: "string", description: "File or dir to lint (default: cwd)" },
  },
};

export interface LintIssue {
  file: string;
  line: number | null;
  message: string;
}

// markdownlint-cli2 / markdownlint emit `<file>:<line>[:<col>] <rule/message>`.
// We only keep file + line + the trailing message — robust to rule-name shapes.
export function parseLint(text: string): LintIssue[] {
  const out: LintIssue[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\S+\.md):(\d+)(?::\d+)?:?\s*(.*)$/i);
    if (m) {
      out.push({ file: m[1], line: Number(m[2]), message: m[3] });
      continue;
    }
    const m2 = line.match(/^(\S+\.md):\s*(.*)$/);
    if (m2) out.push({ file: m2[1], line: null, message: m2[2] });
  }
  return out;
}

// Naive fallback: walk .md files, flag TODO/FIXME lines. Bounded (no node_modules).
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".righthand"]);
function walkMd(dir: string, acc: string[] = [], cap = 1000): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (acc.length >= cap) break;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP.has(name)) walkMd(full, acc, cap);
    } else if (name.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

export function naiveLint(root: string): { files: string[]; issues: LintIssue[] } {
  const base = resolve(root);
  const files = walkMd(base).map((f) => relative(base, f).split(sep).join("/")).sort();
  const issues: LintIssue[] = [];
  for (const rel of files) {
    let text: string;
    try {
      text = readFileSync(join(base, rel), "utf8");
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, i) => {
      if (/\b(TODO|FIXME)\b/.test(line)) {
        issues.push({ file: rel, line: i + 1, message: line.trim().slice(0, 160) });
      }
    });
    if (issues.length >= 100) break;
  }
  return { files, issues };
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "lint";
  const path = ((ctx.flags.path ?? ctx.args.path) as string | undefined) ?? ".";

  if (action !== "lint") {
    return makeEnvelope({ command: "docs", ok: false, summary: `unknown docs action: ${action}` });
  }

  // Prefer markdownlint-cli2, then markdownlint.
  const linter = hasBinary("markdownlint-cli2")
    ? "markdownlint-cli2"
    : hasBinary("markdownlint")
      ? "markdownlint"
      : null;

  if (linter) {
    const res = runCli(linter, [path]);
    const issues = parseLint(res.stdout + "\n" + res.stderr);
    const files = [...new Set(issues.map((i) => i.file))];
    return makeEnvelope({
      command: "docs",
      summary: `${linter}: ${issues.length} issue(s) across ${files.length} file(s)`,
      result: { linter, files, issues },
    });
  }

  // Naive fallback (no linter installed).
  const root = existsSync(path) ? path : ".";
  const { files, issues } = naiveLint(root);
  return makeEnvelope({
    command: "docs",
    summary: `naive scan: ${files.length} file(s), ${issues.length} TODO/FIXME`,
    result: { linter: null, files, issues },
  });
}
