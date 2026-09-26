import { searchNotes } from "./agent-functions.js";
import { addNote } from "./agent-functions.js";

export async function askGemini(message, generateContent, store) {
  const messages = message.map((turn) => turn.content);
  console.log(messages);
  if (!messages.some((line) => String(line ?? "").trim())) {
    throw new Error("Message is required");
  }

  let contents =message.map(turn => ({ role: turn.role, parts: [{ text: turn.content }] }));
  let response = await generateContent(contents);
  let calls = response.functionCalls ?? [];
  let count = 0;

  while(calls.length > 0) {
    count++;
    if (count > 5) {
      throw new Error("Too many calls");
    }
    const parts = [];
    contents.push(response.candidates[0].content);

  while (calls.length > 0) {
     let call = calls.shift();
    let hits;
    if (call.name === "searchNotes") {
      hits = searchNotes(call.args?.query, store);
      console.log(call.args?.query)
    }
      if (call.name === "addNote") {
        hits = addNote(call.args?.title, call.args?.content, store);
      }
      parts.push({
       
            functionResponse: {
              name: call.name,
              id: call.id,
            response: { hits },
          },
        });
    
    }
    contents.push({ role: "user", parts });
    console.log(JSON.stringify(contents, null, 2));
    response = await generateContent(contents);
    calls = response.functionCalls ?? [];
  }
  const reply = String(response?.text ?? "").trim();
  if (!reply) {
    throw new Error("Gemini returned no text");
  }

  return reply;
}
