import { VERSION } from "./contracts.js";
function makeEnvelope(input) {
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
      ...input.meta
    }
  };
}
function renderEnvelope(env, mode) {
  if (mode === "json") return JSON.stringify(env);
  const status = env.ok ? "\u2713" : "\u2717";
  const lines = [`${status} ${env.command}: ${env.summary}`];
  if (env.needs_human) lines.push(`  \u26A0 needs human: ${env.needs_human}`);
  if (env.result !== null && typeof env.result === "object") {
    lines.push(`  result: ${JSON.stringify(env.result)}`);
  }
  if (env.meta.duration_ms) lines.push(`  (${env.meta.duration_ms}ms)`);
  return lines.join("\n");
}
export {
  makeEnvelope,
  renderEnvelope
};
