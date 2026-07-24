import { createInterface } from "node:readline/promises";
async function confirm(ctx, message) {
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
export {
  confirm
};
