import { makeEnvelope } from "../envelope.js";
import { complete } from "../llm.js";
import { runResearch } from "../research.js";
import { CommandError } from "../errors.js";
import { EXIT } from "../contracts.js";
const descriptor = {
  name: "research",
  description: 'Web research: `righthand research "<query>" [--provider <name>] [--deep] [--max-subquestions N]` \u2014 LLM-driven decompose/investigate/synthesize',
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Research question to investigate" },
      provider: {
        type: "string",
        description: "Provider name (default: config.defaults.provider)"
      },
      deep: { type: "boolean", default: false, description: "Deep mode (future)" },
      "max-subquestions": {
        type: "number",
        default: 5,
        description: "Max subquestions to investigate (default 5)"
      }
    },
    required: ["query"],
    additionalProperties: false
  },
  plugin: "@righthand/core",
  capabilities: ["net:llm"],
  costTier: "expensive"
};
const cli = {
  args: {
    query: { type: "positional", description: "Research question to investigate" },
    provider: { type: "string", description: "Provider name" },
    deep: { type: "boolean", description: "Deep mode (future enhancement)" },
    "max-subquestions": {
      type: "string",
      description: "Max subquestions (default 5)"
    }
  }
};
async function run(ctx) {
  const query = ctx.args.query ?? "";
  if (!query || !query.trim()) {
    return makeEnvelope({
      command: "research",
      ok: false,
      summary: 'research requires a query: `righthand research "<query>"`'
    });
  }
  const provider = ctx.flags.provider ?? ctx.args.provider;
  const deep = Boolean(ctx.flags.deep ?? ctx.args.deep);
  const maxRaw = ctx.flags["max-subquestions"] ?? ctx.args["max-subquestions"];
  const maxSubquestions = maxRaw == null || maxRaw === "" ? 5 : Math.max(1, Number(maxRaw) || 5);
  const callComplete = (req, opts) => complete({ ...req, provider }, { config: ctx.config, ...opts });
  let result;
  try {
    result = await runResearch(query, {
      complete: callComplete,
      maxSubquestions
    });
  } catch (e) {
    if (e instanceof CommandError && e.exitCode === EXIT.AUTH) {
      throw new CommandError(
        EXIT.AUTH,
        e.message,
        "configure an LLM provider + key, e.g. `righthand config set providers.openai.apiKey env:OPENAI_API_KEY`"
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
      sources: result.sources
    },
    meta: { tokens_used: result.tokensUsed }
  });
}
export {
  cli,
  descriptor,
  run
};
