import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor, type Check, type CheckStatus } from "../src/doctor.ts";
import { run as doctorRun } from "../src/commands/doctor.ts";
import { EXIT, type Config, type CommandContext, type Provider } from "../src/contracts.ts";

// Isolated footprint — never touch the real ~/.righthand or repo ./.righthand.
const PROJ = mkdtempSync(join(tmpdir(), "rh-doc-proj-"));

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
});
after(() => {
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
});
// Each test starts with a clean footprint.
afterEach(() => {
  rmSync(join(PROJ, ".righthand"), { recursive: true, force: true });
});

// Minimal config builder (mirrors test/llm.test.ts — no disk, no loadConfig).
function cfg(
  providers: Record<string, Provider>,
  extra: Partial<Config> = {},
): Config {
  return {
    providers,
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10000 },
    ...extra,
  };
}

const OAI: Provider = { type: "openai-compatible", apiKey: "sk-test", model: "gpt-4o" };

// Materialize (or wipe) the project footprint + optional rollback store.
function makeFootprint(opts: { footprint?: boolean; store?: boolean } = {}): void {
  const root = join(PROJ, ".righthand");
  if (opts.footprint) mkdirSync(root, { recursive: true });
  if (opts.store) mkdirSync(join(root, ".git"), { recursive: true });
}

function byName(checks: Check[], name: string): Check | undefined {
  return checks.find((c) => c.name === name);
}

// --- providers: zero configured -> red on providers, overall red ---

test("doctor: no providers -> providers check is red, overall red", async () => {
  makeFootprint({ footprint: true, store: true });
  const { overall, checks } = await runDoctor({
    config: cfg({}, { permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  const providers = byName(checks, "providers");
  assert.equal(providers?.status, "red");
  assert.match(providers?.detail ?? "", /no LLM provider/);
  // No other check is red -> providers is the sole red driver.
  assert.equal(checks.filter((c) => c.status === "red").length, 1);
  assert.equal(overall, "red");
});

// --- providers: configured + resolvable key -> green ---

test("doctor: provider + resolvable key -> provider check green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "provider:openai")?.status, "green");
});

test("doctor: provider configured but no key (env: unset) -> yellow", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg(
      { openai: { type: "openai-compatible", apiKey: "env:RH_DOCTOR_UNSET_KEY", model: "gpt-4o" } },
      { defaults: { output: "summary", history_max: 10000, provider: "openai" } },
    ),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "provider:openai")?.status, "yellow");
});

// --- default provider ---

test("doctor: providers exist but no default set -> default-provider yellow", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "default-provider")?.status, "yellow");
});

test("doctor: default set and resolvable -> default-provider green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "default-provider")?.status, "green");
});

// --- footprint absent -> footprint + version-store yellow ---

test("doctor: footprint absent -> footprint + version-store yellow", async () => {
  // No makeFootprint call -> ./.righthand absent.
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  const fp = byName(checks, "footprint");
  const store = byName(checks, "version-store");
  assert.equal(fp?.status, "yellow");
  assert.match(fp?.detail ?? "", /righthand init/);
  assert.equal(store?.status, "yellow");
});

test("doctor: footprint + store present -> both green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "footprint")?.status, "green");
  assert.equal(byName(checks, "version-store")?.status, "green");
});

// --- runtime check (always green) ---

test("doctor: runtime check is green and names the runtime", async () => {
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  const rt = byName(checks, "runtime");
  assert.equal(rt?.status, "green");
  assert.match(rt?.detail ?? "", /righthand 0\.0\.1 on (node|bun)/);
});

// --- plugins: missing manifest -> yellow ---

test("doctor: all plugins have manifests -> green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [{ name: "good", hasManifest: true }],
  });
  assert.equal(byName(checks, "plugins")?.status, "green");
});

test("doctor: a plugin missing manifest -> yellow + names it", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [
      { name: "good", hasManifest: true },
      { name: "bad", hasManifest: false },
    ],
  });
  const plugins = byName(checks, "plugins");
  assert.equal(plugins?.status, "yellow");
  assert.match(plugins?.detail ?? "", /bad/);
});

// --- wrapped CLIs: fake hasBinary returning presence -> green ---

test("doctor: fake hasBinary all-present -> every cli:* green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  const clis = checks.filter((c) => c.name.startsWith("cli:"));
  assert.equal(clis.length, 4);
  for (const c of clis) assert.equal(c.status, "green");
});

test("doctor: fake hasBinary all-absent -> every cli:* yellow (never red)", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => false,
    listPlugins: () => [],
  });
  const clis = checks.filter((c) => c.name.startsWith("cli:"));
  for (const c of clis) assert.equal(c.status, "yellow");
});

// --- capabilities hint ---

test("doctor: capability commands exist + empty allow -> capabilities yellow", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg({ openai: OAI }, { defaults: { output: "summary", history_max: 10000, provider: "openai" } }),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  // allow=[] and core commands declare capabilities -> yellow.
  const cap = byName(checks, "capabilities");
  assert.equal(cap?.status, "yellow");
  assert.match(cap?.detail ?? "", /declare capabilities/);
});

test("doctor: capability commands exist + non-empty allow -> capabilities green", async () => {
  makeFootprint({ footprint: true, store: true });
  const { checks } = await runDoctor({
    config: cfg(
      { openai: OAI },
      {
        defaults: { output: "summary", history_max: 10000, provider: "openai" },
        permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false },
      },
    ),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(byName(checks, "capabilities")?.status, "green");
});

// --- overall status logic: red > yellow > green ---

test("doctor overall: all green when everything healthy", async () => {
  makeFootprint({ footprint: true, store: true });
  const { overall, checks } = await runDoctor({
    config: cfg(
      { openai: OAI },
      {
        defaults: { output: "summary", history_max: 10000, provider: "openai" },
        permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false },
      },
    ),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(checks.filter((c) => c.status !== "green").length, 0);
  assert.equal(overall, "green");
});

test("doctor overall: yellow when a warning exists but no red", async () => {
  // Footprint absent -> footprint + version-store yellow; everything else green.
  const { overall, checks } = await runDoctor({
    config: cfg(
      { openai: OAI },
      {
        defaults: { output: "summary", history_max: 10000, provider: "openai" },
        permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false },
      },
    ),
    hasBinary: () => true,
    listPlugins: () => [],
  });
  assert.equal(checks.some((c) => c.status === "red"), false);
  assert.equal(checks.some((c) => c.status === "yellow"), true);
  assert.equal(overall, "yellow");
});

test("doctor overall: red wins over yellow", async () => {
  makeFootprint({ footprint: true, store: true });
  // No providers -> red; allow empty -> capabilities yellow too.
  const { overall, checks } = await runDoctor({
    config: cfg({}),
    hasBinary: () => false, // all cli:* yellow as well
    listPlugins: () => [],
  });
  assert.equal(checks.some((c) => c.status === "red"), true);
  assert.equal(checks.some((c) => c.status === "yellow"), true);
  assert.equal(overall, "red");
});

// --- command envelope: run() returns {overall, checks} in result ---

test("doctor command: run() wraps {overall, checks} in an envelope", async () => {
  makeFootprint({ footprint: true, store: true });
  const ctx: CommandContext = {
    args: {},
    flags: {},
    config: cfg(
      { openai: OAI },
      {
        defaults: { output: "summary", history_max: 10000, provider: "openai" },
        permissions: { allow: ["*"], deny: [], auto_confirm_destructive: false },
      },
    ),
    isTTY: false,
  };
  // NOTE: run() here exercises the REAL hasBinary/listPlugins (no seam at the
  // command layer), so we only assert envelope shape + overall, not exact checks.
  const env = await doctorRun(ctx);
  assert.equal(env.command, "doctor");
  assert.equal(env.ok, true);
  assert.ok(typeof env.summary === "string" && env.summary.length > 0);
  const result = env.result as { overall: CheckStatus; checks: Check[] };
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.length > 0);
  assert.ok(["green", "yellow", "red"].includes(result.overall));
});

// --- sanity: EXIT constants unaffected (we depend on contracts read-only) ---

test("doctor: EXIT.OK still 0 (contracts untouched)", () => {
  assert.equal(EXIT.OK, 0);
});
