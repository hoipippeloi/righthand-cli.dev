function matches(cap, pattern) {
  if (pattern.endsWith("*")) {
    return cap.startsWith(pattern.slice(0, -1));
  }
  return cap === pattern;
}
function checkCapabilities(declared, permissions) {
  if (!declared || declared.length === 0) {
    return { ok: true, denied: [] };
  }
  const denied = [];
  for (const cap of declared) {
    if (permissions.deny.some((p) => matches(cap, p))) {
      denied.push(cap);
    } else if (!permissions.allow.some((p) => matches(cap, p))) {
      denied.push(cap);
    }
  }
  return { ok: denied.length === 0, denied };
}
function requiresApproval(descriptor) {
  return descriptor.destructive === true || descriptor.costTier === "expensive";
}
export {
  checkCapabilities,
  matches,
  requiresApproval
};
