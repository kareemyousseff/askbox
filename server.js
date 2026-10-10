import express from "express";
import { GoogleGenAI } from "@google/genai";
import { askGemini } from "./ask.js";
import { addNote } from "./agent-functions.js";
import { judge } from "./judge.js";
import { priceCall, totalCost } from "./cost.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY. Copy .env.example to .env and paste your key.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

app.post("/ask", async (req, res) => {
  const aiCalls = [];
  const track = (model, response) => {
    aiCalls.push(priceCall(model, response?.usageMetadata));
    return response;
  };
  try {
    const { reply, searches, pending, checklist, steps } = await askGemini(req.body?.message, async (contents) => {
      const text = contents[0]?.parts?.[0]?.text ?? "";
      const planning = text.startsWith("Split this question into checklist items.");
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: planning ? undefined : {
          systemInstruction:
            "Answer a fact only from searchNotes results. If results has more than one note, the answer must include every note. If searchNotes returns success false, reply exactly I don't know. If they just say hello, reply with a short greeting. Do not search. If addNote returns success true, say the note was saved. Do not answer I don't know for that.",
        },
      });
      return track("gemini-3.5-flash-lite", response);
    }, undefined, async (texts, taskType) => {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: texts,
        config: { taskType },
      });
      track("gemini-embedding-001", response);
      return response.embeddings.map((item) => item.values);
    });
    const rubric = [
      "Searches: " + (searches?.length ? searches.join(", ") : "none"),
      "Pass if the reply is a short greeting.",
      "Pass if the reply is exactly I don't know.",
      "Pass if Searches is not none.",
      "Fail if the reply states a fact and Searches is none.",
    ].join("\n");
    const judged = await judge(reply, rubric, async (contents) => {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction:
            "Grade the reply against the rules. The Searches line is the record of what ran. none means no search ran. Do not fail when Searches is not none. Start with pass or fail, then quote the rule that decided it.",
        },
      });
      return track("gemini-3.5-flash-lite", response);
    });
    const judgment = String(judged?.text ?? "").trim();
    const cost = totalCost(aiCalls, "answered");
    res.json({ reply, searches, pending, judgment, checklist, steps: [...steps, "judge"], cost });
  } catch (error) {
    const stopped = error.message === "Too many calls" ? "cap" : "tool error";
    res.status(400).json({ error: error.message, cost: totalCost(aiCalls, stopped) });
  }
});

app.post("/approve", async (req, res) => {
  const { title, content } = req.body;
  const hits = await addNote(title, content);
  res.json({ success: hits.success, message: hits.message });
});

app.post("/reject", async (req, res) => {
  res.json({ success: true, message: "Note rejected", cost: totalCost([], "rejected") });
});

app.listen(3000, () => {
  console.log("API on http://localhost:3000  — open the React app on http://localhost:5173");
});
