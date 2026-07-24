---
type: Rule
title: Foundation-first, fan-out-leaf parallel build
description: Guideline
tags: [orchestration, parallel-build, autonomous-build, build-order]
timestamp: "2026-07-24T13:07:25.094Z"
---

# Foundation-first, fan-out-leaf parallel build

## Guideline

When autonomously building a coherent system across parallel agents, **build and
independently verify the load-bearing foundation first**, THEN fan out leaf
capabilities to parallel workers against those stable contracts.

**Foundation = the shared spine.** For righthand that is: the contracts
(`src/contracts.ts`), dispatch + capability sandbox (`runtime.ts`,
`capabilities.ts`), auto-discovery (`discover.ts`, `cli.ts`), and the rollback
store (`versionstore.ts`, `journal.ts`). Everything else hangs off these.

**Fan-out = independent leaf work.** Once contracts are stable and verified, leaf
capabilities (one command per file, read-only imports + new files) are
collision-free to build in parallel.

## When it applies

Any multi-agent / parallel build of a system with a shared core. Also the right
shape for a single agent doing autonomous "build everything" work: do the spine
in one coherent pass, then the leaves.

## How to execute it (the pattern that worked)

1. Build the foundation in one continuous, coherent effort. Run the full suite
   and confirm cold-start / budget bars independently before fanning out.
2. **Assign single ownership of each shared file.** Parallel workers must not
   edit the same file. For righthand: only the sandbox worker touched
   `runtime.ts`; only the self-builder touched `discover.ts`; every other worker
   owned its own `src/commands/<name>.ts` + `test/<name>.test.ts`.
3. Make the CLI auto-discover subcommands from the discovered command table
   (not hardcoded) so leaf workers can add commands with **zero shared-file
   edits** — dropping a file is the only step.
4. Fan out rounds: Round A = leaf capabilities depending only on the foundation;
   Round B = capabilities depending on Round A modules.
5. **After each parallel round, re-run the true integrated suite** — the
   workers' reported counts are unreliable (see
   [[parallel-agents-against-one-repo-report-unreliable-test-coun]]). Integrate and
   smoke-test before proceeding.

## Rationale

The foundation must stay internally coherent (contracts, dispatch, exit codes,
sandbox) — splitting it across agents produces merge conflicts and subtle
inconsistencies. Leaf capabilities are independent by construction, so they
parallelize cleanly. Single-owner shared files + auto-discovery are what made an
8-parallel-agent build collision-free. Result: 166/166 tests, 20 commands,
cold-start ~115ms, no merge conflicts survived.

## Evidence

Autonomous greenfield build of righthand v1 (PRD → specs → all 10 capabilities).
Foundation verified at 42/42 (124ms), Round A integrated at 120/120 (113ms),
Round B integrated at 166/166 (116ms). Signature loop proven live.
