---
type: Artifact
title: README.html interactive README
description: A self-contained, interactive HTML README at the repo root — the rich, visual companion to the shorthand `README.md`. Built with the `html-docs` skill (feature-
tags: [readme, html-docs, artifact]
timestamp: "2026-07-24T16:42:25.472Z"
---

# README.html interactive README

A self-contained, interactive HTML README at the repo root — the rich, visual companion to the shorthand `README.md`. Built with the `html-docs` skill (feature-explainer template), with a mermaid dispatch-flow diagram as its centerpiece.

## What it documents

- [righthand-cli](./righthand-cli.md) — what righthand is and why it exists (TL;DR + stat pills)
- The **dispatch flow** — manifest lookup → capability check → approval gate → run handler → history (rendered as an interactive SVG; drag-pan, wheel-zoom, reset, fullscreen)
- The full 21-command surface (table) — see `righthand tools`
- Configuration: layered `config.json` + `.env`, deny-by-default capability model ([plugin-sandbox-capability-declaration-permission-flags-subpr](./plugin-sandbox-capability-declaration-permission-flags-subpr.md))
- Enhance pathways: drop-a-file auto-discovery, `new` scaffolder, `build` self-builder, plugins

## Details

- **Location**: `README.html` (repo root); coexists with `README.md`.
- **Format**: single self-contained `.html`, zero external deps, system fonts, semantic HTML, `prefers-color-scheme` dark mode, `@media print` button, responsive (nav collapses on mobile).
- **Diagram source**: `.work/righthand-flow.mmd` → raw `.work/righthand-flow.svg` → post-processed `.work/righthand-flow.clean.svg` (embedded inline). See [inline-mermaid-svgs-fail-silently-on-import-var-color-mix](./inline-mermaid-svgs-fail-silently-on-import-var-color-mix.md) for why post-processing is required.
- **Built with**: `E:\skills.te9.dev\html-docs\SKILL.md` (feature-explainer template #14) + `pretty-mermaid` renderer.

## Source

- `README.html` — the artifact itself
- `.work/righthand-flow.mmd` — mermaid source for the dispatch-flow diagram
