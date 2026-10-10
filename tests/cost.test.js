import { describe, expect, it } from "vitest";
import { priceCall, totalCost } from "../cost.js";

describe("cost", () => {
  it("counts missing usage as zero", () => {
    const call = priceCall("gemini-3.5-flash-lite", undefined);
    expect(call.inputTokens).toBe(0);
    expect(call.outputTokens).toBe(0);
    expect(call.dollars).toBe(0);
  });

  it("prices flash-lite input and output, including thinking tokens", () => {
    const call = priceCall("gemini-3.5-flash-lite", {
      promptTokenCount: 1_000_000,
      candidatesTokenCount: 100,
      thoughtsTokenCount: 50,
    });
    expect(call.inputTokens).toBe(1_000_000);
    expect(call.outputTokens).toBe(150);
    expect(call.dollars).toBeCloseTo(0.3 + 150 * 2.5 / 1_000_000);
  });

  it("prices embedding input and sums a stopped run", () => {
    const aiCalls = [
      priceCall("gemini-embedding-001", { promptTokenCount: 1_000_000 }),
      priceCall("gemini-3.5-flash-lite", undefined),
    ];
    const cost = totalCost(aiCalls, "cap");
    expect(aiCalls[0].dollars).toBeCloseTo(0.15);
    expect(cost.tokens).toBe(1_000_000);
    expect(cost.dollars).toBeCloseTo(0.15);
    expect(cost.aiCalls).toBe(2);
    expect(cost.stopped).toBe("cap");
  });
});
