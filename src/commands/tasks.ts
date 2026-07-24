// C8.4 — Task/issue tracking ops domain. `tasks list`: wraps `gh issue list`,
// compresses to { open, items }. Missing gh -> exit 5 (DEP_MISSING).
import { makeEnvelope } from "../envelope.ts";
import { CommandError } from "../errors.ts";
import { EXIT, type ToolDescriptor, type CommandContext, type Envelope } from "../contracts.ts";
import { runCli } from "../shell.ts";

const CAPS = ["exec:gh", "net:api.github.com"];
const GH_MISSING = "install the GitHub CLI (gh) and run `gh auth login` to list issues";

export const descriptor: ToolDescriptor = {
  name: "tasks",
  description: "Tasks/issues: list — wraps gh issue list, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list"] },
    },
    additionalProperties: false,
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: CAPS,
};

export const cli = {
  args: {
    action: { type: "positional", description: "list", required: false },
  },
};

interface GhIssue {
  number?: number;
  title?: string;
  state?: string;
}

export async function run(ctx: CommandContext): Promise<Envelope> {
  const action = (ctx.args.action as string | undefined) ?? "list";
  if (action !== "list") {
    return makeEnvelope({ command: "tasks", ok: false, summary: `unknown tasks action: ${action}` });
  }

  const res = runCli("gh", ["issue", "list", "--json", "number,title,state", "--limit", "20"]);
  if (res.missing) throw new CommandError(EXIT.DEP_MISSING, "gh (GitHub CLI) not found", GH_MISSING);

  let issues: GhIssue[] = [];
  try {
    issues = JSON.parse(res.stdout || "[]");
  } catch {
    issues = [];
  }
  const open = issues.filter((i) => (i.state ?? "").toUpperCase() === "OPEN").length;
  const items = issues.map((i) => ({ number: i.number, title: i.title, state: i.state }));
  return makeEnvelope({
    command: "tasks",
    summary: `${open} open / ${issues.length} total`,
    result: { open, items },
  });
}
