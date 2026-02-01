import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import type { DingTalkConfig, ResolvedDingTalkAccount } from "./types.js";

type CoreConfig = {
  channels?: {
    dingtalk?: DingTalkConfig;
  };
};

export function listDingTalkAccountIds(cfg: CoreConfig): string[] {
  const section = cfg.channels?.dingtalk;
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

export function resolveDefaultDingTalkAccountId(_cfg: CoreConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveDingTalkAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedDingTalkAccount {
  const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;
  const section = params.cfg.channels?.dingtalk;
  const base = section ?? {};
  const overrides = accountId === DEFAULT_ACCOUNT_ID ? undefined : base.accounts?.[accountId];

  const enabled = (overrides?.enabled ?? base.enabled) !== false;
  const name = overrides?.name ?? base.name;

  const accessToken = overrides?.accessToken ?? base.accessToken;
  const verificationToken = overrides?.verificationToken ?? base.verificationToken;
  const webhookPath = overrides?.webhookPath ?? base.webhookPath;

  const configured = Boolean(accessToken?.trim());

  return {
    accountId,
    enabled,
    configured,
    name: name?.trim() || undefined,
    accessToken: accessToken?.trim() || undefined,
    verificationToken: verificationToken?.trim() || undefined,
    config: {
      webhookPath: webhookPath?.trim() || undefined,
      dmPolicy: overrides?.dmPolicy ?? base.dmPolicy,
      allowFrom: (overrides?.allowFrom ?? base.allowFrom)?.map((v) => String(v)) ?? undefined,
      groupPolicy: overrides?.groupPolicy ?? base.groupPolicy,
      groupAllowFrom:
        (overrides?.groupAllowFrom ?? base.groupAllowFrom)?.map((v) => String(v)) ?? undefined,
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
