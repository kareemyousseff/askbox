import { describe, expect, it } from "vitest";
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
});
