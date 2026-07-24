// Shared confirm gate for destructive commands (reset, rollback).
// - --yes → proceed (agent mode; logs via history)
// - interactive TTY → prompt y/N
// - non-TTY without --yes → refuse (caller returns a needs_human envelope)
import { createInterface } from "node:readline/promises";
import type { CommandContext } from "./contracts.ts";

export async function confirm(ctx: CommandContext, message: string): Promise<boolean> {
  if (ctx.flags.yes) return true;
  if (!ctx.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const ans = (await rl.question(message + " [y/N] ")).trim().toLowerCase();
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}
