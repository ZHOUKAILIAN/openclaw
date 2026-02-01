import type { ResolvedDingTalkAccount } from "./types.js";

export async function dingTalkRobotSendText(params: {
  account: ResolvedDingTalkAccount;
  text: string;
}): Promise<{ messageId?: string }> {
  const token = params.account.accessToken;
  if (!token) {
    throw new Error("DingTalk accessToken not configured");
  }

  const url = `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msgtype: "text", text: { content: params.text } }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DingTalk send failed: ${res.status} ${res.statusText}: ${text}`);
  }

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  // DingTalk usually returns { errcode: 0, errmsg: "ok" }
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof parsed.errcode === "number" &&
    parsed.errcode !== 0
  ) {
    throw new Error(`DingTalk send error: ${parsed.errcode} ${parsed.errmsg ?? ""}`);
  }

  return {
    messageId:
      parsed && typeof parsed === "object" && typeof parsed.messageId === "string"
        ? parsed.messageId
        : undefined,
  };
}
