import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { searchDocs } from "../agent-functions.js";

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
});
