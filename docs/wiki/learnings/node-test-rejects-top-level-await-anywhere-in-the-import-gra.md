---
type: Learning
title: node --test rejects top-level await anywhere in the import graph
description: `node --test` fails an entire test file with "Detected unsettled top-level await" if **any** module in the file's import graph uses top-level `await` — even a d
tags: [node, testing, typescript, righthand]
timestamp: "2026-07-24T12:21:38.252Z"
---

# node --test rejects top-level await anywhere in the import graph

`node --test` fails an entire test file with "Detected unsettled top-level await" if **any** module in the file's import graph uses top-level `await` — even a dependency's TLA, and even when the promise resolves fine.

I hit this designing `src/discover.ts`: I used top-level `await loadCore()` to build the command table at module load (so `getMergedManifest()` could stay sync). The probe `node /tmp/tla/use.ts` confirmed TLA works under Node 24 native TS stripping — but `npm test` (`node --test`) rejected it.

**Fix:** replaced TLA with a lazy memoized async init — `discoverCore()` returns a cached promise, built on first call; `getMergedManifest`/`findTool` became `async`. Minimal ripple (2 CLI call sites + test loops await).

**Rule of thumb:** in this repo, keep top-level await out of any module reachable from `test/**`. Use a memoized `async function ensureX()` instead.
