import { describe, expect, it } from "vitest";
import { searchNotes } from "../agent-functions.js";
import { compareRuns, recall } from "../recall.js";

const label = "lantern";

function embedAhead(ahead) {
  return function embed(texts, taskType) {
    if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
    let higher = 0;
    return texts.map((text) => {
      const line = text.toLowerCase();
      if (line.includes("i live in cairo")) return [0, 1];
      if (line.includes(label)) return [1, 1];
      if (higher < ahead) {
        higher += 1;
        return [1, 0];
      }
      return [0, 1];
    });
  };
}

async function searchRun(ahead) {
  const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
  const hit = await searchNotes("zzzzz", store, embedAhead(ahead), async (_question, found) => found);
  const right = hit.ranked.find((note) => note.content.includes(label));
  return { question: "zzzzz", recall: recall(hit.ranked, right, 5) ? 1 : 0 };
}

describe("recall", () => {
  it("fails recall@1 and passes recall@5 when search scores put the label fourth", async () => {
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    const hit = await searchNotes("zzzzz", store, embedAhead(3), async (_question, found) => found);
    const right = hit.ranked.find((note) => note.content.includes(label));

    expect(hit.ranked.indexOf(right)).toBe(3);
    expect(hit.results.some((note) => note.content.includes(label))).toBe(false);
    expect(recall(hit.ranked, right, 1)).toBe(false);
    expect(recall(hit.ranked, right, 5)).toBe(true);
  });

  it("names zzzzz when the second search drops it out of the top 5", async () => {
    const before = [await searchRun(3)];
    const after = [await searchRun(5)];

    expect(before).toEqual([{ question: "zzzzz", recall: 1 }]);
    expect(after).toEqual([{ question: "zzzzz", recall: 0 }]);
    expect(compareRuns(before, after)).toEqual([{ question: "zzzzz", dropped: 1 }]);
  });
});
