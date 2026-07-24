import {
  EXIT
} from "./contracts.js";
import { discoverPluginFragments, loadPluginHandler, discoverCore } from "./discover.js";
import { CommandError } from "./errors.js";
import { makeEnvelope } from "./envelope.js";
import {
  activeFootprint,
  appendHistoryRow
} from "./footprint.js";
import { actionId } from "./ulid.js";
import { checkCapabilities, requiresApproval } from "./capabilities.js";
async function resolve(name, ctx) {
  const core = (await discoverCore()).get(name);
  if (core) return { descriptor: core.descriptor, run: core.run };
  const pluginDirs = ctx.pluginDirs ?? [];
  for (const frag of discoverPluginFragments(pluginDirs)) {
    const descriptor = frag.descriptors.find((d) => d.name === name);
    if (!descriptor) continue;
    const mod = await loadPluginHandler(frag.handlerModule);
    return { descriptor, run: mod?.run };
  }
  return {};
}
const SECRET_KEY = /key|token|secret|password|apikey/i;
function sanitizeArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SECRET_KEY.test(k) ? "<redacted>" : v;
  }
  return out;
}
async function dispatch(name, ctx) {
  const { descriptor, run: runFn } = await resolve(name, ctx);
  const started = performance.now();
  if (!descriptor || !runFn) {
    return {
      env: makeEnvelope({ command: name, ok: false, summary: `unknown command: ${name}` }),
      exitCode: EXIT.USAGE
    };
  }
  const { ok: capsOk, denied } = checkCapabilities(
    descriptor.capabilities,
    ctx.config.permissions
  );
  if (!capsOk) {
    return {
      env: makeEnvelope({
        command: name,
        ok: false,
        summary: `capability denied: ${denied.join(", ")}`,
        needs_human: `command '${name}' needs capabilities not granted by config.permissions: ${denied.join(", ")}. Add them to permissions.allow (or drop from deny).`
      }),
      exitCode: EXIT.CAPABILITY_DENIED
    };
  }
  if (requiresApproval(descriptor) && !ctx.flags.yes && !ctx.config.permissions.auto_confirm_destructive) {
    return {
      env: makeEnvelope({
        command: name,
        ok: false,
        summary: `${name}: requires confirmation`,
        needs_human: `'${name}' is destructive or expensive \u2014 re-run with --yes to apply (or set permissions.auto_confirm_destructive).`
      }),
      exitCode: EXIT.NEEDS_HUMAN
    };
  }
  try {
    const result = await runFn(ctx);
    result.meta.duration_ms = Math.round(performance.now() - started);
    const exitCode = result.needs_human ? EXIT.NEEDS_HUMAN : result.ok ? EXIT.OK : EXIT.FAIL;
    if (ctx.recordHistory) {
      appendHistoryRow(activeFootprint(ctx.flags), {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        id: actionId(),
        command: name,
        args: sanitizeArgs(ctx.args),
        ok: result.ok,
        exit: exitCode,
        duration_ms: result.meta.duration_ms,
        change_id: result.meta.change_id ?? null,
        tokens_used: result.meta.tokens_used ?? 0,
        needs_human: result.needs_human
      });
    }
    return { env: result, exitCode };
  } catch (e) {
    if (e instanceof CommandError) {
      return {
        env: makeEnvelope({
          command: name,
          ok: false,
          summary: e.message,
          needs_human: e.needsHuman
        }),
        exitCode: e.exitCode
      };
    }
    throw e;
  }
}
export {
  dispatch
};
