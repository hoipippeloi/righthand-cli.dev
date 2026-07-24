// C5 — Self-Recursive Self-Builder (righthand's signature capability).
//
// The LLM writes a NEW command into righthand itself:
//   generate -> extract -> validate -> smoke-test -> (confirm) -> install
// Every install is journaled (snapshot before/after) so it is rollback-able
// (C7), and — because discover.ts now scans footprint command dirs — the new
// command is immediately auto-discovered + dispatchable.
//
// TEST SEAM: every function takes an injectable `complete` fn (default the real
// one) so tests inject canned LLM responses with no network. See
// .prds/righthand-cli/prd.md §C5.
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { makeEnvelope } from "./envelope.ts";
import { CommandError } from "./errors.ts";
import { complete } from "./llm.ts";
import type { LlmMessage, LlmRequest, LlmResponse, CompleteOptions } from "./llm.ts";
import { journal } from "./journal.ts";
import { footprintFor, ensureFootprintDirs, type Scope } from "./footprint.ts";
import { validateName } from "./scaffold.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import type { Config, CommandContext, Envelope } from "./contracts.ts";

export type CompleteFn = (
  req: LlmRequest,
  opts?: CompleteOptions,
) => Promise<LlmResponse>;

// The authoring contract the LLM generates against. Mirrors src/scaffold.ts +
// the strip-only-TS rules (Node 24 / Bun run .ts directly with no build step).
// Generated code is SELF-CONTAINED: type-only imports are erased at load, so
// the file imports cleanly from a temp smoke dir AND from the footprint commands
// dir — no runtime resolution of "../contracts.ts" required. See
// docs/wiki/learnings/node-strip-only-typescript-rejects-parameter-properties-enum.md
export const AUTHORING_CONTRACT = `You generate righthand command files. Respond with ONLY a single fenced TypeScript code block — no prose before or after.

A righthand command module exports:
- descriptor: { name (kebab-case string), description (string), inputSchema (JSON-schema object), plugin (string), costTier ("free" | "cheap" | "expensive"), capabilities? (string[]) }
- run(ctx): an async function taking { args, flags, config, isTTY } and returning an Envelope: { ok: boolean, command: string, summary: string, result: unknown, needs_human: string | null, meta: { version: string, duration_ms: number, change_id: string | null, tokens_used: number } }
- optional cli: { args?: object, scope?: boolean }

HARD CONSTRAINTS — the file runs with NO build step, via Node/Bun native TypeScript type-stripping:
1. Strip-only TypeScript only. Do NOT use: enum, parameter properties (e.g. constructor(public x: number)), namespace, or runtime decorators.
2. SELF-CONTAINED. Do NOT add any runtime import. You MAY use a type-only import for annotations only: import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts" (erased at load). Construct the returned Envelope as an INLINE object literal; do NOT import makeEnvelope or any other value.
3. run() MUST succeed when called with empty input (args {}, flags {}) — it is smoke-tested that way before install. Return a valid Envelope; never throw on empty input.
4. Use this exact meta literal: { version: "0.0.1", duration_ms: 0, change_id: null, tokens_used: 0 }.

Respond with ONLY the fenced TypeScript code block.`;

// Pull the first fenced ```ts block out of an LLM response; fall back to the
// whole text when there is no fence.
export function extractCodeBlock(text: string): string {
  const m = text.match(/```(?:ts|typescript)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

// Structural validation: a command file must export `descriptor` + `run`.
// Returns an error message, or null when valid.
export function validateStructure(code: string): string | null {
  if (!/export\s+const\s+descriptor\b/.test(code)) {
    return "missing `export const descriptor`";
  }
  if (!/export\s+(?:async\s+)?function\s+run\b/.test(code)) {
    return "missing `export function run` (or `export async function run`)";
  }
  return null;
}

// Derive a kebab-case command name from a natural-language description.
export function deriveName(description: string): string {
  const tokens = description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let name = tokens.slice(0, 3).join("-");
  name = name.replace(/^[^a-z]+/, ""); // must start with a letter
  name = name.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return name && /^[a-z]/.test(name) ? name : "command";
}

export interface GenerateOptions {
  description: string;
  config: Config;
  provider?: string;
  complete?: CompleteFn;
}

// 1-2. Ask the LLM for a command file; extract the code block.
export async function generateCommand(
  opts: GenerateOptions,
): Promise<{ code: string; tokensUsed: number; model: string }> {
  const completeFn = opts.complete ?? complete;
  const messages: LlmMessage[] = [
    { role: "system", content: AUTHORING_CONTRACT },
    { role: "user", content: `Write a righthand command that: ${opts.description}` },
  ];
  const res = await completeFn(
    { provider: opts.provider ?? "", messages },
    { config: opts.config },
  );
  return { code: extractCodeBlock(res.text), tokensUsed: res.tokensUsed, model: res.model };
}

export interface SmokeResult {
  ok: boolean;
  error?: string;
}

// 4. Smoke test: write to a temp file, import it, assert it exports
// descriptor + run, then call run() with a dummy ctx and assert the return is
// an object with ok/command/summary. Cleans up the temp file either way.
export async function smokeTest(code: string): Promise<SmokeResult> {
  const dir = mkdtempSync(join(tmpdir(), "rh-build-smoke-"));
  const file = join(dir, "cmd.ts");
  writeFileSync(file, code, "utf8");
  try {
    let mod: { descriptor?: unknown; run?: unknown };
    try {
      mod = (await import(pathToFileURL(file).href)) as typeof mod;
    } catch (e) {
      return { ok: false, error: `import failed: ${(e as Error).message}` };
    }
    if (!mod.descriptor || typeof mod.run !== "function") {
      return { ok: false, error: "module does not export `descriptor` + `run`" };
    }
    const dummyCtx: CommandContext = {
      args: {},
      flags: {},
      config: DEFAULT_CONFIG,
      isTTY: false,
    };
    let env: unknown;
    try {
      env = await (mod.run as (c: CommandContext) => Promise<unknown>)(dummyCtx);
    } catch (e) {
      return { ok: false, error: `run() threw: ${(e as Error).message}` };
    }
    if (!env || typeof env !== "object") {
      return { ok: false, error: "run() did not return an object" };
    }
    const e = env as Record<string, unknown>;
    if (!("ok" in e) || !("command" in e) || !("summary" in e)) {
      return { ok: false, error: "run() return is missing ok/command/summary fields" };
    }
    return { ok: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 6. Install: write the validated file to <footprint>/commands/<name>.ts inside
// a journal before/after snapshot pair (rollback-able). Returns path + change_id.
export async function installCommand(
  scope: Scope,
  name: string,
  code: string,
): Promise<{ path: string; change_id: string }> {
  const fp = footprintFor(scope);
  const path = join(fp.root, "commands", `${name}.ts`);
  const change_id = await journal(scope, `build ${name}`, () => {
    ensureFootprintDirs(fp);
    mkdirSync(join(fp.root, "commands"), { recursive: true });
    writeFileSync(path, code, "utf8");
  });
  return { path, change_id };
}

export interface BuildInput {
  description: string;
  scope: Scope;
  name?: string; // explicit kebab name; derived when omitted
  yes: boolean;
  dryRun: boolean;
  config: Config;
  provider?: string;
  complete?: CompleteFn; // TEST SEAM: inject a canned LLM response
}

// The full self-builder pipeline, returning a bounded Envelope. Exit codes are
// derived by dispatch from the envelope (ok:false & no needs_human -> 1;
// needs_human -> 3; ok -> 0).
export async function buildCommand(input: BuildInput): Promise<Envelope> {
  const name = input.name && input.name.length ? input.name : deriveName(input.description);
  const nameErr = validateName(name);
  if (nameErr) {
    return makeEnvelope({ command: "build", ok: false, summary: nameErr });
  }

  // 1-2. generate + extract
  let gen: { code: string; tokensUsed: number; model: string };
  try {
    gen = await generateCommand({
      description: input.description,
      config: input.config,
      provider: input.provider,
      complete: input.complete,
    });
  } catch (e) {
    // AUTH (no provider/key) + other structured command errors propagate to
    // dispatch so the right exit code surfaces (exit 4 for AUTH) — consistent
    // with `llm ask`. Only wrap UNEXPECTED (non-CommandError) failures.
    if (e instanceof CommandError) throw e;
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `LLM generation failed: ${(e as Error).message}`,
      needs_human: `the LLM call failed (${(e as Error).message}). Check provider config + key, then retry.`,
    });
  }

  // 3. validate structure
  const structErr = validateStructure(gen.code);
  if (structErr) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `validation failed: ${structErr}`,
      result: { name, code: gen.code, tokensUsed: gen.tokensUsed },
    });
  }

  // 4. smoke test
  const smoke = await smokeTest(gen.code);
  if (!smoke.ok) {
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `smoke test failed: ${smoke.error}`,
      result: { name, code: gen.code, smoke: smoke.error, tokensUsed: gen.tokensUsed },
    });
  }

  // dry-run: return the validated code without writing
  if (input.dryRun) {
    return makeEnvelope({
      command: "build",
      summary: `generated ${name}: smoke passed (dry-run, not installed)`,
      result: { name, code: gen.code, smoke: "passed", tokensUsed: gen.tokensUsed, dry_run: true },
    });
  }

  // 5. confirm: without --yes, show the code and escalate. (The dispatch-level
  // approval gate already short-circuits an expensive command without --yes;
  // this branch is reached when auto_confirm_destructive bypasses that gate.)
  if (!input.yes) {
    const path = join(footprintFor(input.scope).root, "commands", `${name}.ts`);
    return makeEnvelope({
      command: "build",
      ok: false,
      summary: `generated ${name}: review, then re-run with --yes to install`,
      result: { name, code: gen.code, smoke: "passed", tokensUsed: gen.tokensUsed },
      needs_human: `review the generated command; re-run with --yes to install at ${path}`,
    });
  }

  // 6. install (journaled → rollback-able; immediately discoverable)
  const { path, change_id } = await installCommand(input.scope, name, gen.code);
  return makeEnvelope({
    command: "build",
    summary: `built ${name} -> ${path}`,
    result: { name, path, smoke: "passed", tokensUsed: gen.tokensUsed },
    meta: { change_id, tokens_used: gen.tokensUsed },
  });
}
