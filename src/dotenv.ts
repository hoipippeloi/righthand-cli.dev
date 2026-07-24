// Minimal .env loader. Populates process.env from a .env file for keys NOT
// already set (real shell env always wins). Values are NEVER logged. Supports
// KEY=VALUE, `export KEY=VALUE`, single/double quotes, # comments, blank lines.
import { existsSync, readFileSync } from "node:fs";

export function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let m = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Real environment wins: only set keys that aren't already defined.
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
