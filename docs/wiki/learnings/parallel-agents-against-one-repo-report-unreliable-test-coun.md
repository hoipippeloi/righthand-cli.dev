---
type: Learning
title: Parallel agents against one repo report unreliable test counts
description: When multiple worker agents run in parallel **against the same repo working
tags: [testing, parallel-build, gotcha]
timestamp: "2026-07-24T13:07:25.094Z"
---

# Parallel agents against one repo report unreliable test counts

When multiple worker agents run in parallel **against the same repo working
copy** (not separate worktrees/branches), each reports a test count that is a
**snapshot of its own view at finish time** — not the integrated state. Their
counts overlap and contradict (e.g. one build round reported 60 / 89 / 109 / 120
from four workers that all ran the suite).

## Why it happens

Workers share one filesystem. As each finishes, others are still writing. A
worker's `npm test` reflects whatever files existed when *it* ran, which is
neither its isolated contribution nor the merged whole.

## What to do

- **Never trust parallel-worker test counts as the merged result.** Always run
  `npm test` yourself after the round fully completes to get the true integrated
  state, then fix any conflicts.
- For genuinely independent counts, give each worker its own worktree/branch and
  merge explicitly. The single-repo fan-out trades count reliability for
  zero-merge simplicity — fine, as long as you re-verify at the end.
- Pair this with [[foundation-first-fan-out-leaf-parallel-build]]: the foundation
  round (single owner) has a trustworthy count; only the parallel leaf rounds
  need the post-round re-verification.

## Evidence

righthand v1 build: Round A's five parallel workers reported 60/89/109/120; the
true integrated state after the round was 120/120, cold-start 113ms.
