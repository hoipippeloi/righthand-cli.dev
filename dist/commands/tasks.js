import { makeEnvelope } from "../envelope.js";
import { CommandError } from "../errors.js";
import { EXIT } from "../contracts.js";
import { runCli } from "../shell.js";
const CAPS = ["exec:gh", "net:api.github.com"];
const GH_MISSING = "install the GitHub CLI (gh) and run `gh auth login` to list issues";
const descriptor = {
  name: "tasks",
  description: "Tasks/issues: list \u2014 wraps gh issue list, compresses output",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list"] }
    },
    additionalProperties: false
  },
  plugin: "@righthand/core",
  costTier: "free",
  capabilities: CAPS
};
const cli = {
  args: {
    action: { type: "positional", description: "list", required: false }
  }
};
async function run(ctx) {
  const action = ctx.args.action ?? "list";
  if (action !== "list") {
    return makeEnvelope({ command: "tasks", ok: false, summary: `unknown tasks action: ${action}` });
  }
  const res = runCli("gh", ["issue", "list", "--json", "number,title,state", "--limit", "20"]);
  if (res.missing) throw new CommandError(EXIT.DEP_MISSING, "gh (GitHub CLI) not found", GH_MISSING);
  let issues = [];
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
    result: { open, items }
  });
}
export {
  cli,
  descriptor,
  run
};
