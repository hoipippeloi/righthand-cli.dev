import {
  complete as llmComplete
} from "./llm.js";
const DECOMPOSE_SYSTEM = `You are a research planner. Break the user's research question into focused, non-overlapping subquestions that together cover it. Respond with ONLY a JSON array of strings (the subquestions), no prose, no markdown fences.`;
function parseSubquestions(text, fallback) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const arrMatch = candidate.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) {
        const strs = parsed.filter((x) => typeof x === "string").map((s) => s.trim()).filter((s) => s.length > 0);
        if (strs.length > 0) return strs;
      }
    } catch {
    }
  }
  return [fallback];
}
async function decomposeQuery(query, complete = llmComplete, count = 5) {
  const n = Math.max(3, Math.min(count, 10));
  const messages = [
    { role: "system", content: DECOMPOSE_SYSTEM },
    {
      role: "user",
      content: `Break this research question into ${n} focused, non-overlapping subquestions:

${query}

Respond with ONLY a JSON array of ${n} strings.`
    }
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.3,
    maxTokens: 400
  });
  return parseSubquestions(res.text, query);
}
const INVESTIGATE_SYSTEM = `You are a research analyst. Answer the user's subquestion accurately and concisely using your knowledge (and any web access you have). Cite every source on its own line at the end as "[n] https://full-url" so sources can be extracted mechanically. Prefer primary/high-trust sources.`;
function extractSources(text) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)\]"'<\]]+/g)) {
    const url = m[0].replace(/[.,;:!)]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
async function investigate(subquestion, complete = llmComplete) {
  const messages = [
    { role: "system", content: INVESTIGATE_SYSTEM },
    {
      role: "user",
      content: `Answer this research subquestion:

${subquestion}

Then list every source as "[n] https://..." on its own line.`
    }
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.4,
    maxTokens: 800
  });
  return {
    subquestion,
    answer: res.text,
    sources: extractSources(res.text)
  };
}
const SYNTHESIZE_SYSTEM = `You are a research synthesizer. Given an original question and several findings, write a clear cited markdown report that integrates everything into a decision-ready answer. Keep numbered citations [n] inline. Do not invent sources.`;
function unionSources(findings) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
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
async function synthesize(query, findings, complete = llmComplete) {
  const findingsBlock = findings.map(
    (f, i) => `### Finding ${i + 1}: ${f.subquestion}
${f.answer}`
  ).join("\n\n");
  const messages = [
    { role: "system", content: SYNTHESIZE_SYSTEM },
    {
      role: "user",
      content: `Original research question:
${query}

Findings:
${findingsBlock}

Write a cited markdown report answering the original question, integrating all findings.`
    }
  ];
  const res = await complete({
    provider: "",
    messages,
    temperature: 0.3,
    maxTokens: 1200
  });
  const sources = unionSources([
    ...findings,
    { subquestion: "", answer: res.text, sources: extractSources(res.text) }
  ]);
  return { report: res.text, sources };
}
async function runResearch(query, options = {}) {
  const completeFn = options.complete ?? llmComplete;
  const onProgress = options.onProgress;
  const max = options.maxSubquestions;
  let tokensUsed = 0;
  const counting = async (req, opts) => {
    const res = await completeFn(req, opts);
    tokensUsed += res.tokensUsed ?? 0;
    return res;
  };
  onProgress?.({ phase: "decompose" });
  const all = await decomposeQuery(query, counting);
  const subquestions = max && max > 0 ? all.slice(0, max) : all;
  const findings = [];
  for (const sq of subquestions) {
    onProgress?.({ phase: "investigate", subquestion: sq });
    findings.push(await investigate(sq, counting));
  }
  onProgress?.({ phase: "synthesize" });
  const { report, sources } = await synthesize(query, findings, counting);
  return { query, subquestions, findings, report, sources, tokensUsed };
}
export {
  decomposeQuery,
  extractSources,
  investigate,
  parseSubquestions,
  runResearch,
  synthesize
};
