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
    const reply = await askGemini([{ role: "user", content: "hello" }], async (contents) => {
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
    const modelAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "kareem" } } }],
    };

    const reply = await askGemini(
      [{ role: "user", content: "who is kareem" }],
      async (contents) => {
        step += 1;
        if (step === 1) {
          expect(contents).toEqual([{ role: "user", parts: [{ text: "who is kareem" }] }]);
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "kareem" } }],
            candidates: [{ content: modelAsk }],
          };
        }

        expect(contents).toHaveLength(3);
        expect(contents[0]).toEqual({ role: "user", parts: [{ text: "who is kareem" }] });
        expect(contents[1]).toBe(modelAsk);
        expect(contents[2].parts[0].functionResponse.response.hits.results[0].content).toMatch(
          /software engineer/,
        );
        return { text: "Kareem is a software engineer" };
      },
      copyNotes(),
      fakeEmbed,
    );

    expect(reply.reply).toBe("Kareem is a software engineer");
  });

  it("runs addNote then searchNotes in the same ask", async () => {
    let step = 0;
    const addAsk = {
      role: "model",
      parts: [
        {
          functionCall: {
            name: "addNote",
            args: { title: "test-loop", content: "lives in cairo" },
          },
        },
      ],
    };
    const searchAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "test-loop" } } }],
    };
    const store = copyNotes();

    const reply = await askGemini(
      [{ role: "user", content: "remember test-loop then where" }],
      async (contents) => {
        step += 1;
        if (step === 1) {
          expect(contents).toEqual([
            { role: "user", parts: [{ text: "remember test-loop then where" }] },
          ]);
          return {
            functionCalls: [
              {
                name: "addNote",
                args: { title: "test-loop", content: "lives in cairo" },
              },
            ],
            candidates: [{ content: addAsk }],
          };
        }

        if (step === 2) {
          expect(contents).toHaveLength(3);
          expect(contents[1]).toBe(addAsk);
          expect(contents[2].parts[0].functionResponse.name).toBe("addNote");
          expect(contents[2].parts[0].functionResponse.response.hits).toEqual({
            success: true,
            message: "Note added successfully",
          });
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "test-loop" } }],
            candidates: [{ content: searchAsk }],
          };
        }

        expect(step).toBe(3);
        const paper = contents[contents.length - 1].parts[0].functionResponse;
        expect(paper.name).toBe("searchNotes");
        expect(paper.response.hits.results[0].title).toBe("test-loop");
        return { text: "Kareem lives in Cairo" };
      },
      store,
      fakeEmbed,
    );

    expect(reply.reply).toBe("Kareem lives in Cairo");
    expect(step).toBe(3);
    expect(store.notes.some((note) => note.title === "test-loop")).toBe(true);
  });

  it("answers both function calls from one reply before asking again", async () => {
    let step = 0;
    const modelAsk = {
      role: "model",
      parts: [
        { functionCall: { name: "addNote", args: { title: "test-both", content: "lives in cairo" } } },
        { functionCall: { name: "searchNotes", args: { query: "test-both" } } },
      ],
    };
    const store = copyNotes();

    const reply = await askGemini(
      [{ role: "user", content: "add test-both and find it" }],
      async (contents) => {
        step += 1;
        if (step === 1) {
          return {
            functionCalls: [
              { name: "addNote", id: "add-1", args: { title: "test-both", content: "lives in cairo" } },
              { name: "searchNotes", id: "search-1", args: { query: "test-both" } },
            ],
            candidates: [{ content: modelAsk }],
          };
        }

        expect(step).toBe(2);
        const paper = contents[contents.length - 1];
        expect(paper.parts).toHaveLength(2);
        expect(paper.parts[0].functionResponse.name).toBe("addNote");
        expect(paper.parts[1].functionResponse.name).toBe("searchNotes");
        expect(paper.parts[1].functionResponse.response.hits.results[0].title).toBe("test-both");
        return { text: "test-both is cairo" };
      },
      store,
      fakeEmbed,
    );

    expect(reply.reply).toBe("test-both is cairo");
    expect(step).toBe(2);
    expect(store.notes.some((note) => note.title === "test-both")).toBe(true);
  });

  it("stops after five tool laps", async () => {
    let step = 0;
    const modelAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "kareem" } } }],
    };

    await expect(
      askGemini(
        [{ role: "user", content: "how old is kareem" }],
        async () => {
          step += 1;
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "kareem" } }],
            candidates: [{ content: modelAsk }],
          };
        },
        copyNotes(),
        fakeEmbed,
      ),
    ).rejects.toThrow("Too many calls");

    expect(step).toBe(6);
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
});
