import {
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk";
import { z } from "zod";

export const LarkAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,

    // Lark/Feishu Open Platform credentials
    appId: z.string().optional(),
    appSecret: z.string().optional(),

    // Event subscription token (used to verify inbound callbacks)
    verificationToken: z.string().optional(),

    // Optional: configure where the gateway should expose the webhook.
    // Example: "/lark/webhook".
    webhookPath: z.string().optional(),

    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.string()).optional(),

    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: z.array(z.string()).optional(),

    tools: ToolPolicySchema.optional(),

    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),

    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),

    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),

    mediaMaxMb: z.number().positive().optional(),
  })
  .strict();

export const LarkAccountSchema = LarkAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.lark.dmPolicy="open" requires channels.lark.allowFrom to include "*"',
  });
});

export const LarkConfigSchema = LarkAccountSchemaBase.extend({
  accounts: z.record(z.string(), LarkAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.lark.dmPolicy="open" requires channels.lark.allowFrom to include "*"',
  });
});
