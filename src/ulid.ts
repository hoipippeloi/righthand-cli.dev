// Minimal ULID — time-sortable, 26-char Crockford Base32. No dependency.
// Used for action ids (act_<ulid>) and change ids (chg_<ulid>) so both history
// (C9) and the change log (C7) sort chronologically by string.
import { webcrypto } from "node:crypto";

const ENCODE = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32 (no I/L/O/U)

// 48-bit millisecond timestamp -> 10 base32 chars (MSB first).
function encodeTime(ms: number): string {
  const chars: string[] = [];
  let t = ms;
  for (let i = 0; i < 10; i++) {
    chars.push(ENCODE[t % 32]);
    t = Math.floor(t / 32);
  }
  return chars.reverse().join("");
}

// 80 random bits -> 16 base32 chars (exactly 80/5 = 16, no remainder).
function encodeRandom(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(10));
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ENCODE[(value >>> bits) & 31];
    }
  }
  return out;
}

export function ulid(timeMs: number = Date.now()): string {
  return encodeTime(timeMs) + encodeRandom();
}

export function actionId(timeMs?: number): string {
  return `act_${ulid(timeMs)}`;
}

export function changeId(timeMs?: number): string {
  return `chg_${ulid(timeMs)}`;
}
