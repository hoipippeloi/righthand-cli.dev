import { webcrypto } from "node:crypto";
const ENCODE = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function encodeTime(ms) {
  const chars = [];
  let t = ms;
  for (let i = 0; i < 10; i++) {
    chars.push(ENCODE[t % 32]);
    t = Math.floor(t / 32);
  }
  return chars.reverse().join("");
}
function encodeRandom() {
  const bytes = webcrypto.getRandomValues(new Uint8Array(10));
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = value << 8 | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ENCODE[value >>> bits & 31];
    }
  }
  return out;
}
function ulid(timeMs = Date.now()) {
  return encodeTime(timeMs) + encodeRandom();
}
function actionId(timeMs) {
  return `act_${ulid(timeMs)}`;
}
function changeId(timeMs) {
  return `chg_${ulid(timeMs)}`;
}
export {
  actionId,
  changeId,
  ulid
};
