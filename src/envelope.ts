import type { Envelope, EnvelopeMeta } from "./contracts.ts";
import { VERSION } from "./contracts.ts";

export function makeEnvelope(input: {
  command: string;
  summary: string;
  result?: unknown;
  ok?: boolean;
  needs_human?: string | null;
  meta?: Partial<EnvelopeMeta>;
}): Envelope {
  return {
    ok: input.ok ?? true,
    command: input.command,
    summary: input.summary,
    result: input.result ?? null,
    needs_human: input.needs_human ?? null,
    meta: {
      version: VERSION,
      duration_ms: 0,
      change_id: null,
      tokens_used: 0,
      ...input.meta,
    },
  };
}

export type OutputMode = "json" | "human";

export function renderEnvelope(env: Envelope, mode: OutputMode): string {
  if (mode === "json") return JSON.stringify(env);
  // Minimal human-readable form for TTY use.
  const status = env.ok ? "✓" : "✗";
  const lines = [`${status} ${env.command}: ${env.summary}`];
  if (env.needs_human) lines.push(`  ⚠ needs human: ${env.needs_human}`);
  if (env.result !== null && typeof env.result === "object") {
    lines.push(`  result: ${JSON.stringify(env.result)}`);
  }
  if (env.meta.duration_ms) lines.push(`  (${env.meta.duration_ms}ms)`);
  return lines.join("\n");
}
