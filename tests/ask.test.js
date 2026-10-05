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

  it("searches again when the first result misses the second fact", async () => {
    let step = 0;
    const ageAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "how old is kareem" } } }],
    };
    const cityAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "where does he live" } } }],
    };
    async function embed(texts) {
      return texts.map((text) => {
        const line = text.toLowerCase();
        if (line.includes("old") || line.includes("18")) return [1, 0];
        if (line.includes("live") || line.includes("cairo")) return [0, 1];
        return [0, 0];
      });
    }

    const reply = await askGemini(
      [{ role: "user", content: "how old is kareem and where does he live?" }],
      async (contents) => {
        step += 1;
        if (step === 1) {
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "how old is kareem" } }],
            candidates: [{ content: ageAsk }],
          };
        }
        if (step === 2) {
          const hits = contents[contents.length - 1].parts[0].functionResponse.response.hits.results;
          expect(hits.some((note) => note.content.includes("18"))).toBe(true);
          expect(hits.some((note) => note.content.toLowerCase().includes("cairo"))).toBe(false);
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "where does he live" } }],
            candidates: [{ content: cityAsk }],
          };
        }
        expect(step).toBe(3);
        return { text: "Kareem is 18 and lives in cairo" };
      },
      copyNotes(),
      embed,
    );

    expect(reply.reply).toBe("Kareem is 18 and lives in cairo");
    expect(reply.searches).toEqual(["how old is kareem", "where does he live"]);
  });

  it("sends a tool failure back so the request stays alive", async () => {
    let step = 0;
    const modelAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "kareem" } } }],
    };

    const reply = await askGemini(
      [{ role: "user", content: "how old is kareem" }],
      async (contents) => {
        step += 1;
        if (step === 1) {
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "kareem" } }],
            candidates: [{ content: modelAsk }],
          };
        }
        expect(step).toBe(2);
        const hits = contents[contents.length - 1].parts[0].functionResponse.response.hits;
        expect(hits.success).toBe(false);
        expect(hits.message).toMatch(/embed is down/);
        return { text: "I could not search." };
      },
      copyNotes(),
      async () => {
        throw new Error("embed is down");
      },
    );

    expect(reply.reply).toBe("I could not search.");
  });

  it("returns I don't know without another model call when search misses", async () => {
    let step = 0;
    const modelAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "capital of france" } } }],
    };

    const reply = await askGemini(
      [{ role: "user", content: "capital of france" }],
      async () => {
        step += 1;
        if (step > 1) throw new Error("generateContent should not run");
        return {
          functionCalls: [{ name: "searchNotes", args: { query: "capital of france" } }],
          candidates: [{ content: modelAsk }],
        };
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

    const reply = await askGemini(turns, async (contents) => {
      expect(contents).toHaveLength(6);
      expect(contents[0].parts[0].text).toBe("Earlier:\nfavorite color is blue");
      expect(contents[1].parts[0].text).toBe("a");
      return { text: "blue" };
    });

    expect(reply.reply).toBe("blue");
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
