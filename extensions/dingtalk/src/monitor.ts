import type { IncomingMessage, ServerResponse } from "node:http";

import {
  normalizePluginHttpPath,
  registerPluginHttpRoute,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";

import { resolveDingTalkAccount, type ResolvedDingTalkAccount } from "./accounts.js";
import { handleDingTalkInbound } from "./inbound.js";
import { getDingTalkRuntime } from "./runtime.js";
import type { DingTalkConfig, DingTalkInboundMessage } from "./types.js";

type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & { dingtalk?: DingTalkConfig };
};

type DingTalkWebhookBody = {
  // Outgoing webhook payloads vary; parse defensively.
  msgtype?: string;
  text?: { content?: string };
  senderId?: string;
  senderStaffId?: string;
  senderNick?: string;
  conversationId?: string;
  msgId?: string;
  createAt?: number;
  token?: string;
};

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toInboundMessage(body: DingTalkWebhookBody): DingTalkInboundMessage | null {
  const msgtype = (body.msgtype ?? "").trim();
  if (msgtype !== "text") {
    return null;
  }

  const text = body.text?.content?.trim() ?? "";
  if (!text) {
    return null;
  }

  const conversationId = String(body.conversationId ?? "").trim();
  if (!conversationId) {
    return null;
  }

  const senderId = String(body.senderStaffId ?? body.senderId ?? "").trim();
  if (!senderId) {
    return null;
  }

  const messageId = String(body.msgId ?? `${conversationId}:${Date.now()}`).trim();
  const timestamp =
    typeof body.createAt === "number" && Number.isFinite(body.createAt)
      ? body.createAt
      : Date.now();

  return {
    messageId,
    conversationId,
    senderId,
    senderName: body.senderNick?.trim() || undefined,
    text,
    timestamp,
  };
}

export async function monitorDingTalkProvider(params: {
  accountId: string;
  cfg: CoreConfig;
  account: ResolvedDingTalkAccount;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<{ stop: () => void }> {
  const core = getDingTalkRuntime();
  const resolvedAccountId = params.accountId;

  const resolveAccountNow = () =>
    resolveDingTalkAccount({ cfg: params.cfg as any, accountId: resolvedAccountId });

  const basePath = resolveAccountNow().config.webhookPath;
  const webhookPath = normalizePluginHttpPath(basePath, "/dingtalk/webhook") ?? "/dingtalk/webhook";

  const unregister = registerPluginHttpRoute({
    path: webhookPath,
    pluginId: "dingtalk",
    accountId: resolvedAccountId,
    log: (msg) => params.runtime.log?.(msg),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain");
        res.end("ok");
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      const rawBody = await readRequestBody(req);
      const parsed = safeJsonParse<DingTalkWebhookBody>(rawBody);

      const account = resolveAccountNow();
      const expectedToken = account.verificationToken;
      const gotToken = parsed?.token ? String(parsed.token).trim() : "";
      if (expectedToken && (!gotToken || gotToken !== expectedToken)) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      // Ack quickly.
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));

      if (!parsed) {
        return;
      }

      const inbound = toInboundMessage(parsed);
      if (!inbound) {
        return;
      }

      core.channel.activity.record({
        channel: "dingtalk",
        accountId: resolvedAccountId,
        direction: "inbound",
        at: inbound.timestamp,
      });

      await handleDingTalkInbound({
        message: inbound,
        account,
        config: params.cfg,
        runtime: params.runtime,
        statusSink: params.statusSink,
      }).catch((err) => {
        params.runtime.error?.(`dingtalk: inbound handler failed: ${String(err)}`);
      });
    },
  });

  params.runtime.log?.(`dingtalk: registered webhook handler at ${webhookPath}`);

  const stop = () => {
    unregister();
  };

  params.abortSignal.addEventListener("abort", stop, { once: true });

  return { stop };
}
