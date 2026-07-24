---
type: Decision
title: Node + TypeScript is the runtime for righthand
description: Context
tags: [architecture, runtime, node, typescript, righthand, cold-start]
status: accepted
timestamp: "2026-07-24T10:36:10.712Z"
---

# Node + TypeScript is the runtime for righthand

## Context

righthand's tech stack was an explicit open question (the `righthand-cli` entity
listed it as undecided: Node/TS, Python, Go, Rust all on the table). Runtime
choice is foundational — it constrains the build tooling, packaging, plugin
loading, and the cold-start budget. The user's stated wants were: **"run on node"**,
and **"fast."**

This is not independent of the [[stateless-subprocess-invocation]] model: because
righthand is spawned fresh per task and torn down when it finishes, **cold-start
latency is paid on every single invocation**. The runtime has to boot fast, or
the tool feels slow to the main agent that shells out to it.

## Choice

**Node, with TypeScript.**

## Alternatives considered

- **Python** — rich ecosystem, but slower cold-start and heavier packaging story for a distributable binary/CLI.
- **Go** — fast startup and clean single-binary distribution, but a weaker fit for the dynamic plugin-loading model the user wants.
- **Rust** — best startup/perf, but highest iteration cost and a heavier story for third-party plugin authors.

## Rationale

- The user explicitly asked for Node.
- Node boots fast, and cold-start can be kept **lean via lazy plugin loading** (load a task's code only when that task is invoked) — directly serving the "fast" requirement under the per-task subprocess model.
- TypeScript adds type safety and ergonomics with negligible runtime cost.
- The Node/npm ecosystem serves the distribution + plugin story naturally (installable, discoverable, versioned packages).

## Consequences

- Build tooling is Node/TS (e.g. tsc / esbuild); distribution leans on npm.
- **Plugin loading MUST stay lazy** to honor the cold-start constraint — every eagerly-loaded plugin is a tax on every invocation. This is now a hard design rule, not a nice-to-have.
- All plugin/task author tooling and docs are Node/TS-flavored.

## Status

Accepted — stated by the user during the Phase-2 PRD interview (Q3). Working
baseline until a spec supersedes it. Resolves open question #2 ("language/runtime")
on [[righthand-cli]].
