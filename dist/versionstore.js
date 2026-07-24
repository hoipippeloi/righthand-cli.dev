import { existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
const IGNORED = (rel) => rel === ".git" || rel.startsWith(".git" + sep) || rel === "history.jsonl" || rel === "credentials" || rel.startsWith("._resets" + sep);
const AUTHOR = { name: "righthand", email: "righthand@local" };
const REF = "HEAD";
async function git() {
  return await import("isomorphic-git");
}
function trackedFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
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
async function ensureStore(fp) {
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
async function importFs() {
  return await import("node:fs");
}
async function snapshot(fp, message) {
  const g = await git();
  const fs = await importFs();
  const files = trackedFiles(fp.root);
  for (const filepath of files) {
    await g.add({ fs, dir: fp.root, filepath });
  }
  const oid = await g.commit({ fs, dir: fp.root, message, author: AUTHOR });
  return oid;
}
async function headOid(fp) {
  const g = await git();
  const fs = await importFs();
  try {
    return await g.resolveRef({ fs, dir: fp.root, ref: REF });
  } catch {
    return null;
  }
}
async function listLog(fp, opts = {}) {
  const g = await git();
  const fs = await importFs();
  let entries;
  try {
    entries = await g.log({ fs, dir: fp.root, depth: opts.last, ref: REF });
  } catch {
    return [];
  }
  return entries.map((e) => ({
    oid: e.oid,
    message: e.commit.message,
    tree: e.commit.tree,
    timestamp: e.commit.committer.timestamp
  }));
}
async function collectTree(fp, treeOid, prefix = "") {
  const g = await git();
  const fs = await importFs();
  const out = /* @__PURE__ */ new Map();
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
async function headTreeFiles(fp) {
  const head = await headOid(fp);
  if (!head) return /* @__PURE__ */ new Map();
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid: head });
  return collectTree(fp, commit.tree);
}
async function materializeCommit(fp, oid) {
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid });
  const target = await collectTree(fp, commit.tree);
  const current = await headTreeFiles(fp);
  const written = [];
  for (const [filepath, blobOid] of target) {
    const { blob } = await g.readBlob({ fs, dir: fp.root, oid: blobOid });
    const abs = join(fp.root, ...filepath.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(blob));
    written.push(filepath);
  }
  const deleted = [];
  for (const filepath of current.keys()) {
    if (!target.has(filepath)) {
      const abs = join(fp.root, ...filepath.split("/"));
      if (existsSync(abs)) rmSync(abs, { force: true });
      deleted.push(filepath);
    }
  }
  return { written, deleted };
}
async function diffAgainst(fp, oid) {
  const g = await git();
  const fs = await importFs();
  const { commit } = await g.readCommit({ fs, dir: fp.root, oid });
  const target = await collectTree(fp, commit.tree);
  const current = await headTreeFiles(fp);
  const changed = [];
  for (const [p, oidB] of target) {
    if (current.get(p) !== oidB) changed.push(p);
  }
  for (const p of current.keys()) {
    if (!target.has(p)) changed.push(p);
  }
  return changed;
}
export {
  diffAgainst,
  ensureStore,
  headOid,
  headTreeFiles,
  listLog,
  materializeCommit,
  snapshot
};
