import { searchNotes } from "./agent-functions.js";
import { plan } from "./plan.js";

export async function askGemini(message, generateContent, store, embed) {
  const messages = message.map((turn) => turn.content);
  console.log(messages);
  if (!messages.some((line) => String(line ?? "").trim())) {
    throw new Error("Message is required");
  }

  const question = [...message].reverse().find((turn) => turn.role === "user")?.content ?? "";
  const checklist = await plan(question, generateContent);

  let chatTurns = message.map((turn) => ({ role: turn.role, parts: [{ text: turn.content }] }));
  let recentTurns = chatTurns.slice(-5);
  const olderUserTurns = chatTurns.slice(0, -5).filter((turn) => turn.role === "user");
  if (olderUserTurns.length > 0) {
    const olderUserText = olderUserTurns.map((turn) => turn.parts[0].text).join("\n");
    recentTurns = [{ role: "user", parts: [{ text: "Earlier:\n" + olderUserText }] }, ...recentTurns];
  }

  let searchCount = 0;
  let previousItem = null;
  let searches = [];
  let toolNames = [];
  const matchedNotes = [];

  while (checklist.some((entry) => entry.done === false)) {
    searchCount++;
    if (searchCount > 5) {
      throw new Error("Too many calls");
    }
    const current = checklist.find((entry) => entry.done === false);
    if (current.item === previousItem) {
      break;
    }
    previousItem = current.item;
    toolNames.push("searchNotes");
    searches.push(current.item);
    let searchResult;
    try {
      searchResult = await searchNotes(current.item, store, embed);
      console.log(current.item);
    } catch (error) {
      searchResult = { success: false, message: error.message };
    }
    if (searchResult?.success && Array.isArray(searchResult.results) && searchResult.results.length > 0) {
      current.done = true;
      matchedNotes.push(...searchResult.results);
    }
  }

  if (checklist.length > 0 && matchedNotes.length === 0) {
    return { reply: "I don't know", searches, pending: false, calls: toolNames, checklist };
  }

  if (matchedNotes.length > 0) {
    recentTurns.push({
      role: "user",
      parts: [{ text: matchedNotes.map((note) => note.content).join("\n") }],
    });
  }

  const response = await generateContent(recentTurns);
  const reply = String(response?.text ?? "").trim();
  if (!reply) {
    throw new Error("Gemini returned no text");
  }

  return { reply, searches, pending: false, calls: toolNames, checklist };
}
