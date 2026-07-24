import { makeEnvelope } from "../envelope.js";
import { CommandError } from "../errors.js";
import { EXIT } from "../contracts.js";
import { runCli, hasBinary } from "../shell.js";
const descriptor = {
  name: "logs",
  description: "Logs/observability: tail [--source <s>] \u2014 wraps kubectl/aws, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["tail"] },
      source: { type: "string" }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  // Declared loosely: the concrete backend is resolved at runtime.
  capabilities: ["exec:*", "net:*"]
};
const cli = {
  args: {
    action: { type: "positional", description: "tail", required: false },
    source: { type: "string", description: "Pod / log group / source name" }
  }
};
function pickLogCli() {
  if (hasBinary("kubectl")) return { bin: "kubectl", args: ["logs"] };
  if (hasBinary("aws")) return { bin: "aws", args: ["logs", "tail"] };
  return null;
}
function compressLog(stdout, n = 50) {
  const nonEmpty = stdout.split(/\r?\n/).filter(Boolean);
  const errors = nonEmpty.filter((l) => /\berror\b/i.test(l) || /\bfail/i.test(l)).slice(-10);
  return { lines: nonEmpty.length, tail: nonEmpty.slice(-n), errors };
}
async function run(ctx) {
  const action = ctx.args.action ?? "tail";
  const source = ctx.flags.source ?? ctx.args.source ?? "default";
  if (action !== "tail") {
    return makeEnvelope({
      command: "logs",
      ok: false,
      summary: `unknown logs action: ${action}`
    });
  }
  const logCli = pickLogCli();
  if (!logCli) {
    throw new CommandError(
      EXIT.DEP_MISSING,
      "no supported log CLI found",
      "install kubectl or the aws CLI to tail logs"
    );
  }
  const res = runCli(logCli.bin, [...logCli.args, source]);
  const c = compressLog(res.stdout);
  return makeEnvelope({
    command: "logs",
    summary: `${logCli.bin} ${source}: ${c.lines} lines, ${c.errors.length} error(s)`,
    result: { source, backend: logCli.bin, ...c }
  });
}
export {
  cli,
  compressLog,
  descriptor,
  pickLogCli,
  run
};
