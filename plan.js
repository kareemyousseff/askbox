import { Type } from "@google/genai";

export const checklistSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      item: { type: Type.STRING },
      save: { type: Type.STRING },
    },
  },
};

export function readChecklist(text) {
  const cleaned = String(text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
  const rows = JSON.parse(cleaned);
  if (!Array.isArray(rows)) throw new Error("Checklist did not match the schema");
  if (rows.length === 1 && typeof rows[0]?.save === "string" && rows[0].save.trim() && rows[0].item == null) {
    return { save: rows[0].save.trim() };
  }
  if (rows.some((row) => typeof row?.item !== "string" || row.item.trim() === "")) {
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
            'Split this question into checklist items. Reply with a JSON array only. Each object is {"item":"short name"}. If the user is asking to store a fact, return one object {"save":"the fact"} and no item. A message that only states a fact is not a save.\n' +
            question,
        },
      ],
    },
  ]);
  return readChecklist(response?.text);
}
