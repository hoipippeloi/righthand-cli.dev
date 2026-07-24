import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderCommand, validateName } from "../src/scaffold.ts";
import { run as newRun } from "../src/commands/new.ts";
import { footprintFor } from "../src/footprint.ts";
import { listChanges } from "../src/journal.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { CommandContext } from "../src/contracts.ts";

// Isolated footprints — NEVER touch the real ~/.righthand or the repo's
// ./.righthand. RIGHTHAND_*_ROOT overrides are the project's own test seam.
const PROJ = mkdtempSync(join(tmpdir(), "rh-sc-proj-"));
const USER = mkdtempSync(join(tmpdir(), "rh-sc-user-"));

const ctx = (
  args: Record<string, unknown> = {},
  flags: Record<string, unknown> = {},
): CommandContext => ({ args, flags, config: DEFAULT_CONFIG, isTTY: false });

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

test("validateName: kebab-case accepted; traversal/upper/empty rejected", () => {
  assert.equal(validateName("ci-status"), null);
  assert.equal(validateName("deploy"), null);
  assert.ok(validateName(""), "empty rejected");
  assert.ok(validateName("CI_Status"), "uppercase/underscore rejected");
  assert.ok(validateName("../evil"), "path traversal rejected");
  assert.ok(validateName("foo/bar"), "slash rejected");
  assert.ok(validateName("1bad"), "leading digit rejected");
});

test("renderCommand yields strip-only TS that imports + exports descriptor + run", async () => {
  const src = renderCommand({ name: "demo-thing", description: "a demo" });
  const dir = mkdtempSync(join(tmpdir(), "rh-sc-smoke-"));
  const file = join(dir, "demo-thing.ts");
  writeFileSync(file, src, "utf8");
  try {
    const mod = (await import(pathToFileURL(file))) as {
      descriptor?: { name: string; plugin: string; costTier: string; inputSchema: unknown };
      run?: (c: unknown) => Promise<unknown>;
    };
    assert.equal(mod.descriptor?.name, "demo-thing");
    assert.equal(mod.descriptor?.plugin, "@local");
    assert.equal(mod.descriptor?.costTier, "free");
    assert.equal(typeof mod.run, "function");
    const env = (await mod.run!({})) as { ok: boolean; command: string; summary: string };
    assert.equal(env.ok, true);
    assert.equal(env.command, "demo-thing");
    assert.match(env.summary, /demo-thing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new --dry-run returns full content and writes nothing", async () => {
  const env = await newRun(ctx({ name: "dryone", desc: "dry run test" }, { "dry-run": true }));
  assert.equal(env.ok, true);
  assert.equal(env.result.dry_run, true);
  assert.ok(
    (env.result.content as string).includes("export const descriptor"),
    "dry-run result carries the full file content",
  );
  const fp = footprintFor("project");
  assert.equal(
    existsSync(join(fp.root, "commands", "dryone.ts")),
    false,
    "dry-run must not write the file",
  );
});

test("new writes the file under the project footprint and journals a change", async () => {
  const env = await newRun(ctx({ name: "ci-status", desc: "CI status" }, {}));
  assert.equal(env.ok, true);
  assert.match(env.meta.change_id ?? "", /^chg_/, "new is journaled with a change_id");
  const fp = footprintFor("project");
  const file = join(fp.root, "commands", "ci-status.ts");
  assert.equal(existsSync(file), true, "command file was written");
  assert.ok(readFileSync(file, "utf8").includes("ci-status"));
  const changes = await listChanges("project");
  assert.ok(
    changes.some((c) => c.change_id === env.meta.change_id),
    "the change is recorded in the journal",
  );
});

test("new writes to the USER scope footprint when --scope user", async () => {
  const env = await newRun(ctx({ name: "global-helper" }, { scope: "user" }));
  assert.equal(env.ok, true);
  assert.equal(
    existsSync(join(USER, "commands", "global-helper.ts")),
    true,
    "user-scoped file written under the isolated USER root, not real ~/.righthand",
  );
});

test("new refuses to overwrite an existing file without --force", async () => {
  const fp = footprintFor("project");
  mkdirSync(join(fp.root, "commands"), { recursive: true });
  const file = join(fp.root, "commands", "exists.ts");
  writeFileSync(file, "ORIGINAL\n");
  const env = await newRun(ctx({ name: "exists" }, {}));
  assert.equal(env.ok, false);
  assert.ok(env.needs_human, "overwrite refusal escalates as needs_human");
  assert.equal(readFileSync(file, "utf8"), "ORIGINAL\n", "file untouched without --force");
});

test("new overwrites when --force is set and journals it", async () => {
  const env = await newRun(ctx({ name: "exists" }, { force: true }));
  assert.equal(env.ok, true);
  assert.match(env.meta.change_id ?? "", /^chg_/);
  const fp = footprintFor("project");
  assert.ok(
    readFileSync(join(fp.root, "commands", "exists.ts"), "utf8").includes("export const descriptor"),
    "file overwritten with the scaffolded content",
  );
});

test("new rejects an invalid name with a usage envelope", async () => {
  const env = await newRun(ctx({ name: "Bad Name!" }, {}));
  assert.equal(env.ok, false);
  assert.match(env.summary, /invalid name/i);
});
