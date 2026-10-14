import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { answerFromDocs, chunkText, cite, searchDocs, searchNotes, searchPage } from "../agent-functions.js";

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

  it("returns the chunk that keeps the capital sentence", async () => {
    const page = readFileSync("page.txt", "utf8");
    const split = chunkText(page, 127, 0);
    const kept = chunkText(page, 127, 20);
    expect(split.some((piece) => piece.includes("The capital is Cairo and he is 18."))).toBe(false);
    expect(kept.some((piece) => piece.includes("The capital is Cairo and he is 18."))).toBe(true);

    const hit = await searchPage("capital cairo", page, async (texts, taskType) => {
      if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
      return texts.map((text) => (
        text.includes("The capital is Cairo and he is 18.") ? [1, 0] : [0, 1]
      ));
    });
    expect(hit).toContain("The capital is Cairo and he is 18.");
    expect(hit.length).toBeLessThan(page.length);
    expect(hit.length).toBeLessThanOrEqual(127);
  });

  it("searchNotes returns a page chunk when the notes miss", async () => {
    const page = readFileSync("page.txt", "utf8");
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    const hit = await searchNotes("capital", store, async (texts, taskType) => {
      if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
      return texts.map((text) => {
        if (text.includes("The capital is Cairo and he is 18.")) return [1, 0];
        if (text.includes("contains the capital and the age")) return [0.97, 0];
        if (text.includes("Food shows up")) return [0.5, 0];
        return [0, 1];
      });
    });
    const contents = hit.results.map((note) => note.content).join("\n");
    expect(hit.success).toBe(true);
    expect(contents).toContain("The capital is Cairo and he is 18.");
    expect(contents).not.toContain("Food shows up");
    expect(hit.results.every((note) => note.content.length < page.length)).toBe(true);
  });

  it("drops the other page before scoring when the question names page.txt", async () => {
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    const hit = await searchNotes("capital in page.txt", store, async (texts, taskType) => {
      if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
      return texts.map((text) => (
        text.includes("The capital is Cairo and he is 18.") ? [1, 0] : [0, 1]
      ));
    });
    const contents = hit.results.map((note) => note.content).join("\n");
    expect(hit.results.every((note) => note.source === "page.txt")).toBe(true);
    expect(hit.results.every((note) => note.date === "2026-10-11")).toBe(true);
    expect(contents).toContain("The capital is Cairo and he is 18.");
    expect(contents).not.toContain("lantern");
  });

  it("returns the lantern chunk when its vector is lower", async () => {
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    const hit = await searchNotes("lantern", store, async (texts, taskType) => {
      if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
      return texts.map((text) => {
        const line = text.toLowerCase();
        if (line.includes("i live in cairo")) return [0, 1];
        if (line.includes("lantern")) return [0.2, 0];
        return [0.9, 0];
      });
    });
    expect(hit.success).toBe(true);
    expect(hit.results.every((note) => note.source === "other.txt")).toBe(true);
    expect(hit.results.some((note) => note.content.includes("lantern"))).toBe(true);
  });

  it("reranks a second-place chunk to first", async () => {
    const store = { notes: [{ title: "Where I live", content: "I live in cairo" }] };
    let scoreOrder = [];
    const hit = await searchNotes("capital", store, async (texts, taskType) => {
      if (taskType === "RETRIEVAL_QUERY") return [[1, 0]];
      return texts.map((text) => {
        const line = text.toLowerCase();
        if (line.includes("i live in cairo")) return [0, 1];
        if (line.includes("lantern")) return [0.9, 0.4];
        if (line.includes("the capital is cairo and he is 18.")) return [3, 0];
        return [0, 1];
      });
    }, async (question, found) => {
      scoreOrder = found.map((note) => note.content);
      return [
        ...found.filter((note) => note.content.includes("lantern")),
        ...found.filter((note) => !note.content.includes("lantern")),
      ];
    });
    expect(scoreOrder[0].includes("lantern")).toBe(false);
    expect(scoreOrder.some((content) => content.includes("lantern"))).toBe(true);
    expect(hit.results[0].content.includes("lantern")).toBe(true);
  });

  it("drops a sentence whose word is missing from the chunk", () => {
    const notes = [{ content: "The capital is Cairo and he is 18.", source: "page.txt" }];
    const reply = cite("Cairo is the capital. He owns a boat.", notes);
    expect(reply).toBe("Cairo is the capital. (page.txt)");
  });
});
