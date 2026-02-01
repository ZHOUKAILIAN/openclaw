import type { ChannelPlugin, OpenClawConfig, ChannelSetupInput } from "openclaw/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "openclaw/plugin-sdk";

import {
  listDingTalkAccountIds,
  resolveDefaultDingTalkAccountId,
  resolveDingTalkAccount,
  type ResolvedDingTalkAccount,
} from "./accounts.js";
import { DingTalkConfigSchema } from "./config-schema.js";
import {
  looksLikeDingTalkTargetId,
  normalizeDingTalkAllowEntry,
  normalizeDingTalkMessagingTarget,
} from "./normalize.js";
import { monitorDingTalkProvider } from "./monitor.js";
import { probeDingTalk } from "./probe.js";
import { getDingTalkRuntime } from "./runtime.js";
import { sendMessageDingTalk, sendPayloadDingTalk } from "./send.js";
import type { DingTalkConfig } from "./types.js";

const meta = {
  id: "dingtalk",
  label: "DingTalk",
  selectionLabel: "DingTalk (Robot Webhook)",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb: "DingTalk robot via webhook (experimental).",
  aliases: ["dingding", "dd"],
  order: 71,
  quickstartAllowFrom: true,
} as const;

type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & { dingtalk?: DingTalkConfig };
};

type DingTalkSetupInput = ChannelSetupInput & {
  accessToken?: string;
  verificationToken?: string;
  webhookPath?: string;
};

export const dingtalkPlugin: ChannelPlugin<ResolvedDingTalkAccount> = {
  id: "dingtalk",
  meta,
  pairing: {
    idLabel: "dingtalkSenderId",
    normalizeAllowEntry: (entry) => normalizeDingTalkAllowEntry(entry),
  },
  capabilities: {
    chatTypes: ["group"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: buildChannelConfigSchema(DingTalkConfigSchema),
  config: {
    listAccountIds: (cfg) => listDingTalkAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultDingTalkAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "dingtalk",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "dingtalk",
        accountId,
        clearBaseFields: ["accessToken", "verificationToken", "webhookPath", "name"],
      }),
    isConfigured: (account) => account.configured,
    unconfiguredReason: () => "missing accessToken",
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      webhookPath: account.config.webhookPath ?? "/dingtalk/webhook",
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(dingtalk|dingding|dd):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.dingtalk?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.dingtalk.accounts.${resolvedAccountId}.`
        : "channels.dingtalk.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("dingtalk"),
        normalizeEntry: (raw) => normalizeDingTalkAllowEntry(raw),
      };
    },
  },
  groups: {
    resolveToolPolicy: ({ cfg, accountId }) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      return (account.config.tools ?? undefined) as any;
    },
  },
  messaging: {
    normalizeTarget: normalizeDingTalkMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeDingTalkTargetId,
      hint: "<conversationId>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({ cfg, channelKey: "dingtalk", accountId, name }),
    validateInput: ({ input }) => {
      const setupInput = input as DingTalkSetupInput;
      if (!setupInput.accessToken) {
        return "DingTalk requires --access-token.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const setupInput = input as DingTalkSetupInput;
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "dingtalk",
        accountId,
        name: setupInput.name,
      });

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            dingtalk: {
              ...namedConfig.channels?.dingtalk,
              enabled: true,
              accessToken: setupInput.accessToken,
              verificationToken: setupInput.verificationToken,
              webhookPath: setupInput.webhookPath,
            },
          },
        } as OpenClawConfig;
      }

      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          dingtalk: {
            ...namedConfig.channels?.dingtalk,
            enabled: true,
            accounts: {
              ...namedConfig.channels?.dingtalk?.accounts,
              [accountId]: {
                ...namedConfig.channels?.dingtalk?.accounts?.[accountId],
                enabled: true,
                accessToken: setupInput.accessToken,
                verificationToken: setupInput.verificationToken,
                webhookPath: setupInput.webhookPath,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getDingTalkRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    sendPayload: async ({ cfg, payload, accountId }) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await sendPayloadDingTalk({ account, payload });
      return {
        channel: "dingtalk",
        messageId: result.messageId ?? `dingtalk:${Date.now()}`,
      };
    },
    sendText: async ({ cfg, text, accountId }) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await sendMessageDingTalk({ account, text });
      return {
        channel: "dingtalk",
        messageId: result.messageId ?? `dingtalk:${Date.now()}`,
      };
    },
    sendMedia: async ({ cfg, text, mediaUrl, accountId }) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      const messageWithMedia = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      const result = await sendMessageDingTalk({ account, text: messageWithMedia });
      return {
        channel: "dingtalk",
        messageId: result.messageId ?? `dingtalk:${Date.now()}`,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    probeAccount: async ({ account }) => {
      await probeDingTalk(account);
      return { ok: true };
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      webhookPath: account.config.webhookPath ?? "/dingtalk/webhook",
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      probe: probe ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.configured) {
        throw new Error(`DingTalk not configured for account "${account.accountId}"`);
      }

      ctx.log?.info(`[${account.accountId}] starting DingTalk webhook handler`);

      const { stop } = await monitorDingTalkProvider({
        accountId: ctx.accountId,
        cfg: ctx.cfg as CoreConfig,
        account,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });

      return { stop };
    },
  },
};
