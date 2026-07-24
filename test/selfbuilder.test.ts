import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCommand,
  smokeTest,
  extractCodeBlock,
  validateStructure,
  deriveName,
  AUTHORING_CONTRACT,
  type CompleteFn,
} from "../src/selfbuilder.ts";
import { discoverCore, resetDiscovery } from "../src/discover.ts";
import { dispatch } from "../src/runtime.ts";
import { footprintFor } from "../src/footprint.ts";
import { listChanges } from "../src/journal.ts";
import { EXIT, type Config, type CommandContext } from "../src/contracts.ts";
import type { LlmRequest, CompleteOptions, LlmResponse } from "../src/llm.ts";

// Isolated footprints — NEVER touch the real ~/.righthand or the repo's
// ./.righthand. RIGHTHAND_*_ROOT overrides are the project's own test seam.
const PROJ = mkdtempSync(join(tmpdir(), "rh-build-proj-"));
const USER = mkdtempSync(join(tmpdir(), "rh-build-user-"));

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
  process.env.RIGHTHAND_USER_ROOT = USER;
});
after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  delete process.env.RIGHTHAND_USER_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
  rmSync(USER, { recursive: true, force: true });
});

function cfg(allow: string[] = [], defaults: { provider?: string } = {}): Config {
  return {
    providers: { test: { type: "openai-compatible", apiKey: "sk-test", model: "m" } },
    plugins: [],
    permissions: { allow, deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10000, ...defaults },
  };
}

// Canned LLM: wraps the code in a fenced block so extractCodeBlock is exercised.
function canned(code: string, tokensUsed = 12): CompleteFn {
  return async (_req: LlmRequest, _opts?: CompleteOptions): Promise<LlmResponse> => ({
    text: "```ts\n" + code + "\n```",
    model: "canned",
    tokensUsed,
    finishReason: "stop",
  });
}

// A self-contained, strip-only command (type-only import erased at load).
const VALID_CMD = `import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "hello-built",
  description: "a generated hello command",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@local",
  costTier: "free",
};

export async function run(_ctx: CommandContext): Promise<Envelope> {
  return {
    ok: true,
    command: "hello-built",
    summary: "hello from a generated command",
    result: { msg: "hi" },
    needs_human: null,
    meta: { version: "0.0.1", duration_ms: 0, change_id: null, tokens_used: 0 },
  };
}
`;

// Missing run -> fails structural validation (step 3) before any smoke test.
const MISSING_RUN = `import type { ToolDescriptor } from "../contracts.ts";
export const descriptor: ToolDescriptor = {
  name: "bad", description: "x",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@local", costTier: "free",
};
`;

// Has descriptor + run, but run() throws -> fails the smoke test (step 4).
const THROWS_RUN = `import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";
export const descriptor: ToolDescriptor = {
  name: "bad", description: "x",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@local", costTier: "free",
};
export async function run(_ctx: CommandContext): Promise<Envelope> {
  throw new Error("boom");
}
`;

// A distinct self-contained command used to prove discover scans the dir.
const TINY_CMD = `import type { ToolDescriptor, CommandContext, Envelope } from "../contracts.ts";
export const descriptor: ToolDescriptor = {
  name: "tiny-demo",
  description: "tiny",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  plugin: "@local",
  costTier: "free",
};
export async function run(_ctx: CommandContext): Promise<Envelope> {
  return {
    ok: true,
    command: "tiny-demo",
    summary: "tiny",
    result: null,
    needs_human: null,
    meta: { version: "0.0.1", duration_ms: 0, change_id: null, tokens_used: 0 },
  };
}
`;

// --- pure helpers ---

test("AUTHORING_CONTRACT names the self-contained + strip-only rules", () => {
  assert.match(AUTHORING_CONTRACT, /SELF-CONTAINED/);
  assert.match(AUTHORING_CONTRACT, /Strip-only TypeScript/);
  assert.match(AUTHORING_CONTRACT, /INLINE object literal/i);
});

test("extractCodeBlock: pulls the fenced block; falls back to whole text", () => {
  assert.equal(
    extractCodeBlock("here:\n```ts\nexport const x = 1;\n```\ndone"),
    "export const x = 1;",
  );
  assert.equal(extractCodeBlock("export const y = 2;"), "export const y = 2;");
});

test("validateStructure: requires descriptor + run", () => {
  assert.equal(validateStructure(VALID_CMD), null);
  assert.ok(validateStructure(MISSING_RUN), "missing run is rejected");
});

test("deriveName: kebab from description; falls back to 'command'", () => {
  assert.equal(deriveName("Say hello to the world"), "say-hello-to");
  assert.equal(deriveName("123 !!!"), "command");
});

test("smokeTest: self-contained command passes; a throwing run fails", async () => {
  assert.equal((await smokeTest(VALID_CMD)).ok, true);
  const bad = await smokeTest(THROWS_RUN);
  assert.equal(bad.ok, false);
  assert.match(bad.error!, /threw: boom/);
});

// --- the pipeline (buildCommand, injectable complete, no network) ---

test("(a) buildCommand valid + --yes: installs, journals, and is discoverable", async () => {
  const env = await buildCommand({
    description: "a hello command",
    scope: "project",
    name: "hello-built",
    yes: true,
    dryRun: false,
    config: cfg(),
    complete: canned(VALID_CMD),
  });
  assert.equal(env.ok, true);
  assert.match(env.meta.change_id ?? "", /^chg_/, "install is journaled with a change_id");
  assert.equal(env.meta.tokens_used, 12, "meta.tokens_used carries LLM cost");
  assert.equal(env.result.smoke, "passed");
  assert.ok(
    (env.result as { path: string }).path.endsWith(join("commands", "hello-built.ts")),
  );

  const fp = footprintFor("project");
  const file = join(fp.root, "commands", "hello-built.ts");
  assert.equal(existsSync(file), true, "command file installed to the footprint");

  const changes = await listChanges("project");
  assert.ok(
    changes.some((c) => c.change_id === env.meta.change_id),
    "the install is recorded in the journal (rollback-able)",
  );

  // discover.ts now scans footprint command dirs → the new command is listed.
  resetDiscovery();
  const table = await discoverCore();
  assert.ok(table.has("hello-built"), "footprint command is auto-discovered");
  assert.equal(typeof table.get("hello-built")!.run, "function");
});

test("(b) buildCommand missing run: validation fail, nothing written", async () => {
  const env = await buildCommand({
    description: "bad",
    scope: "project",
    name: "bad-missing",
    yes: true,
    dryRun: false,
    config: cfg(),
    complete: canned(MISSING_RUN),
  });
  assert.equal(env.ok, false);
  assert.match(env.summary, /validation failed/i);
  assert.equal(
    existsSync(join(footprintFor("project").root, "commands", "bad-missing.ts")),
    false,
    "nothing written on validation failure",
  );
});

test("(b2) buildCommand run that throws: smoke fail, nothing written", async () => {
  const env = await buildCommand({
    description: "bad",
    scope: "project",
    name: "bad-throws",
    yes: true,
    dryRun: false,
    config: cfg(),
    complete: canned(THROWS_RUN),
  });
  assert.equal(env.ok, false);
  assert.match(env.summary, /smoke test failed/i);
  assert.equal(
    existsSync(join(footprintFor("project").root, "commands", "bad-throws.ts")),
    false,
    "nothing written on smoke failure",
  );
});

test("(c) buildCommand --dry-run: returns the code, writes nothing", async () => {
  const env = await buildCommand({
    description: "a hello command",
    scope: "project",
    name: "dry-built",
    yes: true,
    dryRun: true,
    config: cfg(),
    complete: canned(VALID_CMD),
  });
  assert.equal(env.ok, true);
  assert.equal((env.result as { dry_run: boolean }).dry_run, true);
  assert.ok(
    (env.result as { code: string }).code.includes("export const descriptor"),
    "dry-run returns the generated code",
  );
  assert.equal(
    existsSync(join(footprintFor("project").root, "commands", "dry-built.ts")),
    false,
    "dry-run writes nothing",
  );
});

test("(d1) buildCommand without --yes (valid code): needs_human + shows the code", async () => {
  const env = await buildCommand({
    description: "a hello command",
    scope: "project",
    name: "confirm-built",
    yes: false,
    dryRun: false,
    config: cfg(),
    complete: canned(VALID_CMD),
  });
  assert.equal(env.ok, false);
  assert.ok(env.needs_human, "escalates for confirmation");
  assert.ok(
    (env.result as { code: string }).code.includes("export const descriptor"),
    "generated code is shown for review",
  );
  assert.equal(
    existsSync(join(footprintFor("project").root, "commands", "confirm-built.ts")),
    false,
    "nothing written without --yes",
  );
});

// --- dispatch layer ---

test("(d2) dispatch build without --yes: needs_human exit 3 (expensive approval gate)", async () => {
  const ctx: CommandContext = {
    args: { description: "say hi" },
    flags: {},
    config: cfg(["fs:write", "net:llm"]),
    isTTY: false,
  };
  const { env, exitCode } = await dispatch("build", ctx);
  assert.equal(exitCode, EXIT.NEEDS_HUMAN);
  assert.ok(env.needs_human, "expensive gate escalates before run()");
});

test("(e) discover scans the footprint commands dir (project)", async () => {
  const fp = footprintFor("project");
  mkdirSync(join(fp.root, "commands"), { recursive: true });
  writeFileSync(join(fp.root, "commands", "tiny-demo.ts"), TINY_CMD, "utf8");
  resetDiscovery();
  const table = await discoverCore();
  assert.ok(table.has("tiny-demo"), "the dropped tiny-demo command is auto-discovered");
  assert.equal(typeof table.get("tiny-demo")!.run, "function");
  // And it is dispatchable (capability enforcement still applies at dispatch).
  const { exitCode } = await dispatch(
    "tiny-demo",
    { args: {}, flags: {}, config: cfg(), isTTY: false },
  );
  assert.equal(exitCode, EXIT.OK, "footprint command runs end-to-end via dispatch");
});
