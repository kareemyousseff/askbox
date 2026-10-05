import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { answerFromDocs, searchDocs } from "../agent-functions.js";

function fakeEmbed(texts, taskType) {
  return texts.map((text) => {
    if (taskType === "RETRIEVAL_QUERY") return [1];
    if (text.toLowerCase().includes("years old")) return [0.5];
    return [0.9];
  });
}

describe("searchDocs", () => {
  it("returns file B when file A has the higher vector score", async () => {
    const files = [
      { name: "a.txt", text: readFileSync("docs/a.txt", "utf8") },
      { name: "b.txt", text: readFileSync("docs/b.txt", "utf8") },
    ];
    const best = await searchDocs("how old is kareem?", files, fakeEmbed);
    expect(best.name).toBe("b.txt");
  });

  it("returns null when no file contains a query word", async () => {
    const files = [
      { name: "a.txt", text: readFileSync("docs/a.txt", "utf8") },
      { name: "b.txt", text: readFileSync("docs/b.txt", "utf8") },
    ];
    const best = await searchDocs("capital of france", files, fakeEmbed);
    expect(best).toBe(null);
  });

  it("sends only file B to the model", async () => {
    const files = [
      { name: "a.txt", text: readFileSync("docs/a.txt", "utf8") },
      { name: "b.txt", text: readFileSync("docs/b.txt", "utf8") },
    ];
    const reply = await answerFromDocs("how old is kareem?", files, fakeEmbed, async (contents) => {
      const text = contents[0].parts[0].text;
      expect(text).toContain("18");
      expect(text).not.toContain("baseball");
      return { text: "Kareem is 18 years old" };
    });
    expect(reply).toBe("Kareem is 18 years old");
  });

  it("returns I don't know without calling the model", async () => {
    const files = [
      { name: "a.txt", text: readFileSync("docs/a.txt", "utf8") },
      { name: "b.txt", text: readFileSync("docs/b.txt", "utf8") },
    ];
    const reply = await answerFromDocs("capital of france", files, fakeEmbed, async () => {
      throw new Error("generateContent should not run");
    });
    expect(reply).toBe("I don't know");
  });
});
