import type { ExitCode } from "./contracts.ts";

// Structured command error — caught by dispatch and mapped to an exit code.
// (No parameter properties: Node's strip-only TS mode doesn't support them.)
export class CommandError extends Error {
  exitCode: ExitCode;
  needsHuman?: string;
  constructor(exitCode: ExitCode, message: string, needsHuman?: string) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
    this.needsHuman = needsHuman;
  }
}
