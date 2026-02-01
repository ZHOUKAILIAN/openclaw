import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import type { LarkConfig, ResolvedLarkAccount } from "./types.js";

type CoreConfig = {
  channels?: {
    lark?: LarkConfig;
  };
};

export function listLarkAccountIds(cfg: CoreConfig): string[] {
  const section = cfg.channels?.lark;
  const ids = new Set<string>();
  ids.add(DEFAULT_ACCOUNT_ID);
  for (const key of Object.keys(section?.accounts ?? {})) {
    const normalized = normalizeAccountId(key);
    if (normalized && normalized !== DEFAULT_ACCOUNT_ID) {
      ids.add(normalized);
    }
  }
  return Array.from(ids);
}

export function resolveDefaultLarkAccountId(_cfg: CoreConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveLarkAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedLarkAccount {
  const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;
  const section = params.cfg.channels?.lark;
  const base = section ?? {};
  const overrides = accountId === DEFAULT_ACCOUNT_ID ? undefined : base.accounts?.[accountId];

  const enabled = (overrides?.enabled ?? base.enabled) !== false;
  const name = overrides?.name ?? base.name;
  const appId = overrides?.appId ?? base.appId;
  const appSecret = overrides?.appSecret ?? base.appSecret;
  const verificationToken = overrides?.verificationToken ?? base.verificationToken;

  const webhookPath = overrides?.webhookPath ?? base.webhookPath;
  const dmPolicy = overrides?.dmPolicy ?? base.dmPolicy;
  const allowFrom = overrides?.allowFrom ?? base.allowFrom;
  const groupPolicy = overrides?.groupPolicy ?? base.groupPolicy;
  const groupAllowFrom = overrides?.groupAllowFrom ?? base.groupAllowFrom;

  const configured = Boolean(appId?.trim() && appSecret?.trim() && verificationToken?.trim());

  return {
    accountId,
    enabled,
    configured,
    name: name?.trim() || undefined,
    appId: appId?.trim() || undefined,
    appSecret: appSecret?.trim() || undefined,
    verificationToken: verificationToken?.trim() || undefined,
    config: {
      webhookPath: webhookPath?.trim() || undefined,
      dmPolicy,
      allowFrom: allowFrom?.map((v) => String(v)) ?? undefined,
      groupPolicy,
      groupAllowFrom: groupAllowFrom?.map((v) => String(v)) ?? undefined,
      tools: overrides?.tools ?? base.tools,
      historyLimit: overrides?.historyLimit ?? base.historyLimit,
      dmHistoryLimit: overrides?.dmHistoryLimit ?? base.dmHistoryLimit,
      textChunkLimit: overrides?.textChunkLimit ?? base.textChunkLimit,
      chunkMode: overrides?.chunkMode ?? base.chunkMode,
      blockStreaming: overrides?.blockStreaming ?? base.blockStreaming,
      blockStreamingCoalesce: overrides?.blockStreamingCoalesce ?? base.blockStreamingCoalesce,
      markdown: overrides?.markdown ?? base.markdown,
    },
  };
}
