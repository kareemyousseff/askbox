import { Type } from "@google/genai";

export const checklistSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      item: { type: Type.STRING },
    },
    required: ["item"],
  },
};

export function readChecklist(text) {
  const cleaned = String(text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
  const rows = JSON.parse(cleaned);
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.item !== "string" || row.item.trim() === "")) {
    throw new Error("Checklist did not match the schema");
  }
  return rows.map((row) => ({ item: row.item, done: false }));
}

export async function plan(question, generateContent) {
  const response = await generateContent([
    {
      role: "user",
      parts: [
        {
          text:
            'Split this question into checklist items. Reply with a JSON array only. Each object is {"item":"short name"}.\n' +
            question,
        },
      ],
    },
  ]);
  return readChecklist(response?.text);
}
