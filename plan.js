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
  const text = String(response?.text ?? "")
    .trim()
    .replace(/^```json\s*|\s*```$/g, "");
  const rows = JSON.parse(text);
  return rows.map((row) => ({ item: String(row.item), done: false }));
}
