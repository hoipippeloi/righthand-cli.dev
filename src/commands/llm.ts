// `righthand llm ask "<prompt>" [--provider <name>]` (C4). Calls complete()
// and returns a bounded envelope. Auto-discovered — drop-in, no shared-file
// edits. No provider/key configured -> needs_human + exit AUTH (4).
import { makeEnvelope } from "../envelope.ts";
import { complete } from "../llm.ts";
import { CommandError } from "../errors.ts";
import { EXIT, type ToolDescriptor, type CommandContext, type Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "llm",
  description: 'Ask the configured LLM: `righthand llm ask "<prompt>" [--provider <name>]`',
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Prompt to send to the LLM" },
      provider: {
        type: "string",
        description: "Provider name (default: config.defaults.provider)",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  capabilities: ["net:llm"],
  costTier: "cheap",
};

export const cli = {
  args: {
    prompt: { type: "positional", description: "Prompt to send to the LLM" },
    provider: { type: "string", description: "Provider name" },
  },
};

// The documented form is `righthand llm ask "<prompt>"`: the literal "ask"
// binds to the positional (citty assigns positionals in order), and the real
// prompt lands in the leftover positional array `args._`. Dispatch/tests pass
// the prompt directly as args.prompt.
function extractPrompt(args: Record<string, unknown>): string {
  const p = args.prompt;
  if (typeof p === "string" && p !== "ask") return p;
  const rest = args._;
  if (Array.isArray(rest) && typeof rest[0] === "string") return rest[0];
  return "";
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const prompt = extractPrompt(ctx.args);
  const provider =
    (ctx.flags.provider as string | undefined) ?? (ctx.args.provider as string | undefined);

  let res;
  try {
    res = await complete(
      { provider: provider ?? "", messages: [{ role: "user", content: prompt }] },
      { config: ctx.config },
    );
  } catch (e) {
    if (e instanceof CommandError && e.exitCode === EXIT.AUTH) {
      // No provider/key -> needs_human + exit AUTH (4).
      throw new CommandError(
        EXIT.AUTH,
        e.message,
        "configure an LLM provider + key, e.g. `righthand config set providers.openai.apiKey env:OPENAI_API_KEY`",
      );
    }
    throw e;
  }

  return makeEnvelope({
    command: "llm",
    summary: `llm replied (${res.tokensUsed} tokens, ${res.model})`,
    result: { text: res.text, model: res.model, tokensUsed: res.tokensUsed },
    meta: { tokens_used: res.tokensUsed },
  });
}
