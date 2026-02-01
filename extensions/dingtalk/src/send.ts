import type { ReplyPayload } from "openclaw/plugin-sdk";

import type { ResolvedDingTalkAccount } from "./types.js";
import { dingTalkRobotSendText } from "./api.js";

export async function sendMessageDingTalk(params: {
  account: ResolvedDingTalkAccount;
  text: string;
}): Promise<{ messageId?: string }> {
  if (!params.text.trim()) {
    return {};
  }
  return await dingTalkRobotSendText({ account: params.account, text: params.text });
}

export async function sendPayloadDingTalk(params: {
  account: ResolvedDingTalkAccount;
  payload: ReplyPayload;
}): Promise<{ messageId?: string }> {
  const text =
    typeof (params.payload as any)?.text === "string" ? (params.payload as any).text : "";
  const mediaUrls = Array.isArray((params.payload as any)?.mediaUrls)
    ? ((params.payload as any).mediaUrls as string[])
    : [];
  const mediaUrl =
    typeof (params.payload as any)?.mediaUrl === "string" ? (params.payload as any).mediaUrl : null;
  const attachments = mediaUrls.length ? mediaUrls : mediaUrl ? [mediaUrl] : [];

  const combined = attachments.length
    ? text.trim()
      ? `${text.trim()}\n\n${attachments.map((url) => `Attachment: ${url}`).join("\n")}`
      : attachments.map((url) => `Attachment: ${url}`).join("\n")
    : text;

  return await sendMessageDingTalk({ account: params.account, text: combined });
}
