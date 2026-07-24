// Plugin sandbox & permissions (C1 spec — dispatch step 3).
//
// Capability strings declare what a command DOES so dispatch can gate it
// against config.permissions BEFORE the handler runs. Format is
// "<domain>:<target>" with a trailing "*" wildcard, e.g.:
//   exec:gh              — shell out to the gh CLI
//   net:api.github.com   — outbound HTTPS to api.github.com
//   fs:~/.config         — filesystem access
//   llm:*                — any LLM provider call
//   *                    — everything (allow-all)
//
// Rule: deny wins. A declared capability is permitted only when (a) no deny
// pattern matches it AND (b) some allow pattern matches it (or allow holds
// "*"). Commands with NO declared capabilities are allowed by default — they
// are assumed benign; their run is still recorded in history.jsonl (the log).

import type { ToolDescriptor } from "./contracts.ts";

export interface Permissions {
  allow: string[];
  deny: string[];
}

export interface CapabilityResult {
  ok: boolean;
  denied: string[];
}

// Does `cap` match a permission `pattern`? Supports a trailing "*" wildcard
// only ("exec:*", "*"); anything else is exact equality. A bare "*" matches
// every cap (prefix "" → startsWith is always true).
export function matches(cap: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return cap.startsWith(pattern.slice(0, -1));
  }
  return cap === pattern;
}

// Check declared capabilities against the active permission set. Undeclared
// (undefined/empty) => allowed (benign by default; the run is logged via the
// normal dispatch history row). Deny wins over allow on a per-cap basis.
export function checkCapabilities(
  declared: string[] | undefined,
  permissions: Permissions,
): CapabilityResult {
  if (!declared || declared.length === 0) {
    return { ok: true, denied: [] };
  }
  const denied: string[] = [];
  for (const cap of declared) {
    if (permissions.deny.some((p) => matches(cap, p))) {
      denied.push(cap); // deny wins
    } else if (!permissions.allow.some((p) => matches(cap, p))) {
      denied.push(cap); // declared but not granted by any allow pattern
    }
  }
  return { ok: denied.length === 0, denied };
}

// Dispatch-level approval gate: a destructive or expensive command must be
// explicitly confirmed (--yes / config.permissions.auto_confirm_destructive)
// before it runs. `mutates` alone does NOT trigger this — self-confirming
// commands (reset, rollback) set mutates and run their own confirm.ts flow,
// so they are unaffected by this gate.
export function requiresApproval(descriptor: ToolDescriptor): boolean {
  return descriptor.destructive === true || descriptor.costTier === "expensive";
}
