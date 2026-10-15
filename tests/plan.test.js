import { describe, expect, it } from "vitest";
import { plan, readChecklist } from "../plan.js";

describe("plan", () => {
  it("asks the model for the items and starts each one undone", async () => {
    const question = "how old is kareem and where does he live?";
    const list = await plan(question, async (contents) => {
      expect(contents[0].parts[0].text).toContain(question);
      return {
        text: JSON.stringify([
          { item: "age", done: true },
          { item: "city", done: true },
        ]),
      };
    });

    expect(list).toEqual([
      { item: "age", done: false },
      { item: "city", done: false },
    ]);
  });

  it("rejects a checklist that does not match the schema", () => {
    expect(readChecklist('[{"item":"age"}]')).toEqual([{ item: "age", done: false }]);
    expect(readChecklist('[{"save":"I live in cairo"}]')).toEqual({ save: "I live in cairo" });
    expect(() => readChecklist('[{"done":false}]')).toThrow(/schema/);
  });
});
