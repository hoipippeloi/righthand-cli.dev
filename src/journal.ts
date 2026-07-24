// Journal: snapshot-before -> mutate -> snapshot-after, keyed by a change_id.
// Powers `changes`, `rollback` (C7). Rollback is itself a journaled mutation
// (undo-the-undo). Light static import graph — isomorphic-git is lazy.
import {
  ensureFootprintDirs,
  footprintFor,
  type Footprint,
  type Scope,
} from "./footprint.ts";
import { changeId } from "./ulid.ts";
import {
  ensureStore,
  snapshot,
  listLog,
  materializeCommit,
  diffAgainst,
  type CommitRow,
} from "./versionstore.ts";

export interface Change {
  change_id: string;
  scope: Scope;
  ts: string;
  summary: string;
  before: string;
  after: string;
}

// Run a mutation inside a before/after snapshot pair. Returns the change_id.
export async function journal(
  scope: Scope,
  summary: string,
  mutate: () => Promise<void> | void,
): Promise<string> {
  const fp = footprintFor(scope);
  ensureFootprintDirs(fp);
  await ensureStore(fp);
  const id = changeId();
  await snapshot(fp, `before:${id}`);
  await mutate();
  await snapshot(fp, `after:${id} ${summary}`);
  return id;
}

// Parse the commit log into Changes (most-recent first), pairing before/after
// by change_id. `after` carries the timestamp + summary.
export async function listChanges(
  scope: Scope,
  opts: { last?: number } = {},
): Promise<Change[]> {
  const fp = footprintFor(scope);
  const log = await listLog(fp, opts);
  const byId = new Map<string, { before?: string; after?: CommitRow }>();
  for (const row of log) {
    const m = /^((?:before|after)):(\S+)/.exec(row.message);
    if (!m) continue;
    const [, which, id] = m;
    const entry = byId.get(id) ?? { before: undefined, after: undefined };
    if (which === "before") entry.before = row.oid;
    else entry.after = row;
    byId.set(id, entry);
  }
  const changes: Change[] = [];
  for (const [id, e] of byId) {
    if (!e.before || !e.after) continue; // incomplete pair → skip
    changes.push({
      change_id: id,
      scope,
      ts: new Date(e.after.timestamp * 1000).toISOString(),
      summary: e.after.message.replace(/^after:\S+\s?/, ""),
      before: e.before,
      after: e.after.oid,
    });
  }
  // Most recent (by time-sortable change_id) first. The commit timestamp can
  // collide within the same second; the ULID change_id never ties ambiguously.
  changes.sort((a, b) => (a.change_id < b.change_id ? 1 : -1));
  return changes;
}

export interface RevertTarget {
  to?: string; // change_id
  steps?: number; // undo last N (default 1)
}

export interface RevertPlan {
  change_id: string | null;
  targetOid: string;
  files: string[];
}

// Resolve the before-commit oid to restore for a target, plus the files that
// would change. Used by `rollback --dry-run` and internally by revertTo.
export async function planRevert(
  scope: Scope,
  target: RevertTarget,
): Promise<RevertPlan> {
  const fp = footprintFor(scope);
  const changes = await listChanges(fp.scope);
  let change: Change | undefined;
  if (target.to) {
    change = changes.find((c) => c.change_id === target.to);
  } else {
    const n = target.steps && target.steps > 0 ? target.steps : 1;
    // Undoing N changes → restore to the BEFORE of the Nth-most-recent change.
    change = changes[n - 1];
  }
  if (!change) {
    throw new Error(
      target.to ? `unknown change id: ${target.to}` : "no changes to roll back",
    );
  }
  const files = await diffAgainst(fp, change.before);
  return { change_id: change.change_id, targetOid: change.before, files };
}

// Apply a rollback: materialize the target commit into the workdir and record
// the rollback as its own journaled change (undo-the-undo).
export async function revertTo(
  scope: Scope,
  target: RevertTarget,
  summary: string,
): Promise<{ change_id: string; written: string[]; deleted: string[] }> {
  const fp = footprintFor(scope);
  ensureFootprintDirs(fp);
  await ensureStore(fp);
  const { targetOid } = await planRevert(scope, target);
  const id = changeId();
  await snapshot(fp, `before:${id}`);
  const { written, deleted } = await materializeCommit(fp, targetOid);
  await snapshot(fp, `after:${id} rollback: ${summary}`);
  return { change_id: id, written, deleted };
}
