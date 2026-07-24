import {
  EXIT,
  type CommandContext,
  type Envelope,
  type ExitCode,
  type ToolDescriptor,
} from "./contracts.ts";
import { discoverPluginFragments, loadPluginHandler, discoverCore } from "./discover.ts";
import type { Handler } from "./discover.ts";
import { CommandError } from "./errors.ts";
import { makeEnvelope } from "./envelope.ts";
import {
  activeFootprint,
  appendHistoryRow,
} from "./footprint.ts";
import { actionId } from "./ulid.ts";
import { checkCapabilities, requiresApproval } from "./capabilities.ts";

export interface DispatchResult {
  env: Envelope;
  exitCode: ExitCode;
}

// Resolve a command: core table first (bundled, already imported at discovery),
// else scan plugin fragments and lazy-import its handler.
async function resolve(
  name: string,
  ctx: CommandContext,
): Promise<{ descriptor?: ToolDescriptor; run?: Handler }> {
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

// Redact likely-sensitive arg values before they touch history.jsonl.
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SECRET_KEY.test(k) ? "<redacted>" : v;
  }
  return out;
}

// Core dispatch: resolve (core table or lazy plugin import) -> run -> map exit.
// Mutating commands own their own journaling (descriptor.mutates is a declarative
// hint) so each can honor --dry-run / confirm / scope precisely. Every recorded
// dispatch appends one history.jsonl row (C9).
// Exit code mapping: needs_human => 3, !ok => 1, else 0. CommandError => its code.
export async function dispatch(
  name: string,
  ctx: CommandContext,
): Promise<DispatchResult> {
  const { descriptor, run: runFn } = await resolve(name, ctx);
  const started = performance.now();

  if (!descriptor || !runFn) {
    return {
      env: makeEnvelope({ command: name, ok: false, summary: `unknown command: ${name}` }),
      exitCode: EXIT.USAGE,
    };
  }

  // Capability sandbox (C1 dispatch step 3): gate the command's declared
  // capabilities against config.permissions BEFORE the handler runs. Commands
  // with no declared capabilities pass straight through (benign by default) —
  // only explicitly-declared caps that are denied or ungranted short-circuit
  // to exit 6, without ever invoking the handler.
  const { ok: capsOk, denied } = checkCapabilities(
    descriptor.capabilities,
    ctx.config.permissions,
  );
  if (!capsOk) {
    return {
      env: makeEnvelope({
        command: name,
        ok: false,
        summary: `capability denied: ${denied.join(", ")}`,
        needs_human: `command '${name}' needs capabilities not granted by config.permissions: ${denied.join(", ")}. Add them to permissions.allow (or drop from deny).`,
      }),
      exitCode: EXIT.CAPABILITY_DENIED,
    };
  }

  // Dispatch-level approval gate: destructive/expensive commands need an
  // explicit --yes (or config auto_confirm_destructive) before they run.
  // Self-confirming commands (reset/rollback) set neither destructive nor an
  // expensive costTier, so this gate never fires on them — they keep their
  // own confirm.ts flow.
  if (
    requiresApproval(descriptor) &&
    !ctx.flags.yes &&
    !ctx.config.permissions.auto_confirm_destructive
  ) {
    return {
      env: makeEnvelope({
        command: name,
        ok: false,
        summary: `${name}: requires confirmation`,
        needs_human: `'${name}' is destructive or expensive — re-run with --yes to apply (or set permissions.auto_confirm_destructive).`,
      }),
      exitCode: EXIT.NEEDS_HUMAN,
    };
  }

  try {
    const result = await runFn(ctx);
    result.meta.duration_ms = Math.round(performance.now() - started);

    const exitCode: ExitCode = result.needs_human
      ? EXIT.NEEDS_HUMAN
      : result.ok
        ? EXIT.OK
        : EXIT.FAIL;

    if (ctx.recordHistory) {
      appendHistoryRow(activeFootprint(ctx.flags), {
        ts: new Date().toISOString(),
        id: actionId(),
        command: name,
        args: sanitizeArgs(ctx.args),
        ok: result.ok,
        exit: exitCode,
        duration_ms: result.meta.duration_ms,
        change_id: result.meta.change_id ?? null,
        tokens_used: result.meta.tokens_used ?? 0,
        needs_human: result.needs_human,
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
          needs_human: e.needsHuman,
        }),
        exitCode: e.exitCode,
      };
    }
    throw e;
  }
}
