import { describe, expect, it } from "vitest";

import { looksLikeDingTalkTargetId, normalizeDingTalkMessagingTarget } from "./normalize.js";

describe("dingtalk normalize", () => {
  it("normalizes conversation ids", () => {
    expect(normalizeDingTalkMessagingTarget("abcDEF_123")).toBe("conversation:abcDEF_123");
    expect(normalizeDingTalkMessagingTarget("conversation:xyz-123")).toBe("conversation:xyz-123");
    expect(normalizeDingTalkMessagingTarget("dd:conversation:xyz-123")).toBe(
      "conversation:xyz-123",
    );
  });

  it("detects ids", () => {
    expect(looksLikeDingTalkTargetId("conversation:abcDEF_123")).toBe(true);
    expect(looksLikeDingTalkTargetId("abcDEF_123")).toBe(true);
    expect(looksLikeDingTalkTargetId("")).toBe(false);
  });
});
