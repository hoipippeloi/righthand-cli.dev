import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { makeEnvelope } from "../envelope.js";
import { runCli, hasBinary } from "../shell.js";
const descriptor = {
  name: "docs",
  description: "Docs: lint [--path <p>] \u2014 markdownlint if present, else naive TODO/FIXME scan",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["lint"] },
      path: { type: "string" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: ["fs:read"]
};
const cli = {
  args: {
    action: { type: "positional", description: "lint", required: false },
    path: { type: "string", description: "File or dir to lint (default: cwd)" }
  }
};
function parseLint(text) {
  const out = [];
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
const SKIP = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".righthand"]);
function walkMd(dir, acc = [], cap = 1e3) {
  let entries = [];
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
function naiveLint(root) {
  const base = resolve(root);
  const files = walkMd(base).map((f) => relative(base, f).split(sep).join("/")).sort();
  const issues = [];
  for (const rel of files) {
    let text;
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
async function run(ctx) {
  const action = ctx.args.action ?? "lint";
  const path = ctx.flags.path ?? ctx.args.path ?? ".";
  if (action !== "lint") {
    return makeEnvelope({ command: "docs", ok: false, summary: `unknown docs action: ${action}` });
  }
  const linter = hasBinary("markdownlint-cli2") ? "markdownlint-cli2" : hasBinary("markdownlint") ? "markdownlint" : null;
  if (linter) {
    const res = runCli(linter, [path]);
    const issues2 = parseLint(res.stdout + "\n" + res.stderr);
    const files2 = [...new Set(issues2.map((i) => i.file))];
    return makeEnvelope({
      command: "docs",
      summary: `${linter}: ${issues2.length} issue(s) across ${files2.length} file(s)`,
      result: { linter, files: files2, issues: issues2 }
    });
  }
  const root = existsSync(path) ? path : ".";
  const { files, issues } = naiveLint(root);
  return makeEnvelope({
    command: "docs",
    summary: `naive scan: ${files.length} file(s), ${issues.length} TODO/FIXME`,
    result: { linter: null, files, issues }
  });
}
export {
  cli,
  descriptor,
  naiveLint,
  parseLint,
  run
};
