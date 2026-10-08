import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { connectNotes } from "./notes-mcp.js";
import { plan } from "./plan.js";

const GraphState = Annotation.Root({
  checklist: Annotation(),
  searchCount: Annotation(),
  previousItem: Annotation(),
  searches: Annotation(),
  calls: Annotation(),
  matchedNotes: Annotation(),
  reply: Annotation(),
});

function recentChat(message) {
  const chatTurns = message.map((turn) => ({ role: turn.role, parts: [{ text: turn.content }] }));
  let recentTurns = chatTurns.slice(-5);
  const olderUserTurns = chatTurns.slice(0, -5).filter((turn) => turn.role === "user");
  if (olderUserTurns.length > 0) {
    const olderUserText = olderUserTurns.map((turn) => turn.parts[0].text).join("\n");
    recentTurns = [{ role: "user", parts: [{ text: "Earlier:\n" + olderUserText }] }, ...recentTurns];
  }
  return recentTurns;
}

function stepLabel(step, patch) {
  if (step === "plan") {
    const items = (patch.checklist ?? []).map((row) => row.item).filter(Boolean);
    return items.length ? `plan: ${items.join(", ")}` : "plan";
  }
  if (step === "search") return `search: ${patch.previousItem}`;
  return step;
}

export async function askGemini(message, generateContent, store, embed) {
  const messages = message.map((turn) => turn.content);
  if (!messages.some((line) => String(line ?? "").trim())) {
    throw new Error("Message is required");
  }

  const question = [...message].reverse().find((turn) => turn.role === "user")?.content ?? "";
  const recentTurns = recentChat(message);
  let notesClient;

  async function callSearch(query) {
    if (!notesClient) notesClient = await connectNotes(store, embed);
    const response = await notesClient.callTool({
      name: "searchNotes",
      arguments: { query },
    });
    const text = response.content.find((part) => part.type === "text")?.text;
    if (!text) throw new Error("searchNotes returned no text");
    return JSON.parse(text);
  }

  async function planStep() {
    return { checklist: await plan(question, generateContent) };
  }

  async function search(state) {
    const searchCount = state.searchCount + 1;
    if (searchCount > 5) {
      throw new Error("Too many calls");
    }
    const current = state.checklist.find((entry) => entry.done === false);
    const checklist = state.checklist.map((entry) => ({ ...entry }));
    const matchedNotes = [...state.matchedNotes];
    let searchResult;
    try {
      searchResult = await callSearch(current.item);
    } catch (error) {
      searchResult = { success: false, message: error.message };
    }
    if (searchResult?.success && Array.isArray(searchResult.results) && searchResult.results.length > 0) {
      checklist.find((entry) => entry.done === false).done = true;
      matchedNotes.push(...searchResult.results);
    }
    return {
      searchCount,
      previousItem: current.item,
      searches: [...state.searches, current.item],
      calls: [...state.calls, "searchNotes"],
      checklist,
      matchedNotes,
    };
  }

  function nextStep(state) {
    const unfinished = state.checklist.find((entry) => entry.done === false);
    if (unfinished && unfinished.item !== state.previousItem) {
      return "search";
    }
    if (state.checklist.length > 0 && state.matchedNotes.length === 0) {
      return "giveUp";
    }
    return "answer";
  }

  async function giveUp() {
    return { reply: "I don't know" };
  }

  async function answer(state) {
    const turns = [...recentTurns];
    if (state.matchedNotes.length > 0) {
      turns.push({
        role: "user",
        parts: [{ text: state.matchedNotes.map((note) => note.content).join("\n") }],
      });
    }
    const response = await generateContent(turns);
    const reply = String(response?.text ?? "").trim();
    if (!reply) {
      throw new Error("Gemini returned no text");
    }
    return { reply };
  }

  const app = new StateGraph(GraphState)
    .addNode("plan", planStep)
    .addNode("search", search)
    .addNode("giveUp", giveUp)
    .addNode("answer", answer)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", nextStep)
    .addConditionalEdges("search", nextStep)
    .addEdge("giveUp", END)
    .addEdge("answer", END)
    .compile();

  const startState = {
    checklist: [],
    searchCount: 0,
    previousItem: null,
    searches: [],
    calls: [],
    matchedNotes: [],
    reply: "",
  };
  const result = { ...startState };
  const steps = [];
  try {
    const stream = await app.stream(startState, { streamMode: "updates" });
    for await (const update of stream) {
      for (const [step, patch] of Object.entries(update)) {
        Object.assign(result, patch);
        const label = stepLabel(step, patch);
        steps.push(label);
      }
    }
  } finally {
    if (notesClient) await notesClient.close();
  }

  return {
    reply: result.reply,
    searches: result.searches,
    pending: false,
    calls: result.calls,
    checklist: result.checklist,
    steps,
  };
}
