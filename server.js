import express from "express";
import { GoogleGenAI } from "@google/genai";
import { askGemini } from "./ask.js";

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
  try {
    const { reply, searches } = await askGemini(req.body?.message, async (contents) => {
      return ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction:
            "Answer a fact only from searchNotes results. If results has more than one note, the answer must include every note. If searchNotes returns success false, reply exactly I don't know. If they just say hello, reply with a short greeting. Do not search. If addNote returns success true, say the note was saved. Do not answer I don't know for that.",
          tools: [
            {
              functionDeclarations: [
                {
                  name: "searchNotes",
                  description: "Look up a fact in Kareem's notes by meaning. Call this when the user asks for a fact. Do not call it for a greeting like hello. The result is { success, message, results }. results holds every note that was close enough, best first. The answer must include every note in results. If success is false, reply exactly I don't know.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "The question to match against the notes" },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "addNote",
                  description: "Save a new note when the user asks to remember or add something. The result is { success, message }. If success is true, tell the user the note was saved. If success is false, tell the user the message.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "The title of the note" },
                      content: { type: "string", description: "The content of the note" },
                    },
                    required: ["title", "content"],
                  },
                },
              ],
            },
          ],
        },
      });
    }, undefined, async (texts, taskType) => {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: texts,
        config: { taskType },
      });
      return response.embeddings.map((item) => item.values);
    });
    res.json({ reply, searches });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("API on http://localhost:3000  — open the React app on http://localhost:5173");
});
