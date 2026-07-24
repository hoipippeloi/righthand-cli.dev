// C6 — `righthand research "<query>" [--provider <name>] [--deep] [--max-subquestions N]`.
// Runs the shallow web-research pipeline (decompose -> investigate -> synthesize)
// over the configured LLM. There is no search API — research rides the LLM's own
// web knowledge/features (see decision: research-backend-is-llm-driven).
// `--deep` is accepted but the deep multi-query/ranking methodology is a future
// enhancement; for now it just runs the shallow pipeline (optionally with more
// subquestions). No provider/key configured -> needs_human + exit AUTH (4).
// Auto-discovered — drop-in, no shared-file edits.
import { makeEnvelope } from "../envelope.ts";
import { complete } from "../llm.ts";
import type { CompleteFn } from "../research.ts";
import { runResearch } from "../research.ts";
import { CommandError } from "../errors.ts";
import { EXIT, type ToolDescriptor, type CommandContext, type Envelope } from "../contracts.ts";

export const descriptor: ToolDescriptor = {
  name: "research",
  description:
    'Web research: `righthand research "<query>" [--provider <name>] [--deep] [--max-subquestions N]` — LLM-driven decompose/investigate/synthesize',
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Research question to investigate" },
      provider: {
        type: "string",
        description: "Provider name (default: config.defaults.provider)",
      },
      deep: { type: "boolean", default: false, description: "Deep mode (future)" },
      "max-subquestions": {
        type: "number",
        default: 5,
        description: "Max subquestions to investigate (default 5)",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  capabilities: ["net:llm"],
  costTier: "expensive",
};

export const cli = {
  args: {
    query: { type: "positional", description: "Research question to investigate" },
    provider: { type: "string", description: "Provider name" },
    deep: { type: "boolean", description: "Deep mode (future enhancement)" },
    "max-subquestions": {
      type: "string",
      description: "Max subquestions (default 5)",
    },
  },
};

export async function run(ctx: CommandContext): Promise<Envelope> {
  const query = (ctx.args.query as string) ?? "";
  if (!query || !query.trim()) {
    return makeEnvelope({
      command: "research",
      ok: false,
      summary: "research requires a query: `righthand research \"<query>\"`",
    });
  }

  const provider =
    (ctx.flags.provider as string | undefined) ?? (ctx.args.provider as string | undefined);
  const deep = Boolean(ctx.flags.deep ?? ctx.args.deep);
  const maxRaw = ctx.flags["max-subquestions"] ?? ctx.args["max-subquestions"];
  const maxSubquestions = maxRaw == null || maxRaw === "" ? 5 : Math.max(1, Number(maxRaw) || 5);

  // Bind the chosen provider + config into a complete() the pipeline can call
  // without knowing about providers. Spread order: provider wins over req's.
  const callComplete: CompleteFn = (req, opts) =>
    complete({ ...req, provider }, { config: ctx.config, ...opts });

  let result;
  try {
    result = await runResearch(query, {
      complete: callComplete,
      maxSubquestions,
    });
  } catch (e) {
    // No provider/key resolved -> AUTH + needs_human (mirrors `llm`).
    if (e instanceof CommandError && e.exitCode === EXIT.AUTH) {
      throw new CommandError(
        EXIT.AUTH,
        e.message,
        "configure an LLM provider + key, e.g. `righthand config set providers.openai.apiKey env:OPENAI_API_KEY`",
      );
    }
    throw e;
  }

  const note = deep ? " [deep mode is a future enhancement; ran shallow pipeline]" : "";
  return makeEnvelope({
    command: "research",
    summary: `researched "${query}": ${result.subquestions.length} subquestion(s), ${result.sources.length} source(s), ${result.tokensUsed} tokens${note}`,
    result: {
      query: result.query,
      subquestions: result.subquestions,
      findings: result.findings,
      report: result.report,
      sources: result.sources,
    },
    meta: { tokens_used: result.tokensUsed },
  });
}
