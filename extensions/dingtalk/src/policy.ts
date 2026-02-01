import { mergeAllowlist } from "openclaw/plugin-sdk";

import { normalizeDingTalkAllowEntry } from "./normalize.js";

export function normalizeDingTalkAllowlist(raw?: string[] | null): string[] {
  return (raw ?? []).map((entry) => normalizeDingTalkAllowEntry(String(entry))).filter(Boolean);
}

export function resolveDingTalkAllowlistMatch(params: {
  allowFrom: string[];
  senderId: string;
  senderName?: string | null;
}): { allowed: boolean; matched?: string } {
  const senderId = normalizeDingTalkAllowEntry(params.senderId);
  const senderName = params.senderName ? params.senderName.trim().toLowerCase() : "";

  for (const entry of normalizeDingTalkAllowlist(params.allowFrom)) {
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

export function resolveDingTalkGroupAllow(params: {
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
    allowed: resolveDingTalkAllowlistMatch({
      allowFrom: merged,
      senderId: params.senderId,
      senderName: params.senderName,
    }).allowed,
  };
}
