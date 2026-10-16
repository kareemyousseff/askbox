import { describe, expect, it } from "vitest";
import { searchNotes } from "../agent-functions.js";
import { recall } from "../recall.js";

const label = "lantern";

function embed(texts, taskType) {
  if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
  let higher = 0;
  return texts.map((text) => {
    const line = text.toLowerCase();
    if (line.includes("i live in cairo")) return [0, 1];
    if (line.includes(label)) return [1, 1];
    if (higher < 3) {
      higher += 1;
      return [1, 0];
    }
    return [0, 1];
  });
}

describe("recall", () => {
  it("fails recall@1 and passes recall@5 when search scores put the label fourth", async () => {
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    const hit = await searchNotes("zzzzz", store, embed, async (_question, found) => found);
    const right = hit.ranked.find((note) => note.content.includes(label));

    expect(hit.ranked.indexOf(right)).toBe(3);
    expect(hit.results.some((note) => note.content.includes(label))).toBe(false);
    expect(recall(hit.ranked, right, 1)).toBe(false);
    expect(recall(hit.ranked, right, 5)).toBe(true);
  });
});
