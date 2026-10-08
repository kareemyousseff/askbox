import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import notes from "./notes.json" with { type: "json" };
import { searchNotes } from "./agent-functions.js";

export function createNotesServer(store, embed) {
  const server = new McpServer({ name: "notes", version: "0.1.0" });
  server.registerTool(
    "searchNotes",
    {
      description: "Look up a fact in the notes by meaning.",
      inputSchema: { query: z.string() },
    },
    async ({ query }) => {
      const result = await searchNotes(query, store, embed);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
  return server;
}

export async function connectNotes(store, embed) {
  const server = createNotesServer(store, embed);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "ask-box", version: "0.1.0" });
  await client.connect(clientTransport);
  return client;
}

async function geminiEmbed(texts, taskType) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: texts,
    config: { taskType },
  });
  return response.embeddings.map((item) => item.values);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const server = createNotesServer(notes, geminiEmbed);
  await server.connect(new StdioServerTransport());
}
