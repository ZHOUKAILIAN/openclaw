import type { ReplyPayload } from "openclaw/plugin-sdk";

import type { ResolvedLarkAccount } from "./types.js";
import { larkFetchJson } from "./api.js";
import { normalizeLarkMessagingTarget } from "./normalize.js";

function parseTarget(raw: string): { receiveIdType: "open_id" | "chat_id"; receiveId: string } {
  const normalized = normalizeLarkMessagingTarget(raw) ?? raw.trim();
  if (!normalized) {
    throw new Error("Missing Lark target");
  }

  if (/^user:/i.test(normalized)) {
    return { receiveIdType: "open_id", receiveId: normalized.slice("user:".length).trim() };
  }
  if (/^chat:/i.test(normalized)) {
    return { receiveIdType: "chat_id", receiveId: normalized.slice("chat:".length).trim() };
  }

  // Heuristic fallback
  if (/^ou_/i.test(normalized)) {
    return { receiveIdType: "open_id", receiveId: normalized };
  }
  if (/^oc_/i.test(normalized)) {
    return { receiveIdType: "chat_id", receiveId: normalized };
  }

  // Last resort: treat as chat_id.
  return { receiveIdType: "chat_id", receiveId: normalized };
}

export async function sendMessageLark(params: {
  account: ResolvedLarkAccount;
  to: string;
  text: string;
}): Promise<{ messageId?: string }> {
  const { receiveIdType, receiveId } = parseTarget(params.to);

  const resp = (await larkFetchJson({
    account: params.account,
    path: `/im/v1/messages?receive_id_type=${receiveIdType}`,
    method: "POST",
    body: {
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: params.text }),
    },
  })) as any;

  const messageId = resp?.data?.message_id;
  return { messageId: typeof messageId === "string" ? messageId : undefined };
}

export async function sendPayloadLark(params: {
  account: ResolvedLarkAccount;
  to: string;
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

  if (!combined.trim()) {
    return {};
  }

  return await sendMessageLark({ account: params.account, to: params.to, text: combined });
}
