import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { matches, checkCapabilities, requiresApproval } from "../src/capabilities.ts";
import { dispatch } from "../src/runtime.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { EXIT, type CommandContext, type Config } from "../src/contracts.ts";

// ---------- matches() ----------

test("matches: exact equality", () => {
  assert.equal(matches("exec:gh", "exec:gh"), true);
  assert.equal(matches("exec:gh", "exec:git"), false);
});

test("matches: trailing '*' wildcard", () => {
  assert.equal(matches("exec:gh", "exec:*"), true);
  assert.equal(matches("exec:git", "exec:*"), true);
  assert.equal(matches("net:api.github.com", "net:*"), true);
  assert.equal(matches("exec:gh", "net:*"), false);
  assert.equal(matches("llm:anthropic", "llm:*"), true);
});

test("matches: bare '*' matches everything", () => {
  assert.equal(matches("exec:gh", "*"), true);
  assert.equal(matches("net:anything.example", "*"), true);
  assert.equal(matches("fs:/etc/passwd", "*"), true);
});

// ---------- checkCapabilities() ----------

test("checkCapabilities: undeclared (undefined/[]) => allowed, benign by default", () => {
  assert.deepEqual(checkCapabilities(undefined, { allow: [], deny: [] }), { ok: true, denied: [] });
  assert.deepEqual(checkCapabilities([], { allow: [], deny: [] }), { ok: true, denied: [] });
  // even with a hostile-looking permission set, no declared caps => ok
  assert.deepEqual(checkCapabilities(undefined, { allow: [], deny: ["*"] }), { ok: true, denied: [] });
});

test("checkCapabilities: declared cap matched by allow => ok", () => {
  assert.deepEqual(
    checkCapabilities(["exec:gh"], { allow: ["exec:*"], deny: [] }),
    { ok: true, denied: [] },
  );
  assert.deepEqual(
    checkCapabilities(["net:api.github.com"], { allow: ["net:api.github.com"], deny: [] }),
    { ok: true, denied: [] },
  );
});

test("checkCapabilities: allow '*' grants every declared cap", () => {
  assert.deepEqual(
    checkCapabilities(["exec:gh", "net:x", "llm:y"], { allow: ["*"], deny: [] }),
    { ok: true, denied: [] },
  );
});

test("checkCapabilities: deny wins over allow", () => {
  // exact deny match beats a wildcard allow
  assert.deepEqual(
    checkCapabilities(["exec:gh"], { allow: ["exec:*"], deny: ["exec:gh"] }),
    { ok: false, denied: ["exec:gh"] },
  );
  // wildcard deny beats wildcard allow
  assert.deepEqual(
    checkCapabilities(["exec:gh"], { allow: ["*"], deny: ["exec:*"] }),
    { ok: false, denied: ["exec:gh"] },
  );
});

test("checkCapabilities: declared but not granted => denied", () => {
  assert.deepEqual(
    checkCapabilities(["exec:rm"], { allow: ["exec:gh", "net:*"], deny: [] }),
    { ok: false, denied: ["exec:rm"] },
  );
});

test("checkCapabilities: mixed — some granted, some denied (deny wins per-cap)", () => {
  assert.deepEqual(
    checkCapabilities(["exec:gh", "net:x"], { allow: ["exec:*"], deny: [] }),
    { ok: false, denied: ["net:x"] },
  );
  // one denied by deny, one allowed
  assert.deepEqual(
    checkCapabilities(["exec:gh", "net:x"], { allow: ["exec:*", "net:*"], deny: ["exec:gh"] }),
    { ok: false, denied: ["exec:gh"] },
  );
});

// ---------- requiresApproval() ----------

test("requiresApproval: destructive or expensive => true", () => {
  assert.equal(requiresApproval({ name: "x", destructive: true } as never), true);
  assert.equal(requiresApproval({ name: "x", costTier: "expensive" } as never), true);
  assert.equal(requiresApproval({ name: "x", destructive: true, costTier: "expensive" } as never), true);
});

test("requiresApproval: free/non-destructive/mutates-only => false", () => {
  assert.equal(requiresApproval({ name: "x", costTier: "free" } as never), false);
  assert.equal(requiresApproval({ name: "x", destructive: false, costTier: "free" } as never), false);
  // mutates alone does NOT trigger dispatch approval (reset/rollback self-confirm)
  assert.equal(requiresApproval({ name: "x", mutates: true, costTier: "free" } as never), false);
  assert.equal(requiresApproval({ name: "x" } as never), false);
});

// ---------- dispatch integration (fake plugin fragments) ----------

// Build a one-command plugin whose handler writes a flag file INSIDE run().
// The flag appears only when run() actually executes — so a denied/approval
// gate can be proven by the flag's absence. Handler module path is a file://
// URL so dynamic import resolves cross-platform.
function fakePlugin(opts: {
  name: string;
  capabilities?: string[];
  destructive?: boolean;
  costTier?: "free" | "cheap" | "expensive";
}): { dir: string; flag: string } {
  const dir = mkdtempSync(join(tmpdir(), "rh-cap-"));
  const flag = join(dir, "ran.flag");
  const handlerPath = join(dir, "handler.js");
  writeFileSync(
    handlerPath,
    `import { writeFileSync } from "node:fs";\n` +
      `export function run() {\n` +
      `  writeFileSync(${JSON.stringify(flag)}, "1");\n` +
      `  return { ok:true, command:${JSON.stringify(opts.name)}, summary:"ran", result:null, needs_human:null, meta:{version:"0.0.1",duration_ms:0,change_id:null,tokens_used:0} };\n` +
      `}\n`,
  );
  const tool: Record<string, unknown> = {
    name: opts.name,
    description: "fake",
    inputSchema: { type: "object" },
    plugin: "@fake/cap",
  };
  if (opts.capabilities) tool.capabilities = opts.capabilities;
  if (opts.destructive) tool.destructive = opts.destructive;
  if (opts.costTier) tool.costTier = opts.costTier;
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ plugin: "@fake/cap", handler: pathToFileURL(handlerPath).href, tools: [tool] }),
  );
  return { dir, flag };
}

function ctxWith(
  pluginDirs: string[],
  permissions: Config["permissions"],
  flags: Record<string, unknown> = {},
): CommandContext {
  return {
    args: {},
    flags,
    config: { ...DEFAULT_CONFIG, permissions },
    isTTY: false,
    pluginDirs,
  };
}

test("dispatch: declared cap denied -> exit 6, handler NOT run", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.deny", capabilities: ["exec:rm"] });
  const permissions = { allow: ["exec:*"], deny: ["exec:rm"], auto_confirm_destructive: false };
  const { env, exitCode } = await dispatch("fake.deny", ctxWith([dir], permissions));
  assert.equal(exitCode, EXIT.CAPABILITY_DENIED);
  assert.equal(env.ok, false);
  assert.match(env.summary, /capability denied/);
  assert.match(env.summary, /exec:rm/);
  assert.ok(env.needs_human);
  assert.equal(existsSync(flag), false, "handler must not run on capability denial");
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: declared cap granted -> runs (exit 0)", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.allow", capabilities: ["exec:gh"] });
  const permissions = { allow: ["exec:*"], deny: [], auto_confirm_destructive: false };
  const { exitCode } = await dispatch("fake.allow", ctxWith([dir], permissions));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(existsSync(flag), true, "handler runs when capability is granted");
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: no declared caps -> runs (existing commands unaffected)", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.benign" }); // no capabilities
  const permissions = { allow: [], deny: [], auto_confirm_destructive: false };
  const { exitCode } = await dispatch("fake.benign", ctxWith([dir], permissions));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(existsSync(flag), true);
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: destructive without --yes -> exit 3, handler NOT run", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.destruct", destructive: true, costTier: "free" });
  const permissions = { allow: ["*"], deny: [], auto_confirm_destructive: false };
  const { env, exitCode } = await dispatch("fake.destruct", ctxWith([dir], permissions, {}));
  assert.equal(exitCode, EXIT.NEEDS_HUMAN);
  assert.equal(env.ok, false);
  assert.ok(env.needs_human);
  assert.match(env.needs_human, /--yes/);
  assert.equal(existsSync(flag), false, "destructive handler must not run without --yes");
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: destructive with --yes -> runs (exit 0)", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.destruct.yes", destructive: true, costTier: "free" });
  const permissions = { allow: ["*"], deny: [], auto_confirm_destructive: false };
  const { exitCode } = await dispatch("fake.destruct.yes", ctxWith([dir], permissions, { yes: true }));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(existsSync(flag), true, "destructive handler runs with --yes");
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: destructive with auto_confirm_destructive -> runs (exit 0)", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.destruct.auto", destructive: true, costTier: "free" });
  const permissions = { allow: ["*"], deny: [], auto_confirm_destructive: true };
  const { exitCode } = await dispatch("fake.destruct.auto", ctxWith([dir], permissions, {}));
  assert.equal(exitCode, EXIT.OK);
  assert.equal(existsSync(flag), true, "destructive handler runs when auto_confirm_destructive set");
  rmSync(dir, { recursive: true, force: true });
});

test("dispatch: expensive costTier also requires approval", async () => {
  const { dir, flag } = fakePlugin({ name: "fake.pricy", costTier: "expensive" });
  const permissions = { allow: ["*"], deny: [], auto_confirm_destructive: false };
  const { exitCode } = await dispatch("fake.pricy", ctxWith([dir], permissions, {}));
  assert.equal(exitCode, EXIT.NEEDS_HUMAN);
  assert.equal(existsSync(flag), false, "expensive handler must not run without --yes");
  rmSync(dir, { recursive: true, force: true });
});
