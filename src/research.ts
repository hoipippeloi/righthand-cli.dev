// C6 — Web Research pipeline (shallow). LLM-driven via C4's complete(): there
// is NO hard-coupled search API. Research rides the configured LLM's own web
// knowledge / web-browsing features, so quality scales with the provider a user
// configures (per the web-research skill methodology + the LLM-driven research
// decision). See .prds/righthand-cli/prd.md §C6 + docs decision
// "research-backend-is-llm-driven".
//
// Pipeline: decompose(query) -> investigate(each subquestion) -> synthesize.
// Every function takes an INJECTABLE `complete` (default the real llm.complete)
// so tests feed canned responses with zero network. The command layer binds a
// provider into complete; the pipeline itself is provider-agnostic and just
// builds LlmRequests.
import {
  complete as llmComplete,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type CompleteOptions,
} from "./llm.ts";

// A swappable complete() — tests inject canned responses; the command injects a
// provider+config-bound wrapper. Same shape as llm.complete.
export type CompleteFn = (
  req: LlmRequest,
  opts?: CompleteOptions,
) => Promise<LlmResponse>;

export interface Finding {
  subquestion: string;
  answer: string;
  sources: string[];
}

export interface ResearchResult {
  query: string;
  subquestions: string[];
  findings: Finding[];
  report: string;
  sources: string[];
  tokensUsed: number;
}

export interface ProgressEvent {
  phase: "decompose" | "investigate" | "synthesize";
  subquestion?: string;
}

export interface RunResearchOptions {
  complete?: CompleteFn;
  onProgress?: (e: ProgressEvent) => void;
  maxSubquestions?: number;
}

// --- decompose -------------------------------------------------------------

const DECOMPOSE_SYSTEM = `You are a research planner. Break the user's research question into focused, non-overlapping subquestions that together cover it. Respond with ONLY a JSON array of strings (the subquestions), no prose, no markdown fences.`;

// Parse the LLM's subquestion output. Accepts raw JSON arrays, arrays wrapped in
// ```json fences, or arrays embedded in prose. Any failure -> [fallback] so the
// pipeline never hard-fails on a malformed model response.
export function parseSubquestions(text: string, fallback: string): string[] {
  // Strip a markdown code fence if the model wrapped the JSON.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Grab the first `[...]` span in what remains.
  const arrMatch = candidate.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) {
        const strs = parsed
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (strs.length > 0) return strs;
      }
    } catch {
      // malformed JSON -> fall through to fallback
    }
  }
  return [fallback];
}

// Ask the LLM to split `query` into `count` focused subquestions. Returns the
// raw question on any parse failure (never throws on bad model output).
export async function decomposeQuery(
  query: string,
  complete: CompleteFn = llmComplete,
  count = 5,
): Promise<string[]> {
  const n = Math.max(3, Math.min(count, 10));
  const messages: LlmMessage[] = [
    { role: "system", content: DECOMPOSE_SYSTEM },
    {
      role: "user",
      content: `Break this research question into ${n} focused, non-overlapping subquestions:\n\n${query}\n\nRespond with ONLY a JSON array of ${n} strings.`,
    },
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.3,
    maxTokens: 400,
  });
  return parseSubquestions(res.text, query);
}

// --- investigate -----------------------------------------------------------

const INVESTIGATE_SYSTEM = `You are a research analyst. Answer the user's subquestion accurately and concisely using your knowledge (and any web access you have). Cite every source on its own line at the end as "[n] https://full-url" so sources can be extracted mechanically. Prefer primary/high-trust sources.`;

// Pull source URLs out of model text. Captures the instructed "[n] url" markers
// AND bare URLs (some models drop the marker). De-dupes, trims trailing punct.
export function extractSources(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)\]"'<\]]+/g)) {
    const url = m[0].replace(/[.,;:!)]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

// Answer one subquestion via the LLM, returning the answer + extracted sources.
export async function investigate(
  subquestion: string,
  complete: CompleteFn = llmComplete,
): Promise<Finding> {
  const messages: LlmMessage[] = [
    { role: "system", content: INVESTIGATE_SYSTEM },
    {
      role: "user",
      content: `Answer this research subquestion:\n\n${subquestion}\n\nThen list every source as "[n] https://..." on its own line.`,
    },
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.4,
    maxTokens: 800,
  });
  return {
    subquestion,
    answer: res.text,
    sources: extractSources(res.text),
  };
}

// --- synthesize ------------------------------------------------------------

const SYNTHESIZE_SYSTEM = `You are a research synthesizer. Given an original question and several findings, write a clear cited markdown report that integrates everything into a decision-ready answer. Keep numbered citations [n] inline. Do not invent sources.`;

// Dedupe + order-preserving union of all finding sources.
function unionSources(findings: Finding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of findings) {
    for (const s of f.sources) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

// Produce a cited markdown report integrating all findings.
export async function synthesize(
  query: string,
  findings: Finding[],
  complete: CompleteFn = llmComplete,
): Promise<{ report: string; sources: string[] }> {
  const findingsBlock = findings
    .map(
      (f, i) =>
        `### Finding ${i + 1}: ${f.subquestion}\n${f.answer}`,
    )
    .join("\n\n");
  const messages: LlmMessage[] = [
    { role: "system", content: SYNTHESIZE_SYSTEM },
    {
      role: "user",
      content: `Original research question:\n${query}\n\nFindings:\n${findingsBlock}\n\nWrite a cited markdown report answering the original question, integrating all findings.`,
    },
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.3,
    maxTokens: 1200,
  });
  // Also harvest any sources the synthesizer newly cites inline.
  const sources = unionSources([
    ...findings,
    { subquestion: "", answer: res.text, sources: extractSources(res.text) },
  ]);
  return { report: res.text, sources };
}

// --- orchestration ---------------------------------------------------------

// decompose -> investigate(each) -> synthesize. Sums tokens across every LLM
// call via a counting wrapper around the injected complete. `onProgress` lets a
// caller (CLI spinner / tests) observe each phase.
export async function runResearch(
  query: string,
  options: RunResearchOptions = {},
): Promise<ResearchResult> {
  const completeFn = options.complete ?? llmComplete;
  const onProgress = options.onProgress;
  const max = options.maxSubquestions;

  let tokensUsed = 0;
  const counting: CompleteFn = async (req, opts) => {
    const res = await completeFn(req, opts);
    tokensUsed += res.tokensUsed ?? 0;
    return res;
  };

  onProgress?.({ phase: "decompose" });
  const all = await decomposeQuery(query, counting);
  const subquestions = max && max > 0 ? all.slice(0, max) : all;

  const findings: Finding[] = [];
  for (const sq of subquestions) {
    onProgress?.({ phase: "investigate", subquestion: sq });
    findings.push(await investigate(sq, counting));
  }

  onProgress?.({ phase: "synthesize" });
  const { report, sources } = await synthesize(query, findings, counting);

  return { query, subquestions, findings, report, sources, tokensUsed };
}
