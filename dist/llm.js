import { EXIT } from "./contracts.js";
import { CommandError } from "./errors.js";
import { loadConfig } from "./config.js";
function resolveProvider(config, name) {
  const want = name && name.length ? name : config.defaults.provider;
  if (want) {
    const provider = config.providers[want];
    if (provider) return { name: want, provider };
    throw new CommandError(EXIT.AUTH, `unknown LLM provider: "${want}"`);
  }
  for (const [n, provider] of Object.entries(config.providers)) {
    return { name: n, provider };
  }
  throw new CommandError(EXIT.AUTH, "no LLM provider configured");
}
function resolveApiKey(provider) {
  const ref = provider.apiKey;
  if (!ref) return null;
  if (ref.startsWith("env:")) {
    const v = process.env[ref.slice(4)];
    return v && v.length ? v : null;
  }
  if (ref.startsWith("keychain:")) {
    return null;
  }
  return ref;
}
function resolveEnvRef(value) {
  if (!value) return void 0;
  if (value.startsWith("env:")) return process.env[value.slice(4)];
  return value;
}
async function complete(req, opts = {}) {
  const config = opts.config ?? loadConfig();
  const { name, provider } = resolveProvider(config, req.provider);
  const key = resolveApiKey(provider);
  if (!key) {
    throw new CommandError(EXIT.AUTH, `no API key resolved for provider "${name}"`);
  }
  const fetchFn = opts.fetchFn ?? fetch;
  const model = req.model ?? resolveEnvRef(provider.model);
  const baseURL = resolveEnvRef(provider.baseURL);
  if (provider.type === "anthropic") {
    return anthropicComplete(req, baseURL, key, model, fetchFn, opts.signal);
  }
  return openaiComplete(req, baseURL, key, model, fetchFn, opts.signal);
}
async function openaiComplete(req, baseURL, key, model, fetchFn, signal) {
  const base = baseURL || "https://api.openai.com/v1";
  const body = {
    model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature,
    max_tokens: req.maxTokens
  };
  const res = await fetchFn(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    throw new CommandError(EXIT.FAIL, `LLM request failed (${res.status})`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const usage = data.usage ?? {};
  return {
    text: choice?.message?.content ?? "",
    model: data.model ?? model ?? "",
    tokensUsed: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    finishReason: choice?.finish_reason
  };
}
async function anthropicComplete(req, baseURL, key, model, fetchFn, signal) {
  const base = baseURL || "https://api.anthropic.com";
  const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const body = {
    model,
    messages,
    // max_tokens is REQUIRED by Anthropic; floor at 1024 when unspecified.
    max_tokens: req.maxTokens ?? 1024
  };
  if (system) body.system = system;
  const res = await fetchFn(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    throw new CommandError(EXIT.FAIL, `LLM request failed (${res.status})`);
  }
  const data = await res.json();
  const content = Array.isArray(data.content) ? data.content : [];
  const text = content.map((b) => typeof b?.text === "string" ? b.text : "").join("");
  const usage = data.usage ?? {};
  return {
    text,
    model: data.model ?? model ?? "",
    tokensUsed: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    finishReason: data.stop_reason
  };
}
export {
  complete,
  resolveApiKey,
  resolveEnvRef,
  resolveProvider
};
