import { searchNotes } from "./agent-functions.js";
import { addNote } from "./agent-functions.js";

export async function askGemini(message, generateContent, store, embed) {
  const messages = message.map((turn) => turn.content);
  console.log(messages);
  if (!messages.some((line) => String(line ?? "").trim())) {
    throw new Error("Message is required");
  }

  let contents =message.map(turn => ({ role: turn.role, parts: [{ text: turn.content }] }));
  let recents = contents.slice(-5);
  const olderUsers = contents.slice(0, -5).filter((turn) => turn.role === "user");
  if (olderUsers.length > 0) {
    const recap = olderUsers.map((turn) => turn.parts[0].text).join("\n");
    recents = [{ role: "user", parts: [{ text: "Earlier:\n" + recap }] }, ...recents];
  }
  let response = await generateContent(recents);
  let calls = response.functionCalls ?? [];
  let count = 0;
  let searches =[];
  let made = [];
  let pending = false;

  while(calls.length > 0) {
    count++;
    if (count > 5) {
      throw new Error("Too many calls");
    }
    const parts = [];
    recents.push(response.candidates[0].content);

  while (calls.length > 0) {
     let call = calls.shift();
    made.push(call.name);
    let hits;
    try {
      if (call.name === "searchNotes") {
        hits = await searchNotes(call.args?.query, store, embed);
        console.log(call.args?.query);
        searches.push(call.args?.query);
      }
      if (call.name === "addNote") {
        const title = call.args?.title;
        const content = call.args?.content;
        pending = { title, content };
        hits = {
          success: false,
          pending: true,
          message: "Not saved. The user has to approve.",
          title,
          content,
        };
      }
    } catch (error) {
      hits = { success: false, message: error.message };
    }
      parts.push({
       
            functionResponse: {
              name: call.name,
              id: call.id,
            response: { hits },
          },
        });
    
    }
    recents.push({ role: "user", parts });
    console.log(JSON.stringify(recents, null, 2));
    response = await generateContent(recents);
    console.log(JSON.stringify(response, null, 2));
    calls = response.functionCalls ?? [];
  }
  const reply = String(response?.text ?? "").trim();
  if (!reply) {
    throw new Error("Gemini returned no text");
  }

  return { reply, searches, pending, calls: made };
};
