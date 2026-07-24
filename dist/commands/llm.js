import { makeEnvelope } from "../envelope.js";
import { complete } from "../llm.js";
import { CommandError } from "../errors.js";
import { EXIT } from "../contracts.js";
const descriptor = {
  name: "llm",
  description: 'Ask the configured LLM: `righthand llm ask "<prompt>" [--provider <name>]`',
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Prompt to send to the LLM" },
      provider: {
        type: "string",
        description: "Provider name (default: config.defaults.provider)"
      }
    },
    required: ["prompt"],
    additionalProperties: false
  },
  plugin: "@righthand/core",
  capabilities: ["net:llm"],
  costTier: "cheap"
};
const cli = {
  args: {
    prompt: { type: "positional", description: "Prompt to send to the LLM" },
    provider: { type: "string", description: "Provider name" }
  }
};
function extractPrompt(args) {
  const p = args.prompt;
  if (typeof p === "string" && p !== "ask") return p;
  const rest = args._;
  if (Array.isArray(rest) && typeof rest[0] === "string") return rest[0];
  return "";
}
async function run(ctx) {
  const prompt = extractPrompt(ctx.args);
  const provider = ctx.flags.provider ?? ctx.args.provider;
  let res;
  try {
    res = await complete(
      { provider: provider ?? "", messages: [{ role: "user", content: prompt }] },
      { config: ctx.config }
    );
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
  return makeEnvelope({
    command: "llm",
    summary: `llm replied (${res.tokensUsed} tokens, ${res.model})`,
    result: { text: res.text, model: res.model, tokensUsed: res.tokensUsed },
    meta: { tokens_used: res.tokensUsed }
  });
}
export {
  cli,
  descriptor,
  run
};
