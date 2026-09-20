import { describe, expect, it } from "vitest";
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
});
