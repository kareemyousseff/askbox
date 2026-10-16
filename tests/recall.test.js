import { describe, expect, it } from "vitest";
import { recall } from "../recall.js";

const ranked = [
  { content: "one" },
  { content: "two" },
  { content: "three" },
  { content: "cairo" },
  { content: "five" },
];

describe("recall", () => {
  it("fails recall@1 and passes recall@5 when the right chunk is fourth", () => {
    const right = ranked[3];
    expect(recall(ranked, right, 1)).toBe(false);
    expect(recall(ranked, right, 5)).toBe(true);
  });
});
