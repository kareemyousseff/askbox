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
    const reply = await askGemini(req.body?.message, async (contents) => {
      return ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents,
        config: {
          systemInstruction:
            "You may call searchNotes and addNote. Answer only from notes that searchNotes returns. If a search returns nothing, try one more search with a different word, like the person's name. Only if every search returns nothing, reply exactly: I don't know. Do not use anything else you know.",
          tools: [
            {
              functionDeclarations: [
                {
                  name: "searchNotes",
                  description: "Search Kareem's notes. Returns matching notes or an empty list.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "Words to look for" },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "addNote",
                  description: "Add a new note to Kareem's notes.",
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
    });
    res.json({ reply });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("API on http://localhost:3000  — open the React app on http://localhost:5173");
});
