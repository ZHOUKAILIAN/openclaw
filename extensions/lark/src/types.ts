export type LarkConfig = {
  enabled?: boolean;
  name?: string;

  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  webhookPath?: string;

  dmPolicy?: "disabled" | "open" | "allowlist" | "pairing";
  allowFrom?: string[];

  groupPolicy?: "disabled" | "open" | "allowlist";
  groupAllowFrom?: string[];

  // keep this loose; the core agent runtime consumes it
  tools?: unknown;

  dms?: Record<string, unknown>;
  historyLimit?: number;
  dmHistoryLimit?: number;

  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
  blockStreaming?: boolean;
  blockStreamingCoalesce?: unknown;
  markdown?: unknown;

  accounts?: Record<string, LarkConfig | undefined>;
};

export type ResolvedLarkAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  config: {
    dmPolicy?: LarkConfig["dmPolicy"];
    allowFrom?: string[];
    groupPolicy?: LarkConfig["groupPolicy"];
    groupAllowFrom?: string[];
    webhookPath?: string;
    tools?: unknown;
    historyLimit?: number;
    dmHistoryLimit?: number;
    textChunkLimit?: number;
    chunkMode?: LarkConfig["chunkMode"];
    blockStreaming?: boolean;
    blockStreamingCoalesce?: unknown;
    markdown?: unknown;
  };
};

export type LarkInboundMessage = {
  messageId: string;
  chatId: string;
  // Lark uses values like "p2p" (DM) and "group" (group chat), but treat as opaque.
  chatType: string;
  senderOpenId: string;
  senderName?: string;
  text: string;
  timestamp: number;
};
