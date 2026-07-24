#!/usr/bin/env node
// Publish-time compiler: src/ TypeScript → dist/ JavaScript (ESM), per-file (NO bundling).
//
// Why this exists: Node refuses to type-strip any .ts that lives under node_modules
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — a deliberate location guard, no flag
// overrides it). The dev entry (`node bin/righthand.ts`) runs source directly and is
// unaffected, but the published npm artifact runs from node_modules and MUST be .js.
//
// Per-file (not bundled) so discover.ts's runtime command discovery keeps working:
// it scans a directory and dynamically imports whatever .ts/.js it finds. We compile
// each src file 1:1 into dist/ and rewrite relative import specifiers `.ts` → `.js`.
// At runtime `import.meta.url` resolves HERE to dist/, so discovery finds dist/commands/*.js.
//
// esbuild is a devDependency ONLY. Runtime deps stay citty + isomorphic-git.
// If esbuild isn't resolvable (e.g. prepare runs where devDeps are absent), we no-op:
// the tarball must already contain a prebuilt dist/ in that case.

let transform;
try {
  ({ transform } = await import("esbuild"));
} catch {
  console.warn("[build] esbuild unavailable — skipping compile (dist must be prebuilt).");
  process.exit(0);
}

import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { dirname, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");
const BIN_ENTRY = join(SRC, "cli.ts"); // → dist/cli.js, the published bin target

// Matches a QUOTED relative path ending in .ts: "./x.ts", '../y/z.ts', './commands/a.ts'.
// Deliberately excludes bare ".ts" and "cmd.ts" (no ./ ../ prefix → runtime logic, not imports)
// and "./commands/"+f (ends in /, not .ts). Safe for this codebase per recon.
const TS_SPEC = /(["'])(\.\.?\/[^"']*?)\.ts\1/g;
const rewriteSpecifiers = (code) => code.replace(TS_SPEC, (_m, q, p) => `${q}${p}.js${q}`);

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

await rm(OUT, { recursive: true, force: true });
let compiled = 0;
let copied = 0;

for (const file of await walk(SRC)) {
  const rel = relative(SRC, file);
  const dest = join(OUT, rel);
  await mkdir(dirname(dest), { recursive: true });

  if (extname(file) === ".ts") {
    const { code } = await transform(await readFile(file, "utf8"), {
      loader: "ts",
      format: "esm",
      target: "node20",
      sourcefile: file,
    });
    let out = rewriteSpecifiers(code);
    if (file === BIN_ENTRY) out = `#!/usr/bin/env node\n${out}`;
    await writeFile(dest.replace(/\.ts$/, ".js"), out);
    compiled++;
  } else {
    // Non-TS asset (e.g. src/web/app.html) — copy verbatim, HERE-relative at runtime.
    await copyFile(file, dest);
    copied++;
  }
}

console.log(`[build] ${compiled} compiled, ${copied} copied → dist/`);
