export type DingTalkConfig = {
  enabled?: boolean;
  name?: string;

  // DingTalk custom robot webhook (access_token value).
  accessToken?: string;

  // Optional shared token if you enable it in outgoing webhook settings.
  verificationToken?: string;

  webhookPath?: string;

  dmPolicy?: "disabled" | "open" | "allowlist" | "pairing";
  allowFrom?: string[];

  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];

  tools?: unknown;

  dms?: Record<string, unknown>;
  historyLimit?: number;
  dmHistoryLimit?: number;

  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
  blockStreaming?: boolean;
  blockStreamingCoalesce?: unknown;
  markdown?: unknown;

  accounts?: Record<string, DingTalkConfig | undefined>;
};

export type ResolvedDingTalkAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  accessToken?: string;
  verificationToken?: string;
  config: {
    webhookPath?: string;
    dmPolicy?: DingTalkConfig["dmPolicy"];
    allowFrom?: string[];
    groupPolicy?: DingTalkConfig["groupPolicy"];
    groupAllowFrom?: string[];
    tools?: unknown;
    historyLimit?: number;
    dmHistoryLimit?: number;
    textChunkLimit?: number;
    chunkMode?: DingTalkConfig["chunkMode"];
    blockStreaming?: boolean;
    blockStreamingCoalesce?: unknown;
    markdown?: unknown;
  };
};

export type DingTalkInboundMessage = {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
};
