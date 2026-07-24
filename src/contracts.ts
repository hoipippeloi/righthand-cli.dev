// righthand core contracts — shared across all commands/specs (C1).
// See .specs/core-runtime/spec.md.

export const VERSION = "0.0.1";

// Exit codes (shared contract, C1 spec).
export const EXIT = {
  OK: 0,
  FAIL: 1,
  USAGE: 2,
  NEEDS_HUMAN: 3,
  AUTH: 4,
  DEP_MISSING: 5,
  CAPABILITY_DENIED: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
export type CostTier = "free" | "cheap" | "expensive";

// MCP-shaped descriptor — what `righthand tools --json` emits per command.
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  plugin: string;
  capabilities?: string[];
  destructive?: boolean;
  // True when the command mutates footprint state → dispatch wraps it in
  // journal() (snapshot before/after, sets meta.change_id). See C7.
  mutates?: boolean;
  costTier?: CostTier;
}

// LLM provider config (C9). apiKey uses indirection: "env:VAR" | "keychain:ref"
// | plaintext. NEVER emitted to output (redacted by config get/list).
export interface Provider {
  type: "openai-compatible" | "anthropic";
  baseURL?: string;
  apiKey?: string;
  model?: string;
  params?: Record<string, unknown>;
}

export interface EnvelopeMeta {
  version: string;
  duration_ms: number;
  change_id?: string | null;
  tokens_used?: number;
}

// The standard bounded output every command returns (C1 spec).
export interface Envelope {
  ok: boolean;
  command: string;
  summary: string;
  result: unknown;
  needs_human: string | null;
  meta: EnvelopeMeta;
}

// Layered config schema (C9). Precedence: defaults < user < project < env.
export interface Config {
  providers: Record<string, Provider>;
  plugins: Array<{ name: string; version?: string }>;
  permissions: { allow: string[]; deny: string[]; auto_confirm_destructive: boolean };
  defaults: { provider?: string; output: "summary" | "full"; history_max: number };
}

export interface CommandContext {
  args: Record<string, unknown>;
  flags: Record<string, unknown>;
  config: Config;
  isTTY: boolean;
  // Plugin dirs whose manifest fragments are visible to dispatch (for lazy
  // plugin handler resolution). Populated by the CLI from the footprint.
  pluginDirs?: string[];
  // True when dispatch should append a history.jsonl row. Set by the real CLI
  // entry; in-process callers (tests) leave it false to avoid side effects.
  recordHistory?: boolean;
}

export interface CommandModule {
  run: (ctx: CommandContext) => Promise<Envelope> | Envelope;
}
