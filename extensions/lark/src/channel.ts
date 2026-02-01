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
  listLarkAccountIds,
  resolveDefaultLarkAccountId,
  resolveLarkAccount,
  type ResolvedLarkAccount,
} from "./accounts.js";
import { LarkConfigSchema } from "./config-schema.js";
import {
  looksLikeLarkTargetId,
  normalizeLarkAllowEntry,
  normalizeLarkMessagingTarget,
} from "./normalize.js";
import { monitorLarkProvider } from "./monitor.js";
import { probeLark } from "./probe.js";
import { getLarkRuntime } from "./runtime.js";
import { sendMessageLark, sendPayloadLark } from "./send.js";
import type { LarkConfig } from "./types.js";

const meta = {
  id: "lark",
  label: "Lark",
  selectionLabel: "Lark (Feishu Bot)",
  docsPath: "/channels/lark",
  docsLabel: "lark",
  blurb: "Lark/Feishu bot via Open Platform event subscription.",
  aliases: ["feishu"],
  order: 70,
  quickstartAllowFrom: true,
} as const;

type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & { lark?: LarkConfig };
};

type LarkSetupInput = ChannelSetupInput & {
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  webhookPath?: string;
};

export const larkPlugin: ChannelPlugin<ResolvedLarkAccount> = {
  id: "lark",
  meta,
  pairing: {
    idLabel: "larkOpenId",
    normalizeAllowEntry: (entry) => normalizeLarkAllowEntry(entry),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveLarkAccount({ cfg: cfg as CoreConfig, accountId: DEFAULT_ACCOUNT_ID });
      if (!account.configured) {
        return;
      }
      await sendMessageLark({
        account,
        to: `user:${id}`,
        text: "OpenClaw: your access has been approved.",
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.lark"] },
  configSchema: buildChannelConfigSchema(LarkConfigSchema),
  config: {
    listAccountIds: (cfg) => listLarkAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) => resolveLarkAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultLarkAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "lark",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "lark",
        accountId,
        clearBaseFields: ["appId", "appSecret", "verificationToken", "webhookPath", "name"],
      }),
    isConfigured: (account) => account.configured,
    unconfiguredReason: () => "missing appId/appSecret/verificationToken",
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      webhookPath: account.config.webhookPath ?? "/lark/webhook",
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveLarkAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(lark|feishu):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.lark?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.lark.accounts.${resolvedAccountId}.`
        : "channels.lark.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("lark"),
        normalizeEntry: (raw) => normalizeLarkAllowEntry(raw),
      };
    },
  },
  groups: {
    resolveToolPolicy: ({ cfg, accountId }) => {
      const account = resolveLarkAccount({ cfg: cfg as CoreConfig, accountId });
      return (account.config.tools ?? undefined) as any;
    },
  },
  messaging: {
    normalizeTarget: normalizeLarkMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeLarkTargetId,
      hint: "<user:ou_xxx|chat:oc_xxx>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({ cfg, channelKey: "lark", accountId, name }),
    validateInput: ({ input }) => {
      const setupInput = input as LarkSetupInput;
      if (!setupInput.appId) {
        return "Lark requires --app-id.";
      }
      if (!setupInput.appSecret) {
        return "Lark requires --app-secret.";
      }
      if (!setupInput.verificationToken) {
        return "Lark requires --verification-token.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const setupInput = input as LarkSetupInput;
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "lark",
        accountId,
        name: setupInput.name,
      });

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            lark: {
              ...namedConfig.channels?.lark,
              enabled: true,
              appId: setupInput.appId,
              appSecret: setupInput.appSecret,
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
          lark: {
            ...namedConfig.channels?.lark,
            enabled: true,
            accounts: {
              ...namedConfig.channels?.lark?.accounts,
              [accountId]: {
                ...namedConfig.channels?.lark?.accounts?.[accountId],
                enabled: true,
                appId: setupInput.appId,
                appSecret: setupInput.appSecret,
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
    chunker: (text, limit) => getLarkRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    sendPayload: async ({ cfg, to, payload, accountId }) => {
      const account = resolveLarkAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await sendPayloadLark({ account, to, payload });
      return {
        channel: "lark",
        messageId: result.messageId ?? `lark:${Date.now()}`,
        meta: { to },
      };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveLarkAccount({ cfg: cfg as CoreConfig, accountId });
      const result = await sendMessageLark({ account, to, text });
      return {
        channel: "lark",
        messageId: result.messageId ?? `lark:${Date.now()}`,
        meta: { to },
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      const account = resolveLarkAccount({ cfg: cfg as CoreConfig, accountId });
      const messageWithMedia = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      const result = await sendMessageLark({ account, to, text: messageWithMedia });
      return {
        channel: "lark",
        messageId: result.messageId ?? `lark:${Date.now()}`,
        meta: { to },
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
    probeAccount: async ({ account, timeoutMs: _timeoutMs, cfg: _cfg }) => {
      await probeLark(account);
      return { ok: true };
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      webhookPath: account.config.webhookPath ?? "/lark/webhook",
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
        throw new Error(`Lark not configured for account "${account.accountId}"`);
      }

      ctx.log?.info(`[${account.accountId}] starting Lark webhook handler`);

      const { stop } = await monitorLarkProvider({
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
