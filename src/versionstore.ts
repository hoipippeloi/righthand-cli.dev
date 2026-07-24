// Internal version store: each footprint is an isomorphic-git repo (C7).
// Pure-JS git, no system git. Snapshots footprint state as commits so every
// righthand mutation is reversible.
//
// isomorphic-git is imported LAZILY inside each function — importing this
// module is free at load time, so `righthand tools` cold-start never pays for
// git. The store is only touched by mutating commands (init/config set/rollback).
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Footprint } from "./footprint.ts";

// Files/dirs never tracked by the version store.
const IGNORED = (rel: string): boolean =>
  rel === ".git" ||
  rel.startsWith(".git" + sep) ||
  rel === "history.jsonl" ||
  rel === "credentials" ||
  rel.startsWith("._resets" + sep);

const AUTHOR = { name: "righthand", email: "righthand@local" };
const REF = "HEAD";

async function git() {
  return await import("isomorphic-git");
}

// Walk fp.root → list of tracked file paths (posix, relative), respecting IGNORED.
function trackedFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (IGNORED(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) out.push(rel);
    }
  };
  walk(root);
  return out;
}

// Init the git repo + .gitignore if not already present. Idempotent.
export async function ensureStore(fp: Footprint): Promise<void> {
  mkdirSync(fp.root, { recursive: true });
  const dotGit = join(fp.root, ".git");
  if (!existsSync(dotGit)) {
    const g = await git();
    await g.init({ fs: await importFs(), dir: fp.root });
    const gi = join(fp.root, ".gitignore");
    if (!existsSync(gi)) {
      writeFileSync(gi, "history.jsonl\ncredentials\n._resets/\n", "utf8");
    }
  }
}

async function importFs(): Promise<typeof import("node:fs")> {
  return await import("node:fs");
}

// Stage all tracked files and commit. Returns the new commit oid (or current
// HEAD if the repo has no files to record yet but is fresh).
export async function snapshot(fp: Footprint, message: string): Promise<string> {
  const g = await git();
  const fs = await importFs();
  const files = trackedFiles(fp.root);
  for (const filepath of files) {
    await g.add({ fs, dir: fp.root, filepath });
  }
  const oid = await g.commit({ fs, dir: fp.root, message, author: AUTHOR });
  return oid;
}

export async function headOid(fp: Footprint): Promise<string | null> {
  const g = await git();
  const fs = await importFs();
  try {
    return await g.resolveRef({ fs, dir: fp.root, ref: REF });
  } catch {
    return null;
  }
}

export interface CommitRow {
  oid: string;
  message: string;
  tree: string;
  timestamp: number;
}

export async function listLog(
  fp: Footprint,
  opts: { last?: number } = {},
): Promise<CommitRow[]> {
  const g = await git();
  const fs = await importFs();
  let entries: Array<{ oid: string; commit: { message: string; tree: string; committer: { timestamp: number } } }>;
  try {
    entries = await g.log({ fs, dir: fp.root, depth: opts.last, ref: REF });
  } catch {
    return [];
  }
  return entries.map((e) => ({
    oid: e.oid,
    message: e.commit.message,
    tree: e.commit.tree,
    timestamp: e.commit.committer.timestamp,
  }));
}

// Recursively collect {filepath -> blobOid} for a tree oid.
async function collectTree(
  fp: Footprint,
  treeOid: string,
  prefix = "",
): Promise<Map<string, string>> {
  const g = await git();
  const fs = await importFs();
  const out = new Map<string, string>();
  const { tree } = await g.readTree({ fs, dir: fp.root, oid: treeOid });
  for (const entry of tree) {
    const path = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (IGNORED(path)) continue;
    if (entry.type === "tree") {
      for (const [p, oid] of await collectTree(fp, entry.oid, path)) out.set(p, oid);
    } else if (entry.type === "blob") {
      out.set(path, entry.oid);
    }
  }
  return out;
}

// Files tracked at HEAD (empty if no commits).
export async function headTreeFiles(fp: Footprint): Promise<Map<string, string>> {
  const head = await headOid(fp);
  if (!head) return new Map();
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid: head });
  return collectTree(fp, commit.tree);
}

// Materialize a commit's tree into the workdir: write every target file and
// delete tracked files that no longer exist at target. Returns files changed
// (written + deleted). Does NOT commit — caller snapshots.
export async function materializeCommit(
  fp: Footprint,
  oid: string,
): Promise<{ written: string[]; deleted: string[] }> {
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid });
  const target = await collectTree(fp, commit.tree);
  const current = await headTreeFiles(fp);

  const written: string[] = [];
  for (const [filepath, blobOid] of target) {
    const { blob } = await g.readBlob({ fs, dir: fp.root, oid: blobOid });
    const abs = join(fp.root, ...filepath.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(blob));
    written.push(filepath);
  }
  const deleted: string[] = [];
  for (const filepath of current.keys()) {
    if (!target.has(filepath)) {
      const abs = join(fp.root, ...filepath.split("/"));
      if (existsSync(abs)) rmSync(abs, { force: true });
      deleted.push(filepath);
    }
  }
  return { written, deleted };
}

// Diff summary: files differing between HEAD workdir snapshot and a target oid.
// Returns the filepaths that would change if we materialized target.
export async function diffAgainst(
  fp: Footprint,
  oid: string,
): Promise<string[]> {
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid });
  const target = await collectTree(fp, commit.tree);
  const current = await headTreeFiles(fp);
  const changed: string[] = [];
  for (const [p, oidB] of target) {
    if (current.get(p) !== oidB) changed.push(p);
  }
  for (const p of current.keys()) {
    if (!target.has(p)) changed.push(p);
  }
  return changed;
}
