import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decomposeQuery,
  investigate,
  synthesize,
  runResearch,
  parseSubquestions,
  extractSources,
  type CompleteFn,
} from "../src/research.ts";
import { dispatch } from "../src/runtime.ts";
import { EXIT, type Config, type CommandContext, type Provider } from "../src/contracts.ts";

// --- helpers ---------------------------------------------------------------

// A canned complete() that dispatches on a regex against the joined message
// text — so one fake can answer decompose / investigate / synthesize calls.
function fakeComplete(
  responses: { match: RegExp; text: string; tokens?: number }[],
  fallback = { text: "", tokens: 1 },
): CompleteFn {
  return async (req) => {
    const joined = req.messages.map((m) => m.content).join("\n");
    for (const r of responses) {
      if (r.match.test(joined)) {
        return {
          text: r.text,
          model: "fake-model",
          tokensUsed: r.tokens ?? 10,
          finishReason: "stop",
        };
      }
    }
    return { text: fallback.text, model: "fake-model", tokensUsed: fallback.tokens, finishReason: "stop" };
  };
}

function cfg(providers: Record<string, Provider> = {}): Config {
  return {
    providers,
    plugins: [],
    permissions: { allow: [], deny: [], auto_confirm_destructive: false },
    defaults: { output: "summary", history_max: 10000 },
  };
}

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { args: {}, flags: {}, config: cfg(), isTTY: false, ...overrides };
}

// --- parseSubquestions (pure) ---------------------------------------------

test("parseSubquestions: parses a plain JSON array of strings", () => {
  const out = parseSubquestions('["what is X?", "how does X work?", "why X?"]', "fallback");
  assert.deepEqual(out, ["what is X?", "how does X work?", "why X?"]);
});

test("parseSubquestions: parses a ```json fenced array with surrounding prose", () => {
  const text = 'Here you go:\n```json\n["a", "b", "c"]\n```\nHope that helps.';
  assert.deepEqual(parseSubquestions(text, "fb"), ["a", "b", "c"]);
});

test("parseSubquestions: falls back to [query] on bad JSON", () => {
  assert.deepEqual(parseSubquestions("not json at all", "my query"), ["my query"]);
});

test("parseSubquestions: falls back when array is empty / non-strings", () => {
  assert.deepEqual(parseSubquestions("[]", "q"), ["q"]);
  assert.deepEqual(parseSubquestions('["  ", ""]', "q"), ["q"]);
  assert.deepEqual(parseSubquestions("[1, 2, 3]", "q"), ["q"]);
});

// --- extractSources (pure) -------------------------------------------------

test("extractSources: pulls urls from [n] url markers and dedupes", () => {
  const text = [
    "Some answer [1].",
    "[1] https://example.com/a",
    "[2] https://example.com/b/x",
    "[1] https://example.com/a", // duplicate marker -> deduped
  ].join("\n");
  assert.deepEqual(extractSources(text), [
    "https://example.com/a",
    "https://example.com/b/x",
  ]);
});

test("extractSources: also grabs bare urls and trims trailing punctuation", () => {
  const text = "See https://bare.example.com/page, and https://trailing.example.com/x.";
  assert.deepEqual(extractSources(text), [
    "https://bare.example.com/page",
    "https://trailing.example.com/x",
  ]);
});

test("extractSources: empty when no urls", () => {
  assert.deepEqual(extractSources("no links here at all"), []);
});

// --- decomposeQuery (injected complete) ------------------------------------

test("decomposeQuery: parses the JSON array the LLM returns", async () => {
  const fake = fakeComplete([
    { match: /Break this research/i, text: '["q1?", "q2?", "q3?"]', tokens: 5 },
  ]);
  const out = await decomposeQuery("how do cars work", fake);
  assert.deepEqual(out, ["q1?", "q2?", "q3?"]);
});

test("decomposeQuery: falls back to [query] on unparseable LLM output", async () => {
  const fake = fakeComplete([
    { match: /Break this research/i, text: "sorry I cannot help", tokens: 5 },
  ]);
  assert.deepEqual(await decomposeQuery("my query", fake), ["my query"]);
});

// --- investigate (injected complete) --------------------------------------

test("investigate: returns answer + sources extracted from [n] markers", async () => {
  const fake = fakeComplete([
    {
      match: /Answer this research/i,
      text: "Engines burn fuel.\n[1] https://a.example.com\n[2] https://b.example.com/y",
      tokens: 7,
    },
  ]);
  const f = await investigate("how do engines work", fake);
  assert.equal(f.subquestion, "how do engines work");
  assert.match(f.answer, /Engines burn fuel/);
  assert.deepEqual(f.sources, ["https://a.example.com", "https://b.example.com/y"]);
});

// --- synthesize (injected complete) ---------------------------------------

test("synthesize: returns the report and unions all finding sources", async () => {
  const fake = fakeComplete([
    { match: /Write a cited markdown report/i, text: "# Report\nCars are neat [1].", tokens: 11 },
  ]);
  const findings = [
    {
      subquestion: "q1",
      answer: "a1\n[1] https://f1.example.com",
      sources: ["https://f1.example.com"],
    },
    {
      subquestion: "q2",
      answer: "a2\n[1] https://f2.example.com",
      sources: ["https://f2.example.com"],
    },
  ];
  const { report, sources } = await synthesize("how do cars work", findings, fake);
  assert.equal(report, "# Report\nCars are neat [1].");
  assert.deepEqual(sources, ["https://f1.example.com", "https://f2.example.com"]);
});

// --- runResearch end-to-end (injected complete) ---------------------------

test("runResearch: orchestrates decompose->investigate->synthesize and sums tokens", async () => {
  const fake = fakeComplete([
    { match: /Break this research/i, text: '["what is X", "how does X work", "why X matters"]', tokens: 5 },
    {
      match: /Answer this research/i,
      text: "answer body\n[1] https://src.example.com/page",
      tokens: 7, // per subquestion
    },
    { match: /Write a cited markdown report/i, text: "# Final report\nSynthesized [1].", tokens: 11 },
  ]);

  const phases: string[] = [];
  const result = await runResearch("tell me about X", {
    complete: fake,
    onProgress: (e) => phases.push(e.subquestion ? `${e.phase}:${e.subquestion}` : e.phase),
  });

  assert.equal(result.query, "tell me about X");
  assert.deepEqual(result.subquestions, ["what is X", "how does X work", "why X matters"]);
  assert.equal(result.findings.length, 3);
  for (const f of result.findings) {
    assert.deepEqual(f.sources, ["https://src.example.com/page"]);
    assert.match(f.answer, /answer body/);
  }
  assert.equal(result.report, "# Final report\nSynthesized [1].");
  // sources unioned across findings (3x same url -> deduped to 1)
  assert.deepEqual(result.sources, ["https://src.example.com/page"]);
  // 5 (decompose) + 7*3 (investigate) + 11 (synthesize) = 37
  assert.equal(result.tokensUsed, 37);
  // progress fired decompose, 3 investigates, synthesize (in order)
  assert.deepEqual(phases, [
    "decompose",
    "investigate:what is X",
    "investigate:how does X work",
    "investigate:why X matters",
    "synthesize",
  ]);
});

test("runResearch: maxSubquestions caps the number investigated", async () => {
  const fake = fakeComplete([
    { match: /Break this research/i, text: '["a", "b", "c", "d", "e"]', tokens: 2 },
    { match: /Answer this research/i, text: "ans", tokens: 1 },
    { match: /Write a cited markdown report/i, text: "report", tokens: 1 },
  ]);
  const result = await runResearch("q", { complete: fake, maxSubquestions: 2 });
  assert.equal(result.subquestions.length, 2);
  assert.equal(result.findings.length, 2);
});

// --- command layer: no provider configured -> AUTH ------------------------

// `righthand research "q"` is capability-gated (net:llm) AND expensive
// (requires --yes). With net:llm granted + --yes but no provider configured,
// run() reaches complete() -> AUTH (4) + needs_human.
test("dispatch research: no provider configured (net:llm allowed, --yes) -> AUTH 4", async () => {
  const c = cfg(); // no providers
  c.permissions.allow = ["net:llm"];
  const { env, exitCode } = await dispatch(
    "research",
    ctx({ args: { query: "something" }, flags: { yes: true }, config: c }),
  );
  assert.equal(exitCode, EXIT.AUTH);
  assert.ok(env.needs_human, "AUTH path must set needs_human");
  assert.match(env.needs_human!, /configure an LLM provider/i);
});

test("dispatch research: net:llm not granted -> CAPABILITY_DENIED (6), run not reached", async () => {
  const { env, exitCode } = await dispatch(
    "research",
    ctx({ args: { query: "x" }, flags: { yes: true }, config: cfg({ openai: { type: "openai-compatible", apiKey: "sk" } }) }),
  );
  assert.equal(exitCode, EXIT.CAPABILITY_DENIED);
  assert.match(env.summary, /net:llm/);
});
