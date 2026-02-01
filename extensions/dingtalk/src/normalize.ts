const stripPrefix = (raw: string) => raw.replace(/^(dingtalk|dingding|dd):/i, "");

export function normalizeDingTalkAllowEntry(entry: string): string {
  const trimmed = stripPrefix(String(entry || "").trim());
  return trimmed.toLowerCase();
}

export function looksLikeDingTalkTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  // DingTalk conversation ids are typically opaque strings.
  return /^(conversation:)?[A-Za-z0-9_-]{6,}$/.test(trimmed);
}

export function normalizeDingTalkMessagingTarget(input: string): string | null {
  const raw = stripPrefix(String(input || "").trim());
  if (!raw) {
    return null;
  }
  if (/^conversation:/i.test(raw)) {
    const id = raw.slice(raw.indexOf(":") + 1).trim();
    return id ? `conversation:${id}` : null;
  }
  return `conversation:${raw}`;
}
