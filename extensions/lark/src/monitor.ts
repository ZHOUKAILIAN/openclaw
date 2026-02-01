import type { IncomingMessage, ServerResponse } from "node:http";

import {
  normalizePluginHttpPath,
  registerPluginHttpRoute,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";

import { resolveLarkAccount, type ResolvedLarkAccount } from "./accounts.js";
import { handleLarkInbound } from "./inbound.js";
import { getLarkRuntime } from "./runtime.js";
import type { LarkConfig, LarkInboundMessage } from "./types.js";

type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & { lark?: LarkConfig };
};

type LarkUrlVerificationBody = {
  type?: string;
  challenge?: string;
  token?: string;
  header?: { token?: string };
};

type LarkEventEnvelope = {
  schema?: string;
  token?: string;
  type?: string;
  challenge?: string;
  header?: {
    token?: string;
    event_type?: string;
  };
  event?: {
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      create_time?: string;
    };
    sender?: {
      sender_id?: {
        open_id?: string;
      };
      sender_type?: string;
    };
  };
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

function extractToken(body: LarkEventEnvelope | LarkUrlVerificationBody | null): string | null {
  if (!body) {
    return null;
  }
  const token =
    (typeof (body as any).token === "string" ? (body as any).token : null) ??
    (typeof (body as any).header?.token === "string" ? (body as any).header.token : null);
  return token?.trim() || null;
}

function parseInboundMessage(body: LarkEventEnvelope): LarkInboundMessage | null {
  const eventType = body.header?.event_type;
  if (eventType !== "im.message.receive_v1") {
    return null;
  }

  const msg = body.event?.message;
  const sender = body.event?.sender;

  const messageId = msg?.message_id?.trim();
  const chatId = msg?.chat_id?.trim();
  const chatType = msg?.chat_type?.trim();
  const senderOpenId = sender?.sender_id?.open_id?.trim();

  if (!messageId || !chatId || !chatType || !senderOpenId) {
    return null;
  }

  if (msg?.message_type !== "text") {
    return null;
  }

  const contentRaw = msg?.content;
  const content = contentRaw ? safeJsonParse<{ text?: string }>(contentRaw) : null;
  const text = content?.text?.trim() ?? "";

  const timestamp = msg?.create_time ? Number(msg.create_time) : Date.now();

  return {
    messageId,
    chatId,
    chatType,
    senderOpenId,
    senderName: undefined,
    text,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

export async function monitorLarkProvider(params: {
  accountId: string;
  cfg: CoreConfig;
  account: ResolvedLarkAccount;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<{ stop: () => void }> {
  const core = getLarkRuntime();
  const resolvedAccountId = params.accountId;

  // Keep account resolution fresh in case config reloads.
  const resolveAccountNow = () =>
    resolveLarkAccount({ cfg: params.cfg as any, accountId: resolvedAccountId });

  const basePath = resolveAccountNow().config.webhookPath;
  const webhookPath = normalizePluginHttpPath(basePath, "/lark/webhook") ?? "/lark/webhook";

  const unregister = registerPluginHttpRoute({
    path: webhookPath,
    pluginId: "lark",
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
      const parsed = safeJsonParse<LarkEventEnvelope>(rawBody);

      const account = resolveAccountNow();
      if (!account.verificationToken) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Lark verificationToken not configured" }));
        return;
      }

      const token = extractToken(parsed);
      if (!token || token !== account.verificationToken) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      // URL verification handshake
      if ((parsed?.type ?? "") === "url_verification" && typeof parsed?.challenge === "string") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ challenge: parsed.challenge }));
        return;
      }

      // Acknowledge quickly.
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));

      if (!parsed) {
        return;
      }

      const inbound = parseInboundMessage(parsed);
      if (!inbound) {
        return;
      }

      core.channel.activity.record({
        channel: "lark",
        accountId: resolvedAccountId,
        direction: "inbound",
        at: inbound.timestamp,
      });

      await handleLarkInbound({
        message: inbound,
        account,
        config: params.cfg,
        runtime: params.runtime,
        statusSink: params.statusSink,
      }).catch((err) => {
        params.runtime.error?.(`lark: inbound handler failed: ${String(err)}`);
      });
    },
  });

  params.runtime.log?.(`lark: registered webhook handler at ${webhookPath}`);

  const stop = () => {
    unregister();
  };

  params.abortSignal.addEventListener("abort", stop, { once: true });

  return { stop };
}
