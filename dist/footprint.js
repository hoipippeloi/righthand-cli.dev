import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
function userRoot() {
  return process.env.RIGHTHAND_USER_ROOT ?? join(homedir(), ".righthand");
}
function findProjectRoot(start = process.cwd()) {
  if (process.env.RIGHTHAND_PROJECT_ROOT) return process.env.RIGHTHAND_PROJECT_ROOT;
  let dir = resolve(start);
  for (let i = 0; i < 24; i++) {
    if (existsSync(join(dir, ".righthand")) || existsSync(join(dir, ".git"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}
function projectRoot() {
  return findProjectRoot(process.cwd());
}
function footprintFor(scope) {
  const root = scope === "user" ? userRoot() : join(projectRoot(), ".righthand");
  return {
    scope,
    root,
    configPath: join(root, "config.json"),
    manifestPath: join(root, "manifest.json"),
    pluginsDir: join(root, "plugins"),
    historyPath: join(root, "history.jsonl"),
    resetsDir: join(root, "._resets"),
    credentialsPath: join(root, "credentials")
  };
}
function resolveActiveScope(flags = {}) {
  const s = flags.scope;
  if (s === "user" || s === "project") return s;
  return existsSync(join(projectRoot(), ".righthand")) ? "project" : "user";
}
function activeFootprint(flags = {}) {
  return footprintFor(resolveActiveScope(flags));
}
function ensureFootprintDirs(fp) {
  mkdirSync(fp.root, { recursive: true });
  mkdirSync(fp.pluginsDir, { recursive: true });
  mkdirSync(fp.resetsDir, { recursive: true });
}
function appendHistoryRow(fp, row) {
  try {
    if (!existsSync(fp.historyPath)) return;
    appendFileSync(fp.historyPath, JSON.stringify(row) + "\n", "utf8");
  } catch {
  }
}
function readHistory(fp, opts = {}) {
  if (!existsSync(fp.historyPath)) return [];
  let text;
  try {
    text = readFileSync(fp.historyPath, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
    }
  }
  if (opts.last && opts.last > 0) return rows.slice(-opts.last);
  return rows;
}
export {
  activeFootprint,
  appendHistoryRow,
  ensureFootprintDirs,
  findProjectRoot,
  footprintFor,
  projectRoot,
  readHistory,
  resolveActiveScope,
  userRoot
};
