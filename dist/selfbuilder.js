import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { makeEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import { complete } from "./llm.js";
import { journal } from "./journal.js";
import { footprintFor, ensureFootprintDirs } from "./footprint.js";
import { validateName } from "./scaffold.js";
import { DEFAULT_CONFIG } from "./config.js";
const AUTHORING_CONTRACT = `You generate righthand command files. Respond with ONLY a single fenced TypeScript code block \u2014 no prose before or after.

A righthand command module exports:
- descriptor: { name (kebab-case string), description (string), inputSchema (JSON-schema object), plugin (string), costTier ("free" | "cheap" | "expensive"), capabilities? (string[]) }
- run(ctx): an async function taking { args, flags, config, isTTY } and returning an Envelope: { ok: boolean, command: string, summary: string, result: unknown, needs_human: string | null, meta: { version: string, duration_ms: number, change_id: string | null, tokens_used: number } }
- optional cli: { args?: object, scope?: boolean }

HARD CONSTRAINTS \u2014 the file runs with NO build step, via Node/Bun native TypeScript type-stripping:
1. Strip-only TypeScript only. Do NOT use: enum, parameter properties (e.g. constructor(public x: number)), namespace, or runtime decorators.
2. SELF-CONTAINED. Do NOT add any runtime import. You MAY use a type-only import for annotations only: import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.js" (erased at load). Construct the returned Envelope as an INLINE object literal; do NOT import makeEnvelope or any other value.
3. run() MUST succeed when called with empty input (args {}, flags {}) \u2014 it is smoke-tested that way before install. Return a valid Envelope; never throw on empty input.
4. Use this exact meta literal: { version: "0.0.1", duration_ms: 0, change_id: null, tokens_used: 0 }.

Respond with ONLY the fenced TypeScript code block.`;
function extractCodeBlock(text) {
  const m = text.match(/```(?:ts|typescript)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}
function validateStructure(code) {
  if (!/export\s+const\s+descriptor\b/.test(code)) {
    return "missing `export const descriptor`";
  }
  if (!/export\s+(?:async\s+)?function\s+run\b/.test(code)) {
    return "missing `export function run` (or `export async function run`)";
  }
  return null;
}
function deriveName(description) {
  const tokens = description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let name = tokens.slice(0, 3).join("-");
  name = name.replace(/^[^a-z]+/, "");
  name = name.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return name && /^[a-z]/.test(name) ? name : "command";
}
async function generateCommand(opts) {
  const completeFn = opts.complete ?? complete;
  const messages = [
    { role: "system", content: AUTHORING_CONTRACT },
    { role: "user", content: `Write a righthand command that: ${opts.description}` }
  ];
  const res = await completeFn(
    { provider: opts.provider ?? "", messages },
    { config: opts.config }
  );
  return { code: extractCodeBlock(res.text), tokensUsed: res.tokensUsed, model: res.model };
}
async function smokeTest(code) {
  const dir = mkdtempSync(join(tmpdir(), "rh-build-smoke-"));
  const file = join(dir, "cmd.ts");
  writeFileSync(file, code, "utf8");
  try {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (e2) {
      return { ok: false, error: `import failed: ${e2.message}` };
    }
    if (!mod.descriptor || typeof mod.run !== "function") {
      return { ok: false, error: "module does not export `descriptor` + `run`" };
    }
    const dummyCtx = {
      args: {},
      flags: {},
      config: DEFAULT_CONFIG,
      isTTY: false
    };
    let env;
    try {
      env = await mod.run(dummyCtx);
    } catch (e2) {
      return { ok: false, error: `run() threw: ${e2.message}` };
    }
    if (!env || typeof env !== "object") {
      return { ok: false, error: "run() did not return an object" };
    }
    const e = env;
    if (!("ok" in e) || !("command" in e) || !("summary" in e)) {
      return { ok: false, error: "run() return is missing ok/command/summary fields" };
    }
    return { ok: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function installCommand(scope, name, code) {
  const fp = footprintFor(scope);
  const path = join(fp.root, "commands", `${name}.ts`);
  const change_id = await journal(scope, `build ${name}`, () => {
    ensureFootprintDirs(fp);
    mkdirSync(join(fp.root, "commands"), { recursive: true });
    writeFileSync(path, code, "utf8");
  });
  return { path, change_id };
}
async function buildCommand(input) {
  const name = input.name && input.name.length ? input.name : deriveName(input.description);
  const nameErr = validateName(name);
  if (nameErr) {
    return makeEnvelope({ command: "build", ok: false, summary: nameErr });
  }
  let gen;
  try {
    gen = await generateCommand({
      description: input.description,
      config: input.config,
      provider: input.provider,
      complete: input.complete
    });
  } catch (e) {
    if (e instanceof CommandError) throw e;
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `LLM generation failed: ${e.message}`,
      needs_human: `the LLM call failed (${e.message}). Check provider config + key, then retry.`
    });
  }
  const structErr = validateStructure(gen.code);
  if (structErr) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `validation failed: ${structErr}`,
      result: { name, code: gen.code, tokensUsed: gen.tokensUsed }
    });
  }
  const smoke = await smokeTest(gen.code);
  if (!smoke.ok) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `smoke test failed: ${smoke.error}`,
      result: { name, code: gen.code, smoke: smoke.error, tokensUsed: gen.tokensUsed }
    });
  }
  if (input.dryRun) {
    return makeEnvelope({
      command: "build",
      summary: `generated ${name}: smoke passed (dry-run, not installed)`,
      result: { name, code: gen.code, smoke: "passed", tokensUsed: gen.tokensUsed, dry_run: true }
    });
  }
  if (!input.yes) {
    const path2 = join(footprintFor(input.scope).root, "commands", `${name}.ts`);
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `generated ${name}: review, then re-run with --yes to install`,
      result: { name, code: gen.code, smoke: "passed", tokensUsed: gen.tokensUsed },
      needs_human: `review the generated command; re-run with --yes to install at ${path2}`
    });
  }
  const { path, change_id } = await installCommand(input.scope, name, gen.code);
  return makeEnvelope({
    command: "build",
    summary: `built ${name} -> ${path}`,
    result: { name, path, smoke: "passed", tokensUsed: gen.tokensUsed },
    meta: { change_id, tokens_used: gen.tokensUsed }
  });
}
export {
  AUTHORING_CONTRACT,
  buildCommand,
  deriveName,
  extractCodeBlock,
  generateCommand,
  installCommand,
  smokeTest,
  validateStructure
};
