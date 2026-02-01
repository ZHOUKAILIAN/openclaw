import {
  logInboundDrop,
  resolveControlCommandGate,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";

import type { DingTalkConfig, DingTalkInboundMessage, ResolvedDingTalkAccount } from "./types.js";
import { getDingTalkRuntime } from "./runtime.js";
import {
  normalizeDingTalkAllowlist,
  resolveDingTalkAllowlistMatch,
  resolveDingTalkGroupAllow,
} from "./policy.js";
import { sendMessageDingTalk, sendPayloadDingTalk } from "./send.js";

const CHANNEL_ID = "dingtalk" as const;

type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & { dingtalk?: DingTalkConfig };
};

export async function handleDingTalkInbound(params: {
  message: DingTalkInboundMessage;
  account: ResolvedDingTalkAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, account, config, runtime, statusSink } = params;
  const core = getDingTalkRuntime();

  const rawBody = message.text?.trim() ?? "";
  if (!rawBody) {
    return;
  }

  // DingTalk robot webhooks are typically group conversations.
  const isGroup = true;
  const senderId = message.senderId;
  const senderName = message.senderName;
  const conversationId = message.conversationId;

  statusSink?.({ lastInboundAt: message.timestamp });

  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = (account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist") as
    | "disabled"
    | "open"
    | "allowlist";

  const configAllowFrom = normalizeDingTalkAllowlist(account.config.allowFrom);
  const configGroupAllowFrom = normalizeDingTalkAllowlist(account.config.groupAllowFrom);
  const storeAllowFrom = await core.channel.pairing.readAllowFromStore(CHANNEL_ID).catch(() => []);
  const storeAllowList = normalizeDingTalkAllowlist(storeAllowFrom);

  const baseGroupAllowFrom =
    configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom;

  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowList].filter(Boolean);
  const effectiveGroupAllowFrom = [...baseGroupAllowFrom, ...storeAllowList].filter(Boolean);

  const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
    cfg: config as OpenClawConfig,
    surface: CHANNEL_ID,
  });
  const useAccessGroups = config.commands?.useAccessGroups !== false;

  const senderAllowedForCommands = resolveDingTalkAllowlistMatch({
    allowFrom: isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom,
    senderId,
    senderName,
  }).allowed;
  const hasControlCommand = core.channel.text.hasControlCommand(rawBody, config as OpenClawConfig);
  const commandGate = resolveControlCommandGate({
    useAccessGroups,
    authorizers: [
      {
        configured: (isGroup ? effectiveGroupAllowFrom : effectiveAllowFrom).length > 0,
        allowed: senderAllowedForCommands,
      },
    ],
    allowTextCommands,
    hasControlCommand,
  });
  const commandAuthorized = commandGate.commandAuthorized;

  // Group allowlist/policy
  const groupAllow = resolveDingTalkGroupAllow({
    groupPolicy,
    outerAllowFrom: effectiveGroupAllowFrom,
    senderId,
    senderName,
  });
  if (!groupAllow.allowed) {
    runtime.log?.(`dingtalk: drop group sender ${senderId} (policy=${groupPolicy})`);
    return;
  }

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: (message) => runtime.log?.(message),
      channel: CHANNEL_ID,
      reason: "control command (unauthorized)",
      target: senderId,
    });
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: "group",
      id: conversationId,
    },
  });

  const fromLabel = senderName || `user:${senderId}`;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "DingTalk",
    from: fromLabel,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `dingtalk:${senderId}`,
    To: `dingtalk:conversation:${conversationId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "group",
    ConversationLabel: `conversation:${conversationId}`,
    SenderName: senderName || undefined,
    SenderId: senderId,
    GroupSubject: `conversation:${conversationId}`,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    WasMentioned: undefined,
    MessageSid: message.messageId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `dingtalk:conversation:${conversationId}`,
    CommandAuthorized: commandAuthorized,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`dingtalk: failed updating session meta: ${String(err)}`);
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      deliver: async (payload) => {
        // DingTalk custom robots send to their configured group via accessToken.
        const delivered = await sendPayloadDingTalk({ account, payload: payload as any });
        if (delivered.messageId) {
          statusSink?.({ lastOutboundAt: Date.now() });
        }
      },
      onError: (err, info) => {
        runtime.error?.(`dingtalk ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      disableBlockStreaming:
        typeof account.config.blockStreaming === "boolean"
          ? !account.config.blockStreaming
          : undefined,
    },
  });

  // If you want a synchronous response in the webhook call, you can adapt this plugin
  // to return the first text reply directly. For now, we always respond async.
}
