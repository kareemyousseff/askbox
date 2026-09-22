import { describe, expect, it } from "vitest";
import fs from "fs";
import notes from "../notes.json" with { type: "json" };
import { askGemini } from "../ask.js";

describe("askGemini", () => {
  it("sends the message to generateContent and returns the text", async () => {
    const reply = await askGemini("hello", async (text) => {
      expect(text).toBe("hello");
      return { text: "hi there" };
    });

    expect(reply).toBe("hi there");
  });

  it("rejects a blank message", async () => {
    await expect(askGemini("   ", async () => ({ text: "nope" }))).rejects.toThrow(
      "Message is required",
    );
  });

  it("sends searchNotes hits back in the same chat", async () => {
    let step = 0;
    const modelAsk = {
      role: "model",
      parts: [{ functionCall: { name: "searchNotes", args: { query: "kareem" } } }],
    };

    const reply = await askGemini("who is kareem", async (contents) => {
      step += 1;
      if (step === 1) {
        expect(contents).toBe("who is kareem");
        return {
          functionCalls: [{ name: "searchNotes", args: { query: "kareem" } }],
          candidates: [{ content: modelAsk }],
        };
      }

      expect(contents).toHaveLength(3);
      expect(contents[0]).toEqual({ role: "user", parts: [{ text: "who is kareem" }] });
      expect(contents[1]).toBe(modelAsk);
      expect(contents[2].parts[0].functionResponse.response.hits[0].content).toMatch(
        /software engineer/,
      );
      return { text: "Kareem is a software engineer" };
    });

    expect(reply).toBe("Kareem is a software engineer");
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
    const snapshot = structuredClone(notes.notes);

    try {
      const reply = await askGemini("remember test-loop then where", async (contents) => {
        step += 1;
        if (step === 1) {
          expect(contents).toBe("remember test-loop then where");
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
          });
          return {
            functionCalls: [{ name: "searchNotes", args: { query: "test-loop" } }],
            candidates: [{ content: searchAsk }],
          };
        }

        expect(step).toBe(3);
        const paper = contents[contents.length - 1].parts[0].functionResponse;
        expect(paper.name).toBe("searchNotes");
        expect(paper.response.hits[0].title).toBe("test-loop");
        return { text: "Kareem lives in Cairo" };
      });

      expect(reply).toBe("Kareem lives in Cairo");
      expect(step).toBe(3);
    } finally {
      notes.notes.length = 0;
      notes.notes.push(...snapshot);
      fs.writeFileSync("notes.json", JSON.stringify({ notes: notes.notes }, null, 2) + "\n");
    }
  });
});
