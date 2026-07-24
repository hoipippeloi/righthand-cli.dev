// C8.2 — Logging/observability ops domain. Wraps whichever log CLI is present
// (kubectl logs / aws logs tail); if none, exit 5 (DEP_MISSING) with needs_human.
import { makeEnvelope } from "../envelope.ts";
import { CommandError } from "../errors.ts";
import { EXIT, type ToolDescriptor, type CommandContext, type Envelope } from "../contracts.ts";
import { runCli, hasBinary } from "../shell.ts";

export const descriptor: ToolDescriptor = {
  name: "logs",
  description: "Logs/observability: tail [--source <s>] — wraps kubectl/aws, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["tail"] },
      source: { type: "string" },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  // Declared loosely: the concrete backend is resolved at runtime.
  capabilities: ["exec:*", "net:*"],
};

export const cli = {
  args: {
    action: { type: "positional", description: "tail", required: false },
    source: { type: "string", description: "Pod / log group / source name" },
  },
};

interface LogCli {
  bin: string;
  args: string[];
}

// Pick the first present log CLI. kubectl first (most common for "logs tail").
export function pickLogCli(): LogCli | null {
  if (hasBinary("kubectl")) return { bin: "kubectl", args: ["logs"] };
  if (hasBinary("aws")) return { bin: "aws", args: ["logs", "tail"] };
  return null;
}

// Generic compression: keep the tail + any ERROR-ish lines, drop everything else.
export function compressLog(stdout: string, n = 50): { lines: number; tail: string[]; errors: string[] } {
  const nonEmpty = stdout.split(/\r?\n/).filter(Boolean);
  const errors = nonEmpty.filter((l) => /\berror\b/i.test(l) || /\bfail/i.test(l)).slice(-10);
  return { lines: nonEmpty.length, tail: nonEmpty.slice(-n), errors };
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "tail";
  const source = ((ctx.flags.source ?? ctx.args.source) as string | undefined) ?? "default";

  if (action !== "tail") {
    return makeEnvelope({
      command: "logs",
      ok: false,
      summary: `unknown logs action: ${action}`,
    });
  }

  const logCli = pickLogCli();
  if (!logCli) {
    throw new CommandError(
      EXIT.DEP_MISSING,
      "no supported log CLI found",
      "install kubectl or the aws CLI to tail logs",
    );
  }

  const res = runCli(logCli.bin, [...logCli.args, source]);
  const c = compressLog(res.stdout);
  return makeEnvelope({
    command: "logs",
    summary: `${logCli.bin} ${source}: ${c.lines} lines, ${c.errors.length} error(s)`,
    result: { source, backend: logCli.bin, ...c },
  });
}
