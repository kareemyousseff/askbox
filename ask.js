import { searchNotes } from "./agent-functions.js";
import { addNote } from "./agent-functions.js";

export async function askGemini(message, generateContent) {
  const text = String(message ?? "").trim();
  if (!text) {
    throw new Error("Message is required");
  }

  const response = await generateContent(text);
  const call = response.functionCalls?.[0];

  if (call) {
    if (call.name === "searchNotes") {
      const hits = searchNotes(call.args?.query);
      const second = await generateContent([
        { role: "user", parts: [{ text: text }] },
        response.candidates[0].content,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name ?? "searchNotes",
                id: call.id,
                response: { hits },
              },
            },
          ],
        },
      ]);
      const reply = String(second?.text ?? "").trim();
      if (!reply) {
        throw new Error("Gemini returned no text");
      }
      return reply;
    }

    if (call.name === "addNote") {
      const result = addNote(call.args?.title, call.args?.content);
      const second = await generateContent([
        { role: "user", parts: [{ text: text }] },
        response.candidates[0].content,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name ?? "addNote",
                id: call.id,
                response: { success: result },
              },
            },
          ],
        },
      ]);
      const reply = String(second?.text ?? "").trim();
      if (!reply) {
        throw new Error("Gemini returned no text");
      }
      return reply;
    }
  }

  const reply = String(response?.text ?? "").trim();
  if (!reply) {
    throw new Error("Gemini returned no text");
  }

  return reply;
}
