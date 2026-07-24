// Footprint resolution + on-disk layout + history I/O (C1/C9).
//
// Two footprints: user-global (~/.righthand) and project-local (./.righthand).
// Roots are overridable for tests via RIGHTHAND_USER_ROOT / RIGHTHAND_PROJECT_ROOT.
// Light module: stdlib only, safe to import anywhere (cold-start-critical paths).
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Scope = "project" | "user";

export function userRoot(): string {
  return process.env.RIGHTHAND_USER_ROOT ?? join(homedir(), ".righthand");
}

// Walk up from `start` for a .righthand/ or .git/ marker; else `start`.
export function findProjectRoot(start: string = process.cwd()): string {
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

export function projectRoot(): string {
  return findProjectRoot(process.cwd());
}

export interface Footprint {
  scope: Scope;
  root: string;
  configPath: string;
  manifestPath: string;
  pluginsDir: string;
  historyPath: string;
  resetsDir: string; // <root>/._resets (undo manifests)
  credentialsPath: string;
}

export function footprintFor(scope: Scope): Footprint {
  const root = scope === "user" ? userRoot() : join(projectRoot(), ".righthand");
  return {
    scope,
    root,
    configPath: join(root, "config.json"),
    manifestPath: join(root, "manifest.json"),
    pluginsDir: join(root, "plugins"),
    historyPath: join(root, "history.jsonl"),
    resetsDir: join(root, "._resets"),
    credentialsPath: join(root, "credentials"),
  };
}

// Resolve the active scope: explicit --scope wins, else project if a project
// footprint exists, else user.
export function resolveActiveScope(flags: Record<string, unknown> = {}): Scope {
  const s = flags.scope;
  if (s === "user" || s === "project") return s;
  return existsSync(join(projectRoot(), ".righthand")) ? "project" : "user";
}

export function activeFootprint(flags: Record<string, unknown> = {}): Footprint {
  return footprintFor(resolveActiveScope(flags));
}

export function ensureFootprintDirs(fp: Footprint): void {
  mkdirSync(fp.root, { recursive: true });
  mkdirSync(fp.pluginsDir, { recursive: true });
  mkdirSync(fp.resetsDir, { recursive: true });
}

// --- History (C9 format; C1 owns the write, this owns the I/O) ---

export interface HistoryRow {
  ts: string;
  id: string;
  command: string;
  args: Record<string, unknown>;
  ok: boolean;
  exit: number;
  duration_ms: number;
  change_id: string | null;
  tokens_used: number;
  needs_human: string | null;
}

// Append a history row. Best-effort + non-fatal: no-op if the footprint's
// history.jsonl does not exist yet (history begins after `init`).
export function appendHistoryRow(fp: Footprint, row: HistoryRow): void {
  try {
    if (!existsSync(fp.historyPath)) return;
    appendFileSync(fp.historyPath, JSON.stringify(row) + "\n", "utf8");
  } catch {
    /* best-effort: history must never break dispatch */
  }
}

export function readHistory(
  fp: Footprint,
  opts: { last?: number } = {},
): HistoryRow[] {
  if (!existsSync(fp.historyPath)) return [];
  let text: string;
  try {
    text = readFileSync(fp.historyPath, "utf8");
  } catch {
    return [];
  }
  const rows: HistoryRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t) as HistoryRow);
    } catch {
      /* skip malformed line */
    }
  }
  if (opts.last && opts.last > 0) return rows.slice(-opts.last);
  return rows;
}
