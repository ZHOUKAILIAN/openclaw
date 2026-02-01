import { describe, expect, it } from "vitest";

import { looksLikeLarkTargetId, normalizeLarkMessagingTarget } from "./normalize.js";

describe("lark normalize", () => {
  it("normalizes user open_id", () => {
    expect(normalizeLarkMessagingTarget("ou_abc123")).toBe("user:ou_abc123");
    expect(normalizeLarkMessagingTarget("user:ou_abc123")).toBe("user:ou_abc123");
    expect(normalizeLarkMessagingTarget("feishu:ou_abc123")).toBe("user:ou_abc123");
  });

  it("normalizes chat_id", () => {
    expect(normalizeLarkMessagingTarget("oc_abc123")).toBe("chat:oc_abc123");
    expect(normalizeLarkMessagingTarget("chat:oc_abc123")).toBe("chat:oc_abc123");
    expect(normalizeLarkMessagingTarget("group:oc_abc123")).toBe("chat:oc_abc123");
  });

  it("detects ids", () => {
    expect(looksLikeLarkTargetId("ou_abc123")).toBe(true);
    expect(looksLikeLarkTargetId("oc_abc123")).toBe(true);
    expect(looksLikeLarkTargetId("user:ou_abc123")).toBe(true);
    expect(looksLikeLarkTargetId("chat:oc_abc123")).toBe(true);
    expect(looksLikeLarkTargetId("hello world")).toBe(false);
  });
});
