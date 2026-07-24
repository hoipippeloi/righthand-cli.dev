import {
  ensureFootprintDirs,
  footprintFor
} from "./footprint.js";
import { changeId } from "./ulid.js";
import {
  ensureStore,
  snapshot,
  listLog,
  materializeCommit,
  diffAgainst
} from "./versionstore.js";
async function journal(scope, summary, mutate) {
  const fp = footprintFor(scope);
  ensureFootprintDirs(fp);
  await ensureStore(fp);
  const id = changeId();
  await snapshot(fp, `before:${id}`);
  await mutate();
  await snapshot(fp, `after:${id} ${summary}`);
  return id;
}
async function listChanges(scope, opts = {}) {
  const fp = footprintFor(scope);
  const log = await listLog(fp, opts);
  const byId = /* @__PURE__ */ new Map();
  for (const row of log) {
    const m = /^((?:before|after)):(\S+)/.exec(row.message);
    if (!m) continue;
    const [, which, id] = m;
    const entry = byId.get(id) ?? { before: void 0, after: void 0 };
    if (which === "before") entry.before = row.oid;
    else entry.after = row;
    byId.set(id, entry);
  }
  const changes = [];
  for (const [id, e] of byId) {
    if (!e.before || !e.after) continue;
    changes.push({
      change_id: id,
      scope,
      ts: new Date(e.after.timestamp * 1e3).toISOString(),
      summary: e.after.message.replace(/^after:\S+\s?/, ""),
      before: e.before,
      after: e.after.oid
    });
  }
  changes.sort((a, b) => a.change_id < b.change_id ? 1 : -1);
  return changes;
}
async function planRevert(scope, target) {
  const fp = footprintFor(scope);
  const changes = await listChanges(fp.scope);
  let change;
  if (target.to) {
    change = changes.find((c) => c.change_id === target.to);
  } else {
    const n = target.steps && target.steps > 0 ? target.steps : 1;
    change = changes[n - 1];
  }
  if (!change) {
    throw new Error(
      target.to ? `unknown change id: ${target.to}` : "no changes to roll back"
    );
  }
  const files = await diffAgainst(fp, change.before);
  return { change_id: change.change_id, targetOid: change.before, files };
}
async function revertTo(scope, target, summary) {
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
export {
  journal,
  listChanges,
  planRevert,
  revertTo
};
