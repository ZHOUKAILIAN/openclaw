import { dingTalkRobotSendText } from "./api.js";
import type { ResolvedDingTalkAccount } from "./types.js";

export async function probeDingTalk(account: ResolvedDingTalkAccount): Promise<{ ok: boolean }> {
  // A cheap probe is hard without a destination; just ensure we have accessToken.
  if (!account.accessToken?.trim()) {
    throw new Error("DingTalk accessToken not configured");
  }
  // No-op probe; avoid spamming real rooms.
  void dingTalkRobotSendText;
  return { ok: true };
}
