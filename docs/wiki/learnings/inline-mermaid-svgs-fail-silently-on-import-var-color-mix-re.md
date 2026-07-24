---
type: Learning
title: Inline mermaid SVGs fail silently on @import, var(), color-mix() — resolve to explicit hex before embedding
description: When embedding a mermaid-rendered SVG **inline** in an HTML doc (e.g. `README.html` built via the `html-docs` skill + `pretty-mermaid`), the raw SVG is not drop
tags: [html-docs, svg, mermaid, gotcha]
timestamp: "2026-07-24T16:42:25.471Z"
---

# Inline mermaid SVGs fail silently on @import, var(), color-mix() — resolve to explicit hex before embedding

When embedding a mermaid-rendered SVG **inline** in an HTML doc (e.g. `README.html` built via the `html-docs` skill + `pretty-mermaid`), the raw SVG is not drop-in safe. It contains:

- a **Google Fonts `@import`** line,
- **`var(--foo)`** CSS custom-property references (no `:root` resolves them inside an inline SVG),
- **`color-mix(...)`** calls.

All three **silently fail** in inline/`<foreignObject>` contexts: the font never loads (falls back to default), and `var()`/`color-mix()` resolve to nothing — so text/strokes render transparent or as a black default. There is no error; the diagram just looks wrong or empty.

## The fix — post-process before embedding

1. Strip the Google Fonts `@import` line (system fonts only; the html-docs skill is zero-external-deps by convention).
2. Replace every `var(--x)` and `color-mix(...)` with an **explicit hex** lifted from the theme palette.
3. Fix **double-escaped entities** that the render/escape pipeline can introduce: `&amp;lt;` → `<`, and surrounding `&quot;` → `"` in SVG text nodes.

## Where it applies

Any inline-SVG diagram in this repo: `README.html`, `docs/wiki/wiki-viewer.html`, and future HTML docs. `.work/righthand-flow.svg` is the raw render; `righthand-flow.clean.svg` is the post-processed version that actually gets embedded.

## Lesson

A mermaid SVG is a *source*, not a finished asset, once it goes inline. Always run the post-processor (strip imports → resolve vars → unescape) before embedding, or the diagram degrades silently.
