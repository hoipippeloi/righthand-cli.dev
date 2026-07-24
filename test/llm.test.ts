import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveProvider,
  resolveApiKey,
  complete,
  type LlmRequest,
} from "../src/llm.ts";
import { dispatch } from "../src/runtime.ts";
import { EXIT, type Config, type CommandContext, type Provider } from "../src/contracts.ts";

// In-process CommandContext builder (recordHistory off -> no disk side effects).
function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { args: {}, flags: {}, config: cfg({}), isTTY: false, ...overrides };
}

// Minimal config builder so tests don't touch disk or loadConfig.
function cfg(
  providers: Record<string, Provider>,
  defaults: { provider?: string } = {},
): Config {
  return {
    providers,
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10000, ...defaults },
  };
}

const OAI: Provider = { type: "openai-compatible", apiKey: "sk-test", model: "gpt-4o" };
const ANT: Provider = { type: "anthropic", apiKey: "sk-ant", model: "claude-3" };

// --- resolveProvider: name -> default -> first -> throw ---

test("resolveProvider: explicit name wins", () => {
  const c = cfg({ foo: OAI, bar: ANT });
  const { name, provider } = resolveProvider(c, "bar");
  assert.equal(name, "bar");
  assert.equal(provider, ANT);
});

test("resolveProvider: falls back to config.defaults.provider when no name", () => {
  const c = cfg({ foo: OAI, bar: ANT }, { provider: "bar" });
  const { name } = resolveProvider(c);
  assert.equal(name, "bar");
});

test("resolveProvider: first listed provider when no name and no default", () => {
  const c = cfg({ foo: OAI, bar: ANT });
  const { name } = resolveProvider(c);
  assert.equal(name, "foo");
});

test("resolveProvider: empty-string name treated as unset -> default", () => {
  const c = cfg({ foo: OAI }, { provider: "foo" });
  assert.equal(resolveProvider(c, "").name, "foo");
});

test("resolveProvider: throws AUTH when no providers configured", () => {
  assert.throws(() => resolveProvider(cfg({})), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.equal((e as { exitCode: number }).exitCode, EXIT.AUTH);
    return true;
  });
});

test("resolveProvider: throws AUTH on unknown explicit name", () => {
  assert.throws(() => resolveProvider(cfg({ foo: OAI }), "nope"), (e: unknown) => {
    assert.equal((e as { exitCode: number }).exitCode, EXIT.AUTH);
    return true;
  });
});

// --- resolveApiKey: env: / plaintext / keychain: ---

test("resolveApiKey: env: indirection reads process.env", () => {
  process.env.RH_TEST_LLM_KEY = "secret-from-env";
  try {
    const key = resolveApiKey({ type: "openai-compatible", apiKey: "env:RH_TEST_LLM_KEY" });
    assert.equal(key, "secret-from-env");
  } finally {
    delete process.env.RH_TEST_LLM_KEY;
  }
});

test("resolveApiKey: env: unset var -> null", () => {
  assert.equal(resolveApiKey({ type: "openai-compatible", apiKey: "env:RH_DEFINITELY_UNSET" }), null);
});

test("resolveApiKey: plaintext returned as-is", () => {
  assert.equal(resolveApiKey({ type: "openai-compatible", apiKey: "sk-plain" }), "sk-plain");
});

test("resolveApiKey: keychain: -> null (deferred)", () => {
  assert.equal(resolveApiKey({ type: "openai-compatible", apiKey: "keychain:work/key" }), null);
});

test("resolveApiKey: missing apiKey -> null", () => {
  assert.equal(resolveApiKey({ type: "openai-compatible" }), null);
});

// --- complete(): OpenAI-compatible success via injected fake fetch ---

// Minimal fake fetch shape (ok/status/json). Cast keeps it compatible with the
// `typeof fetch` test seam without real network.
type FakeInit = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
function fakeFetchFactory(handler: (url: string, init: FakeInit) => unknown) {
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    const capturedInit: FakeInit = {
      method: init?.method,
      headers: (init?.headers as Record<string, string> | undefined) ?? undefined,
      body: init?.body as string | undefined,
      signal: init?.signal ?? undefined,
    };
    const out = handler(url.toString(), capturedInit);
    return {
      ok: true,
      status: 200,
      json: async () => out,
      text: async () => JSON.stringify(out),
    };
  };
  return fn as unknown as typeof fetch;
}

test("complete: openai-compatible success parses text + tokens + model", async () => {
  const fetchFn = fakeFetchFactory(() => ({
    choices: [{ message: { content: "Hello there!" }, finish_reason: "stop" }],
    model: "gpt-4o",
    usage: { total_tokens: 42 },
  }));
  const req: LlmRequest = {
    provider: "openai",
    messages: [{ role: "user", content: "hi" }],
  };
  const res = await complete(req, { config: cfg({ openai: OAI }), fetchFn });
  assert.equal(res.text, "Hello there!");
  assert.equal(res.tokensUsed, 42);
  assert.equal(res.model, "gpt-4o");
  assert.equal(res.finishReason, "stop");
});

test("complete: openai-compatible sends Bearer auth + /chat/completions + body", async () => {
  let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const fetchFn = fakeFetchFactory((url, init) => {
    captured = { url, headers: init.headers ?? {}, body: JSON.parse(init.body ?? "{}") };
    return { choices: [{ message: { content: "x" } }], model: "gpt-4o", usage: { total_tokens: 5 } };
  });
  await complete(
    { provider: "openai", messages: [{ role: "user", content: "hi" }], temperature: 0.5 },
    { config: cfg({ openai: OAI }), fetchFn },
  );
  assert.ok(captured);
  assert.match(captured!.url, /\/chat\/completions$/);
  assert.equal(captured!.headers.authorization, "Bearer sk-test");
  assert.equal(captured!.headers["content-type"], "application/json");
  assert.deepEqual(captured!.body.messages, [{ role: "user", content: "hi" }]);
  assert.equal(captured!.body.temperature, 0.5);
});

test("complete: openai-compatible falls back to provider.model when req.model unset", async () => {
  const fetchFn = fakeFetchFactory(() => ({
    choices: [{ message: { content: "ok" } }],
    usage: { total_tokens: 1 },
  }));
  let seen: Record<string, unknown> = {};
  const wrap: typeof fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    seen = JSON.parse((init?.body as string) ?? "{}");
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: { total_tokens: 1 } }) };
  }) as unknown as typeof fetch;
  await complete(
    { provider: "openai", messages: [{ role: "user", content: "hi" }] },
    { config: cfg({ openai: OAI }), fetchFn: wrap },
  );
  assert.equal(seen.model, "gpt-4o");
});

// --- complete(): auth error when no key resolved ---

test("complete: throws AUTH when key unresolvable (env: unset)", async () => {
  const c = cfg({ openai: { type: "openai-compatible", apiKey: "env:RH_UNSET_KEY" } });
  await assert.rejects(
    () => complete({ provider: "openai", messages: [{ role: "user", content: "hi" }] }, { config: c }),
    (e: unknown) => {
      assert.equal((e as { exitCode: number }).exitCode, EXIT.AUTH);
      return true;
    },
  );
});

test("complete: throws AUTH when no providers configured (no network call)", async () => {
  let called = false;
  const fetchFn = fakeFetchFactory(() => {
    called = true;
    return {};
  });
  await assert.rejects(
    () => complete({ provider: "", messages: [{ role: "user", content: "hi" }] }, { config: cfg({}), fetchFn }),
    (e: unknown) => {
      assert.equal((e as { exitCode: number }).exitCode, EXIT.AUTH);
      return true;
    },
  );
  assert.equal(called, false, "fetch must not be called when no provider is configured");
});

// --- complete(): native Anthropic path + headers + system extraction ---

test("complete: anthropic sends x-api-key + anthropic-version, extracts system, sums tokens", async () => {
  let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const fetchFn = fakeFetchFactory((url, init) => {
    captured = { url, headers: init.headers ?? {}, body: JSON.parse(init.body ?? "{}") };
    return {
      content: [{ type: "text", text: "anthropic reply" }],
      model: "claude-3",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  });
  const res = await complete(
    {
      provider: "ant",
      messages: [
        { role: "system", content: "be concise" },
        { role: "user", content: "hi" },
      ],
    },
    { config: cfg({ ant: ANT }), fetchFn },
  );
  assert.ok(captured);
  assert.match(captured!.url, /\/v1\/messages$/);
  assert.equal(captured!.headers["x-api-key"], "sk-ant");
  assert.equal(captured!.headers["anthropic-version"], "2023-06-01");
  // No Bearer header for anthropic.
  assert.equal(captured!.headers.authorization, undefined);
  // system extracted to top-level; messages contain only user/assistant.
  assert.equal(captured!.body.system, "be concise");
  assert.deepEqual(captured!.body.messages, [{ role: "user", content: "hi" }]);
  // tokens summed from input+output when no total_tokens.
  assert.equal(res.tokensUsed, 15);
  assert.equal(res.text, "anthropic reply");
  assert.equal(res.finishReason, "end_turn");
});

test("complete: anthropic omits system when no system message present", async () => {
  let body: Record<string, unknown> | null = null;
  const fetchFn = fakeFetchFactory((_url, init) => {
    body = JSON.parse(init.body ?? "{}");
    return { content: [{ type: "text", text: "ok" }], model: "claude-3", usage: {} };
  });
  await complete(
    { provider: "ant", messages: [{ role: "user", content: "hi" }] },
    { config: cfg({ ant: ANT }), fetchFn },
  );
  assert.equal(body!.system, undefined);
});

// --- command layer (dispatch): capability gate + AUTH + envelope shape ---

// `righthand llm ask "<prompt>"` is denied at the capability gate unless net:llm
// is granted — dispatch never reaches run().
test("dispatch llm: net:llm not granted -> CAPABILITY_DENIED (6), run not reached", async () => {
  const { env, exitCode } = await dispatch(
    "llm",
    ctx({ args: { prompt: "hi" }, config: cfg({ openai: OAI }) }),
  );
  assert.equal(exitCode, EXIT.CAPABILITY_DENIED);
  assert.match(env.summary, /net:llm/);
  assert.ok(env.needs_human);
});

// net:llm granted but no provider/key -> run() reaches complete() -> AUTH (4).
test("dispatch llm: no provider configured (net:llm allowed) -> AUTH 4 + needs_human", async () => {
  const c = cfg({});
  c.permissions.allow = ["net:llm"];
  const { env, exitCode } = await dispatch(
    "llm",
    ctx({ args: { prompt: "hi" }, config: c }),
  );
  assert.equal(exitCode, EXIT.AUTH);
  assert.ok(env.needs_human, "AUTH path must set needs_human");
});

// End-to-end success via the actual run() (global fetch patched — no network):
// envelope carries {text, model, tokensUsed} and meta.tokens_used.
test("dispatch llm: success -> envelope {text,model,tokensUsed} + meta.tokens_used set", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "4" }, finish_reason: "stop" }],
        model: "gpt-4o",
        usage: { total_tokens: 7 },
      }),
    };
  }) as unknown as typeof fetch;
  try {
    const c = cfg({ openai: OAI });
    c.permissions.allow = ["net:llm"];
    const { env, exitCode } = await dispatch(
      "llm",
      ctx({ args: { prompt: "what is 2+2" }, config: c }),
    );
    assert.equal(called, true);
    assert.equal(exitCode, EXIT.OK);
    assert.deepEqual(env.result, { text: "4", model: "gpt-4o", tokensUsed: 7 });
    assert.equal(env.meta.tokens_used, 7);
  } finally {
    globalThis.fetch = original;
  }
});
