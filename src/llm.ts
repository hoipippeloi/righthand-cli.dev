// LLM provider integration (C4). The single complete() entry point every
// reasoning capability builds on: research (C6), the self-builder (C5), and
// LLM-assisted ops domains. Two provider types — OpenAI-compatible (covers
// OpenAI, OpenRouter, Ollama, Groq, Together, vLLM, Mistral…) and native
// Anthropic. See .prds/righthand-cli/prd.md §C4 + §Technical Approach.
import type { Config, Provider } from "./contracts.ts";
import { EXIT } from "./contracts.ts";
import { CommandError } from "./errors.ts";
import { loadConfig } from "./config.ts";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  provider: string;
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  tokensUsed: number;
  finishReason?: string;
}

export interface CompleteOptions {
  config?: Config;
  // TEST SEAM: tests inject a fake fetch; no real network in the suite.
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

// Pick a provider by name; empty/unset name -> config.defaults.provider ->
// first listed provider. Throws AUTH when nothing is configured.
export function resolveProvider(
  config: Config,
  name?: string,
): { name: string; provider: Provider } {
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

// Resolve an apiKey reference (bar #4: never hold plaintext secrets on disk).
//   "env:VAR"       -> process.env[VAR] (or null if unset)
//   plaintext       -> as-is
//   "keychain:ref"  -> null for now (deferred; no native keychain dep in v1)
export function resolveApiKey(provider: Provider): string | null {
  const ref = provider.apiKey;
  if (!ref) return null;
  if (ref.startsWith("env:")) {
    const v = process.env[ref.slice(4)];
    return v && v.length ? v : null;
  }
  if (ref.startsWith("keychain:")) {
    // TODO keychain: resolve via OS keychain (keytar). Deferred — no native dep.
    return null;
  }
  return ref;
}

// Resolve a provider field that may use "env:VAR" indirection (bar #4: keep
// secrets + endpoints in the environment / .env, not copied into config.json).
//   "env:VAR" -> process.env[VAR] (or undefined if unset)
//   plaintext -> as-is
export function resolveEnvRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("env:")) return process.env[value.slice(4)];
  return value;
}

export async function complete(
  req: LlmRequest,
  opts: CompleteOptions = {},
): Promise<LlmResponse> {
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

// OpenAI-compatible: POST {baseURL}/chat/completions, Bearer auth.
async function openaiComplete(
  req: LlmRequest,
  baseURL: string | undefined,
  key: string,
  model: string | undefined,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<LlmResponse> {
  const base = baseURL || "https://api.openai.com/v1";
  const body = {
    model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  };
  const res = await fetchFn(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new CommandError(EXIT.FAIL, `LLM request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    model?: string;
    usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
  };
  const choice = data.choices?.[0];
  const usage = data.usage ?? {};
  return {
    text: choice?.message?.content ?? "",
    model: data.model ?? model ?? "",
    tokensUsed: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    finishReason: choice?.finish_reason,
  };
}

// Native Anthropic: POST {baseURL}/v1/messages, x-api-key + anthropic-version.
// system messages are extracted into the top-level `system` param (Anthropic
// rejects role:"system" inside messages).
async function anthropicComplete(
  req: LlmRequest,
  baseURL: string | undefined,
  key: string,
  model: string | undefined,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<LlmResponse> {
  const base = baseURL || "https://api.anthropic.com";
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const body: Record<string, unknown> = {
    model,
    messages,
    // max_tokens is REQUIRED by Anthropic; floor at 1024 when unspecified.
    max_tokens: req.maxTokens ?? 1024,
  };
  if (system) body.system = system;
  const res = await fetchFn(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new CommandError(EXIT.FAIL, `LLM request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    model?: string;
    stop_reason?: string;
    usage?: { total_tokens?: number; input_tokens?: number; output_tokens?: number };
  };
  const content = Array.isArray(data.content) ? data.content : [];
  const text = content
    .map((b) => (typeof b?.text === "string" ? b.text : ""))
    .join("");
  const usage = data.usage ?? {};
  return {
    text,
    model: data.model ?? model ?? "",
    tokensUsed: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    finishReason: data.stop_reason,
  };
}
