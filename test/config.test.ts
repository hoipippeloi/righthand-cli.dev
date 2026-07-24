import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  redactConfig,
  redactProvider,
  setConfigKey,
  readScopedConfig,
} from "../src/config.ts";

const USER = mkdtempSync(join(tmpdir(), "rh-cfg-user-"));
const PROJ = mkdtempSync(join(tmpdir(), "rh-cfg-proj-"));

before(() => {
  process.env.RIGHTHAND_USER_ROOT = USER;
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
});

after(() => {
  delete process.env.RIGHTHAND_USER_ROOT;
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  rmSync(USER, { recursive: true, force: true });
  rmSync(PROJ, { recursive: true, force: true });
});

test("layering: project provider overrides user, user provider is preserved", () => {
  writeFileSync(
    join(USER, "config.json"),
    JSON.stringify({ providers: { a: { type: "anthropic", model: "claude" } } }),
  );
  mkdirSync(join(PROJ, ".righthand"), { recursive: true });
  writeFileSync(
    join(PROJ, ".righthand", "config.json"),
    JSON.stringify({ providers: { a: { type: "anthropic", model: "opus" } }, plugins: [{ name: "@x/y" }] }),
  );
  const cfg = loadConfig();
  assert.equal(cfg.providers.a.model, "opus", "project wins");
  assert.equal(cfg.providers.a.type, "anthropic");
  assert.deepEqual(cfg.plugins, [{ name: "@x/y" }]);
});

test("layering: missing scope file is treated as empty, not an error", () => {
  rmSync(join(USER, "config.json"), { force: true });
  rmSync(join(PROJ, ".righthand"), { recursive: true, force: true });
  const cfg = loadConfig();
  assert.deepEqual(cfg.providers, {});
});

test("env override wins over both files", () => {
  mkdirSync(join(PROJ, ".righthand"), { recursive: true });
  writeFileSync(
    join(PROJ, ".righthand", "config.json"),
    JSON.stringify({ defaults: { output: "summary" }, providers: { default: { type: "openai-compatible", model: "from-file" } } }),
  );
  const prevOut = process.env.RIGHTHAND_DEFAULTS__OUTPUT;
  const prevModel = process.env.RIGHTHAND_PROVIDERS__DEFAULT__MODEL;
  process.env.RIGHTHAND_DEFAULTS__OUTPUT = "full";
  process.env.RIGHTHAND_PROVIDERS__DEFAULT__MODEL = "from-env";
  try {
    const cfg = loadConfig();
    assert.equal(cfg.defaults.output, "full");
    assert.equal(cfg.providers.default.model, "from-env");
  } finally {
    process.env.RIGHTHAND_DEFAULTS__OUTPUT = prevOut;
    delete process.env.RIGHTHAND_PROVIDERS__DEFAULT__MODEL;
    void prevModel;
  }
});

test("redaction: env:/keychain: refs are kept; plaintext apiKey is redacted", () => {
  assert.equal(redactProvider({ type: "openai-compatible", apiKey: "env:OPENAI_API_KEY" }).apiKey, "env:OPENAI_API_KEY");
  assert.equal(redactProvider({ type: "openai-compatible", apiKey: "keychain:ref" }).apiKey, "keychain:ref");
  assert.equal(redactProvider({ type: "openai-compatible", apiKey: "sk-supersecret" }).apiKey, "<redacted>");
});

test("redactConfig redacts plaintext keys across providers", () => {
  const cfg = loadConfig(); // reuses files above if present; safe if empty
  void redactConfig(cfg);
  // Build a known case explicitly.
  const r = redactConfig({
    providers: {
      good: { type: "openai-compatible", apiKey: "env:X" },
      bad: { type: "openai-compatible", apiKey: "sk-leak" },
    },
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10 },
  });
  assert.equal(r.providers.good.apiKey, "env:X");
  assert.equal(r.providers.bad.apiKey, "<redacted>");
});

test("setConfigKey writes dotted path into the scope file", () => {
  const updated = setConfigKey("user", "providers.default.model", "gpt-4o-mini");
  writeFileSync(join(USER, "config.json"), JSON.stringify(updated));
  const reread = readScopedConfig("user");
  assert.equal(
    (reread.providers as Record<string, { model: string }>).default.model,
    "gpt-4o-mini",
  );
});

test("setConfigKey rejects an empty path segment", () => {
  assert.throws(() => setConfigKey("user", "a..b", "x"), /invalid config key/);
});

test("setConfigKey parses JSON array/object values (permissions.allow, params)", () => {
  const updated = setConfigKey("user", "permissions.allow", '["net:llm","fs:write"]');
  writeFileSync(join(USER, "config.json"), JSON.stringify(updated));
  const reread = readScopedConfig("user");
  assert.deepEqual(
    (reread.permissions as { allow: string[] }).allow,
    ["net:llm", "fs:write"],
  );
  const obj = setConfigKey("user", "providers.default.params", '{"temperature":0.2}');
  writeFileSync(join(USER, "config.json"), JSON.stringify(obj));
  assert.deepEqual(
    (readScopedConfig("user").providers as Record<string, { params: unknown }>).default.params,
    { temperature: 0.2 },
  );
});
