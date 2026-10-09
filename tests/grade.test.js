import { describe, expect, it } from "vitest";
import notes from "../notes.json" with { type: "json" };
import { askGemini } from "../ask.js";
import { grade } from "../grade.js";

const task = {
  question: "how old is kareem?",
  calls: ["searchNotes"],
  text: "18",
};

describe("grade", () => {
  it("fails a right sentence when searchNotes never ran", async () => {
    const actual = await askGemini(
      [{ role: "user", content: task.question }],
      async (contents) => {
        const text = contents[0]?.parts?.[0]?.text ?? "";
        if (text.includes("checklist")) return { text: "[]" };
        return { text: "Kareem is 18" };
      },
    );

    const result = grade(task, actual);

    expect(actual.reply).toBe("Kareem is 18");
    expect(actual.calls).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.missing).toBe("searchNotes");
  });

  it("passes when searchNotes ran and the reply has 18", async () => {
    let step = 0;
    const actual = await askGemini(
      [{ role: "user", content: task.question }],
      async () => {
        step += 1;
        if (step === 1) return { text: JSON.stringify([{ item: "age" }]) };
        return { text: "Kareem is 18" };
      },
      { notes: structuredClone(notes.notes) },
      async (texts) =>
        texts.map((text) => (text.toLowerCase().includes("age") || text.toLowerCase().includes("18") ? [1, 0] : [0, 0])),
    );

    const result = grade(task, actual);

    expect(actual.calls).toEqual(["searchNotes"]);
    expect(result.ok).toBe(true);
    expect(result.missing).toBe(null);
  });
});
