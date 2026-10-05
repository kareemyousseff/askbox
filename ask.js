import { searchNotes } from "./agent-functions.js";

function searchMissed(parts) {
  const searches = parts.filter((part) => part.functionResponse?.name === "searchNotes");
  if (searches.length === 0 || searches.length !== parts.length) return false;
  return searches.every((part) => {
    const hits = part.functionResponse.response.hits;
    if (!hits || hits.success !== false) return false;
    if (Array.isArray(hits.results)) return hits.results.length === 0;
    return hits.message === "No words found";
  });
}

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
    if (searchMissed(parts)) {
      return { reply: "I don't know", searches, pending, calls: made };
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
