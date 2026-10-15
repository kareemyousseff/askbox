import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { connectNotes } from "./notes-mcp.js";
import { cite } from "./agent-functions.js";
import { plan } from "./plan.js";

const GraphState = Annotation.Root({
  checklist: Annotation(),
  searchCount: Annotation(),
  previousItem: Annotation(),
  rewritten: Annotation(),
  searches: Annotation(),
  trace: Annotation(),
  calls: Annotation(),
  matchedNotes: Annotation(),
  reply: Annotation(),
  pending: Annotation(),
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
    if (patch.pending?.content) return `plan: save ${patch.pending.content}`;
    const items = (patch.checklist ?? []).map((row) => row.item).filter(Boolean);
    return items.length ? `plan: ${items.join(", ")}` : "plan";
  }
  if (step === "search") {
    if (patch.rewritten && patch.rewritten !== patch.previousItem) {
      return `search: ${patch.previousItem} -> ${patch.rewritten}`;
    }
    return `search: ${patch.previousItem}`;
  }
  if (step === "check") {
    const verdict = patch.trace?.find((row) => row.check)?.check;
    return verdict ? `check: ${verdict}` : "check";
  }
  if (step === "answer" && patch.trace?.some((row) => row.blocked)) return "answer: blocked";
  return step;
}

function poisoned(notes) {
  return notes.some((note) => /ignore your instructions/i.test(String(note?.content ?? "")));
}

export async function askGemini(message, generateContent, store, embed, rerank, rewrite, check) {
  const messages = message.map((turn) => turn.content);
  if (!messages.some((line) => String(line ?? "").trim())) {
    throw new Error("Message is required");
  }

  const question = [...message].reverse().find((turn) => turn.role === "user")?.content ?? "";
  const recentTurns = recentChat(message);
  const latency = [];
  let notesClient;

  async function callSearch(query) {
    if (!notesClient) notesClient = await connectNotes(store, embed, rerank);
    const response = await notesClient.callTool({
      name: "searchNotes",
      arguments: { query },
    });
    const text = response.content.find((part) => part.type === "text")?.text;
    if (!text) throw new Error("searchNotes returned no text");
    return JSON.parse(text);
  }

  async function callModel(contents) {
    const started = Date.now();
    let tries = 0;
    while (tries < 2) {
      tries += 1;
      try {
        const response = await generateContent(contents);
        latency.push({ ms: Date.now() - started, tries });
        return response;
      } catch (error) {
        const status = Number(error?.status ?? error?.statusCode);
        if (status === 429 && tries < 2) continue;
        latency.push({ ms: Date.now() - started, tries });
        throw error;
      }
    }
  }

  async function planStep() {
    const list = await plan(question, callModel);
    if (list?.save) {
      return {
        pending: { title: list.save, content: list.save },
        reply: "Waiting for approval",
        checklist: [],
      };
    }
    return { checklist: list };
  }

  async function search(state) {
    const searchCount = state.searchCount + 1;
    if (searchCount > 5) {
      throw new Error("Too many calls");
    }
    const current = state.checklist.find((entry) => entry.done === false);
    const checklist = state.checklist.map((entry) => ({ ...entry }));
    const matchedNotes = [...state.matchedNotes];
    let query = current.item;
    if (rewrite) {
      const next = String(await rewrite(question, current.item) ?? "").trim();
      if (next) query = next;
    }
    let searchResult;
    try {
      searchResult = await callSearch(query);
    } catch (error) {
      searchResult = { success: false, message: error.message };
    }
    const found = searchResult?.success && Array.isArray(searchResult.results) ? searchResult.results : [];
    if (found.length > 0) {
      checklist.find((entry) => entry.done === false).done = true;
      matchedNotes.push(...found);
    }
    return {
      searchCount,
      previousItem: current.item,
      rewritten: query,
      searches: [...state.searches, current.item],
      trace: [
        ...(state.trace ?? []),
        {
          item: current.item,
          search: query,
          note: found.map((row) => row.content).filter(Boolean).join("\n"),
        },
      ],
      calls: [...state.calls, "searchNotes"],
      checklist,
      matchedNotes,
    };
  }

  function nextStep(state) {
    if (state.pending) return END;
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
    if (poisoned(state.matchedNotes)) {
      return {
        reply: "I don't know",
        matchedNotes: [],
        trace: (state.trace ?? []).map((row) => ({ ...row, blocked: true })),
      };
    }
    const turns = [...recentTurns];
    if (state.matchedNotes.length > 0) {
      turns.push({
        role: "user",
        parts: [{ text: state.matchedNotes.map((note) => note.content).join("\n") }],
      });
    }
    const response = await callModel(turns);
    const reply = String(response?.text ?? "").trim();
    if (!reply) {
      throw new Error("Gemini returned no text");
    }
    if (state.matchedNotes.length === 0 || check) return { reply };
    const cited = cite(reply, state.matchedNotes);
    return { reply: cited || "I don't know" };
  }

  async function checkStep(state) {
    const note = state.matchedNotes.map((row) => row.content).join("\n");
    const verdict = String(await check(state.reply, note) ?? "").trim().toLowerCase();
    const approved = verdict === "yes";
    const cited = approved ? cite(state.reply, state.matchedNotes) : "";
    return {
      reply: approved ? cited : "I don't know",
      trace: (state.trace ?? []).map((row) => ({ ...row, check: approved ? "yes" : "no" })),
    };
  }

  const app = new StateGraph(GraphState)
    .addNode("plan", planStep)
    .addNode("search", search)
    .addNode("giveUp", giveUp)
    .addNode("answer", answer)
    .addNode("check", checkStep)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", nextStep)
    .addConditionalEdges("search", nextStep)
    .addEdge("giveUp", END)
    .addConditionalEdges("answer", (state) => (check && state.matchedNotes.length > 0 ? "check" : END))
    .addEdge("check", END)
    .compile();

  const startState = {
    checklist: [],
    searchCount: 0,
    previousItem: null,
    rewritten: "",
    searches: [],
    trace: [],
    calls: [],
    matchedNotes: [],
    reply: "",
    pending: null,
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
    trace: result.trace,
    latency,
    pending: result.pending,
    calls: result.calls,
    checklist: result.checklist,
    steps,
  };
}
