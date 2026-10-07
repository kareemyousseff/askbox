import { describe, expect, it } from "vitest";
import notes from "../notes.json" with { type: "json" };
import { askGemini } from "../ask.js";
import { searchNotes } from "../agent-functions.js";

function copyNotes() {
  return { notes: structuredClone(notes.notes) };
}

function fakeEmbed(texts) {
  return texts.map((text) => {
    const line = text.toLowerCase();
    return [
      line.includes("kareem") || line.includes("software") ? 1 : 0,
      line.includes("test-loop") ? 1 : 0,
      line.includes("test-both") ? 1 : 0,
    ];
  });
}

describe("askGemini", () => {
  it("sends the message to generateContent and returns the text", async () => {
    let step = 0;
    const reply = await askGemini([{ role: "user", content: "hello" }], async (contents) => {
      step += 1;
      if (step === 1) {
        expect(contents[0].parts[0].text).toContain("hello");
        return { text: "[]" };
      }
      expect(contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
      return { text: "hi there" };
    });

    expect(reply.reply).toBe("hi there");
  });

  it("rejects a blank message", async () => {
    await expect(
      askGemini([{ role: "user", content: "   " }], async () => ({ text: "nope" })),
    ).rejects.toThrow("Message is required");
  });

  it("sends searchNotes hits back in the same chat", async () => {
    let step = 0;
    const reply = await askGemini(
      [{ role: "user", content: "who is kareem" }],
      async (contents) => {
        step += 1;
        if (step === 1) return { text: JSON.stringify([{ item: "kareem" }]) };
        expect(contents.at(-1).parts[0].text).toMatch(/software engineer/);
        return { text: "Kareem is a software engineer" };
      },
      copyNotes(),
      fakeEmbed,
    );

    expect(reply.searches).toEqual(["kareem"]);
    expect(reply.reply).toBe("Kareem is a software engineer");
  });

  it("searches age before city", async () => {
    let step = 0;
    const reply = await askGemini(
      [{ role: "user", content: "how old is kareem and where does he live?" }],
      async () => {
        step += 1;
        if (step === 1) return { text: JSON.stringify([{ item: "age" }, { item: "city" }]) };
        return { text: "Kareem is 18 and lives in cairo" };
      },
      copyNotes(),
      async (texts) =>
        texts.map((text) => {
          const line = text.toLowerCase();
          if (line.includes("age") || line.includes("18")) return [1, 0];
          if (line.includes("city") || line.includes("cairo") || line.includes("live")) return [0, 1];
          return [0, 0];
        }),
    );

    expect(reply.searches).toEqual(["age", "city"]);
    expect(reply.checklist.map((row) => row.done)).toEqual([true, true]);
    expect(step).toBe(2);
  });

  it("returns I don't know without another model call when search misses", async () => {
    let step = 0;
    const reply = await askGemini(
      [{ role: "user", content: "capital of france" }],
      async () => {
        step += 1;
        if (step > 1) throw new Error("generateContent should not run");
        return { text: JSON.stringify([{ item: "france" }]) };
      },
      copyNotes(),
      fakeEmbed,
    );

    expect(reply.reply).toBe("I don't know");
    expect(step).toBe(1);
  });

  it("keeps dropped user lines in front of the last five turns", async () => {
    const turns = [
      { role: "user", content: "favorite color is blue" },
      { role: "model", content: "ok" },
      { role: "user", content: "a" },
      { role: "model", content: "b" },
      { role: "user", content: "c" },
      { role: "model", content: "d" },
      { role: "user", content: "what color did I say?" },
    ];
    let step = 0;

    const reply = await askGemini(turns, async (contents) => {
      step += 1;
      if (step === 1) return { text: "[]" };
      expect(contents).toHaveLength(6);
      expect(contents[0].parts[0].text).toBe("Earlier:\nfavorite color is blue");
      expect(contents[1].parts[0].text).toBe("a");
      return { text: "blue" };
    });

    expect(reply.reply).toBe("blue");
  });

  it("stops after five checklist items", async () => {
    let step = 0;
    await expect(
      askGemini(
        [{ role: "user", content: "how old is kareem" }],
        async () => {
          step += 1;
          return {
            text: JSON.stringify(["a", "b", "c", "d", "e", "f"].map((item) => ({ item }))),
          };
        },
        copyNotes(),
        async (texts) => texts.map(() => [1]),
      ),
    ).rejects.toThrow("Too many calls");

    expect(step).toBe(1);
  });
});

describe("searchNotes", () => {
  it("returns the note with the highest score, and rejects a low score", async () => {
    const store = copyNotes();
    async function embed(texts) {
      return texts.map((text) => {
        const line = text.toLowerCase();
        if (line.includes("star sign")) return [1, 0, 0];
        if (line.includes("taurus")) return [0.9, 0.1, 0];
        if (line.includes("zzz")) return [0, 0, 1];
        return [0, 1, 0];
      });
    }

    const hits = await searchNotes("what's my star sign", store, embed);
    expect(hits.success).toBe(true);
    expect(hits.results[0].content).toMatch(/taurus/);
    const miss = await searchNotes("zzz", store, embed);
    expect(miss.success).toBe(false);
    expect(miss.message).toMatch(/No note/);
  });

  it("returns every note above the cutoff, best first", async () => {
    const store = {
      notes: [
        { title: "A", content: "cookies" },
        { title: "B", content: "pasta" },
        { title: "C", content: "weak" },
        { title: "D", content: "cairo" },
      ],
    };
    async function embed(texts) {
      return texts.map((text) => {
        const line = text.toLowerCase();
        if (line.includes("food")) return [1, 0, 0];
        if (line.includes("cookies")) return [0.9, 0, 0];
        if (line.includes("pasta")) return [0.86, 0, 0];
        if (line.includes("weak")) return [0.7, 0, 0];
        return [0, 1, 0];
      });
    }

    const hits = await searchNotes("what food do I like", store, embed);
    expect(hits.success).toBe(true);
    expect(hits.results.map((note) => note.content)).toEqual(["cookies", "pasta"]);
  });
});
