import { mergeAllowlist } from "openclaw/plugin-sdk";

import { normalizeLarkAllowEntry } from "./normalize.js";

export function normalizeLarkAllowlist(raw?: string[] | null): string[] {
  return (raw ?? []).map((entry) => normalizeLarkAllowEntry(String(entry))).filter(Boolean);
}

export function resolveLarkAllowlistMatch(params: {
  allowFrom: string[];
  senderId: string;
  senderName?: string | null;
}): { allowed: boolean; matched?: string } {
  const senderId = normalizeLarkAllowEntry(params.senderId);
  const senderName = params.senderName ? params.senderName.trim().toLowerCase() : "";

  for (const entry of normalizeLarkAllowlist(params.allowFrom)) {
    if (entry === "*") {
      return { allowed: true, matched: "*" };
    }
    if (entry && entry === senderId) {
      return { allowed: true, matched: entry };
    }
    if (senderName && entry && entry === senderName) {
      return { allowed: true, matched: entry };
    }
  }

  return { allowed: false };
}

export function resolveLarkGroupAllow(params: {
  groupPolicy: "disabled" | "open" | "allowlist";
  outerAllowFrom: string[];
  innerAllowFrom?: string[] | null;
  senderId: string;
  senderName?: string | null;
}): { allowed: boolean } {
  if (params.groupPolicy === "disabled") {
    return { allowed: false };
  }
  if (params.groupPolicy === "open") {
    return { allowed: true };
  }

  const merged = mergeAllowlist({
    outerAllowFrom: params.outerAllowFrom,
    innerAllowFrom: params.innerAllowFrom ?? [],
  });
  return {
    allowed: resolveLarkAllowlistMatch({
      allowFrom: merged,
      senderId: params.senderId,
      senderName: params.senderName,
    }).allowed,
  };
}
