---
type: Learning
title: Cold-start ~177ms after discovery; isomorphic-git kept off the cold path
description: After wiring auto-discovery (9 core command files, each importing its deps), `righthand tools` subprocess cold-start rose from the **94 ms** baseline (3 command
tags: [cold-start, performance, isomorphic-git, discovery, righthand]
timestamp: "2026-07-24T12:21:48.021Z"
---

# Cold-start ~177ms after discovery; isomorphic-git kept off the cold path

After wiring auto-discovery (9 core command files, each importing its deps), `righthand tools` subprocess cold-start rose from the **94 ms** baseline (3 commands) to **~177 ms warm** (runs 170–192 ms across 5 samples) on Node 24. Still under the 200 ms C1 budget, but the headroom shrank.

**The cost is real and expected:** discovery now dynamically imports all 9 command modules + their transitive graph (`config`, `footprint`, `journal`, `versionstore`, `ulid`, `confirm`) at startup.

**The thing that matters held:** `isomorphic-git` (the only heavy dep, 55 packages) is **NOT** on the cold path. Verified by checking the require cache after importing the full discovery graph — isomorphic-git is absent. It's lazy-imported inside `versionstore.ts` functions (`await import("isomorphic-git")`), so importing the module is free; only a mutating command that actually touches the store pays for it.

**Lever if budget tightens later:** the manifest-merge loads every command module. If cold-start regresses past 200 ms, the move is to defer importing mutating command modules (config/init/changes/rollback/reset) until dispatched — i.e. split discovery into "descriptors eagerly" vs "run handlers lazily". Not needed yet.

Data point collected 2026-07-24, Node 24.15.0, Windows.
