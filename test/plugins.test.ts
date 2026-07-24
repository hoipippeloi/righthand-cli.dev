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
import { run as pluginsRun } from "../src/commands/plugins.ts";
import {
  setNpmRunnerForTest,
  resetNpmRunnerForTest,
  packageNameFromSpec,
  type NpmRunner,
} from "../src/plugininstall.ts";
import { footprintFor } from "../src/footprint.ts";
import { listChanges } from "../src/journal.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { CommandContext } from "../src/contracts.ts";

// Isolated footprints — NEVER touch the real ~/.righthand or the repo's
// ./.righthand. RIGHTHAND_*_ROOT overrides are the project's own test seam.
const PROJ = mkdtempSync(join(tmpdir(), "rh-pl-proj-"));
const USER = mkdtempSync(join(tmpdir(), "rh-pl-user-"));

// Default scope:project so resolveActiveScope() (which falls back to "user"
// until a project footprint exists) isn't exercised implicitly here. The
// command's real scope resolution is unit-worthy separately.
const ctx = (
  args: Record<string, unknown> = {},
  flags: Record<string, unknown> = {},
): CommandContext => ({ args, flags: { scope: "project", ...flags }, config: DEFAULT_CONFIG, isTTY: false });

before(() => {
  process.env.RIGHTHAND_PROJECT_ROOT = PROJ;
  process.env.RIGHTHAND_USER_ROOT = USER;
});
after(() => {
  resetNpmRunnerForTest();
  delete process.env.RIGHTHAND_PROJECT_ROOT;
  delete process.env.RIGHTHAND_USER_ROOT;
  rmSync(PROJ, { recursive: true, force: true });
  rmSync(USER, { recursive: true, force: true });
});

// Fake npm: materializes a package under node_modules/<name>/ with a
// package.json (+ optional manifest.json) on "install"; rmSync's it on
// "uninstall". Lets tests exercise install/list/remove with no network.
function fakeNpm(opts: { manifest?: boolean } = {}): NpmRunner {
  return (_bin, args, runOpts) => {
    const sub = args[0]; // "install" | "uninstall"
    const prefIdx = args.indexOf("--prefix");
    const pluginsDir = prefIdx >= 0 ? args[prefIdx + 1] : runOpts?.cwd ?? process.cwd();
    const nm = join(pluginsDir, "node_modules");
    mkdirSync(nm, { recursive: true });
    const pkgSpec = args[args.length - 1];
    const name = packageNameFromSpec(pkgSpec);
    const dir = join(nm, name);
    if (sub === "uninstall") {
      rmSync(dir, { recursive: true, force: true });
      return { ok: true, stdout: `removed ${name}`, stderr: "" };
    }
    mkdirSync(dir, { recursive: true });
    let version = "1.0.0";
    if (pkgSpec.length > name.length && pkgSpec[name.length] === "@") {
      version = pkgSpec.slice(name.length + 1);
    }
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }), "utf8");
    if (opts.manifest !== false) {
      writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify({ plugin: name, handler: "./handler.js", tools: [] }),
        "utf8",
      );
    }
    return { ok: true, stdout: `installed ${name}`, stderr: "" };
  };
}

function readConfigPlugins(): Array<{ name: string; version?: string }> {
  const fp = footprintFor("project");
  const cfg = JSON.parse(readFileSync(fp.configPath, "utf8")) as {
    plugins: Array<{ name: string; version?: string }>;
  };
  return cfg.plugins ?? [];
}

// ---------- list (read-only) ----------

test("list on an empty footprint returns no installed plugins", async () => {
  // Use a fresh, guaranteed-empty project root so other tests' installs
  // can't leak in (node:test runs sequentially, but this stays robust).
  const empty = mkdtempSync(join(tmpdir(), "rh-pl-empty-"));
  const prev = process.env.RIGHTHAND_PROJECT_ROOT;
  process.env.RIGHTHAND_PROJECT_ROOT = empty;
  try {
    const env = await pluginsRun(ctx({ action: "list" }, {}));
    assert.equal(env.ok, true);
    assert.deepEqual((env.result as { installed: unknown[] }).installed, []);
  } finally {
    process.env.RIGHTHAND_PROJECT_ROOT = prev;
    rmSync(empty, { recursive: true, force: true });
  }
});

test("unknown action -> usage envelope", async () => {
  const env = await pluginsRun(ctx({ action: "bogus" }, {}));
  assert.equal(env.ok, false);
  assert.match(env.summary, /unknown action/);
});

test("install/remove without a pkg -> usage envelope", async () => {
  const a = await pluginsRun(ctx({ action: "install" }, { yes: true }));
  assert.equal(a.ok, false);
  assert.match(a.summary, /requires a package spec/);
  const b = await pluginsRun(ctx({ action: "remove" }, { yes: true }));
  assert.equal(b.ok, false);
  assert.match(b.summary, /requires a package name/);
});

// ---------- install ----------

test("install with manifest: config.plugins updated + journaled + list shows hasManifest:true", async () => {
  setNpmRunnerForTest(fakeNpm({ manifest: true }));
  const env = await pluginsRun(
    ctx({ action: "install", pkg: "demo-plugin@1.2.3" }, { yes: true }),
  );
  assert.equal(env.ok, true);
  const result = env.result as { name: string; version?: string; hasManifest: boolean; warning: string | null };
  assert.equal(result.name, "demo-plugin");
  assert.equal(result.version, "1.2.3");
  assert.equal(result.hasManifest, true);
  assert.equal(result.warning, null);
  assert.match(env.meta.change_id ?? "", /^chg_/, "install is journaled with a change_id");

  // config.plugins carries the recorded entry
  const entry = readConfigPlugins().find((p) => p.name === "demo-plugin");
  assert.ok(entry, "plugin recorded in config.plugins");
  assert.equal(entry!.version, "1.2.3");

  // journal recorded the change
  const changes = await listChanges("project");
  assert.ok(
    changes.some((c) => c.change_id === env.meta.change_id && /install/.test(c.summary)),
    "install recorded in the change journal",
  );

  // list reflects it with hasManifest true
  const listEnv = await pluginsRun(ctx({ action: "list" }, {}));
  const installed = (listEnv.result as { installed: Array<{ name: string; hasManifest: boolean }> }).installed;
  const found = installed.find((p) => p.name === "demo-plugin");
  assert.ok(found, "list shows the installed plugin");
  assert.equal(found!.hasManifest, true);
});

test("install without manifest: hasManifest false + warning, still registered by name", async () => {
  setNpmRunnerForTest(fakeNpm({ manifest: false }));
  const env = await pluginsRun(
    ctx({ action: "install", pkg: "bare-plugin" }, { yes: true }),
  );
  assert.equal(env.ok, true);
  const result = env.result as { name: string; hasManifest: boolean; warning: string | null };
  assert.equal(result.name, "bare-plugin");
  assert.equal(result.hasManifest, false);
  assert.ok(result.warning, "missing manifest surfaces a warning");
  assert.match(result.warning!, /manifest\.json/);

  assert.ok(
    readConfigPlugins().some((p) => p.name === "bare-plugin"),
    "registered by name despite the missing manifest",
  );
});

test("install --dry-run mutates nothing and shows the plan", async () => {
  setNpmRunnerForTest(fakeNpm({ manifest: true }));
  const env = await pluginsRun(ctx({ action: "install", pkg: "nope" }, { "dry-run": true }));
  assert.equal(env.ok, true);
  assert.equal((env.result as { dry_run: boolean }).dry_run, true);
  const fp = footprintFor("project");
  assert.equal(
    existsSync(join(fp.pluginsDir, "node_modules", "nope")),
    false,
    "dry-run installs nothing",
  );
});

test("install without --yes in non-TTY refuses with needs_human", async () => {
  setNpmRunnerForTest(fakeNpm({ manifest: true }));
  const env = await pluginsRun(ctx({ action: "install", pkg: "guarded" }, {})); // no --yes, isTTY false
  assert.equal(env.ok, false);
  assert.ok(env.needs_human);
  assert.match(env.needs_human!, /--yes/);
  assert.equal(
    readConfigPlugins().some((p) => p.name === "guarded"),
    false,
    "refused install recorded nothing in config",
  );
});

test("npm install failure -> fail envelope, nothing recorded", async () => {
  const failing: NpmRunner = () => ({ ok: false, stdout: "", stderr: "ENOTFOUND registry" });
  setNpmRunnerForTest(failing);
  const env = await pluginsRun(ctx({ action: "install", pkg: "dead" }, { yes: true }));
  assert.equal(env.ok, false);
  assert.match(env.summary, /npm install failed/);
  assert.match(env.summary, /ENOTFOUND registry/);
  assert.equal(env.meta.change_id, null, "no change_id on failure");
  assert.equal(
    readConfigPlugins().some((p) => p.name === "dead"),
    false,
    "failed install recorded nothing in config",
  );
});

// ---------- remove ----------

test("remove: drops from config + removes package dir + journals", async () => {
  // install first
  setNpmRunnerForTest(fakeNpm({ manifest: true }));
  await pluginsRun(ctx({ action: "install", pkg: "gone-plugin" }, { yes: true }));
  const fp = footprintFor("project");
  assert.equal(
    existsSync(join(fp.pluginsDir, "node_modules", "gone-plugin")),
    true,
    "precondition: package dir exists",
  );

  const env = await pluginsRun(ctx({ action: "remove", pkg: "gone-plugin" }, { yes: true }));
  assert.equal(env.ok, true);
  assert.match(env.meta.change_id ?? "", /^chg_/, "remove is journaled");

  assert.equal(
    readConfigPlugins().some((p) => p.name === "gone-plugin"),
    false,
    "removed from config.plugins",
  );
  assert.equal(
    existsSync(join(fp.pluginsDir, "node_modules", "gone-plugin")),
    false,
    "package dir removed",
  );

  const listEnv = await pluginsRun(ctx({ action: "list" }, {}));
  const installed = (listEnv.result as { installed: Array<{ name: string }> }).installed;
  assert.ok(!installed.some((p) => p.name === "gone-plugin"), "list no longer shows it");
});

test("remove --dry-run mutates nothing", async () => {
  setNpmRunnerForTest(fakeNpm({ manifest: true }));
  await pluginsRun(ctx({ action: "install", pkg: "keep-me" }, { yes: true }));
  const env = await pluginsRun(ctx({ action: "remove", pkg: "keep-me" }, { "dry-run": true }));
  assert.equal(env.ok, true);
  assert.equal((env.result as { dry_run: boolean }).dry_run, true);
  const fp = footprintFor("project");
  assert.equal(existsSync(join(fp.pluginsDir, "node_modules", "keep-me")), true, "still installed");
  assert.ok(readConfigPlugins().some((p) => p.name === "keep-me"), "still in config");
});

// ---------- unit ----------

test("packageNameFromSpec strips @version, preserves @scope", () => {
  assert.equal(packageNameFromSpec("pkg"), "pkg");
  assert.equal(packageNameFromSpec("pkg@1.2.3"), "pkg");
  assert.equal(packageNameFromSpec("@scope/pkg"), "@scope/pkg");
  assert.equal(packageNameFromSpec("@scope/pkg@2.0.0"), "@scope/pkg");
});
