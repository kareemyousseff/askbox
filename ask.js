import { searchNotes } from "./agent-functions.js";
import { addNote } from "./agent-functions.js";

export async function askGemini(message, generateContent) {
  const text = String(message ?? "").trim();
  if (!text) {
    throw new Error("Message is required");
  }

   let response = await generateContent(text);
  let contents = [ { role: "user", parts: [{ text: text }] } ]
  let calls = response.functionCalls ?? [];

  while (calls.length > 0) {
     let call = calls.shift();
    let hits;
    if (call.name === "searchNotes") {
      hits = searchNotes(call.args?.query);
    }
      if (call.name === "addNote") {
        hits = addNote(call.args?.title, call.args?.content);
      }
      contents.push(response.candidates[0].content);
      response = await generateContent([
       ...contents,
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
      ])
      calls = response.functionCalls ?? [];
    }
  const reply = String(response?.text ?? "").trim();
  if (!reply) {
    throw new Error("Gemini returned no text");
  }

  return reply;
}
