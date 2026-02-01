const stripPrefix = (raw: string) => raw.replace(/^(lark|feishu):/i, "");

export function normalizeLarkAllowEntry(entry: string): string {
  const trimmed = stripPrefix(String(entry || "").trim());
  return trimmed.toLowerCase();
}

export function looksLikeLarkTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(user|open_id|openid):/i.test(trimmed)) {
    return /^((user|open_id|openid):)\s*ou_[A-Za-z0-9]+/.test(trimmed);
  }
  if (/^(chat|group):/i.test(trimmed)) {
    return /^((chat|group):)\s*oc_[A-Za-z0-9]+/.test(trimmed);
  }
  return /^ou_[A-Za-z0-9]+/.test(trimmed) || /^oc_[A-Za-z0-9]+/.test(trimmed);
}

export function normalizeLarkMessagingTarget(input: string): string | null {
  const raw = stripPrefix(String(input || "").trim());
  if (!raw) {
    return null;
  }

  const lowered = raw.toLowerCase();
  if (/^(user|open_id|openid):/i.test(raw)) {
    const id = raw.slice(raw.indexOf(":") + 1).trim();
    if (!id) {
      return null;
    }
    return `user:${id}`;
  }
  if (/^(chat|group):/i.test(raw)) {
    const id = raw.slice(raw.indexOf(":") + 1).trim();
    if (!id) {
      return null;
    }
    return `chat:${id}`;
  }

  if (lowered.startsWith("ou_")) {
    return `user:${raw}`;
  }
  if (lowered.startsWith("oc_")) {
    return `chat:${raw}`;
  }

  // Fallback: leave untouched (caller may be replying in-context).
  return raw;
}
