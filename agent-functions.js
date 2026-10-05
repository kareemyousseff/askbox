import notes from "./notes.json" with { type: "json" };
import fs from "fs";

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Measured with gemini-embedding-001 on these notes (30 Sep 2026):
// "what's my star sign" -> taurus 0.679, "where do I live" -> cairo 0.746,
// "how old am I" -> age 0.653, "zzz" -> best note 0.628.
const MIN_SCORE = 0.64;

export async function searchNotes(query, store = notes, embed) {
  const question = String(query ?? "").trim();
  if (!question) {
    return { success: false, message: "No words found" };
  }
  if (!embed) {
    throw new Error("embed is required");
  }

  const texts = store.notes.map((note) => `${note.title} ${note.content}`);
  const [queryVector] = await embed([question], "RETRIEVAL_QUERY");
  const noteVectors = await embed(texts, "RETRIEVAL_DOCUMENT");
  const scored = store.notes.map((note, i) => ({
    note,
    score: dot(queryVector, noteVectors[i]),
  }));
  console.log(
    scored.map((row) => ({ title: row.note.title, score: row.score })),
  );
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < MIN_SCORE) {
    return {
      success: false,
      message: "No note was close enough. Say I don't know.",
      results: [],
    };
  }
  const matched = scored.filter(
    (row) => row.score >= MIN_SCORE && best.score - row.score <= 0.05,
  );
  return {
    success: true,
    message: "Found matching notes. Use every note in results. Do not answer from only the first one.",
    results: matched.map((row) => row.note),
  };
}
export async function addNote(title, content, store = notes) {
  if (!title || !content) {
    return { success: false, message: "Title and content are required" };
  }
  const newNote = { title, content };
  store.notes.push(newNote);
  if (store === notes) {
    fs.writeFileSync("notes.json", JSON.stringify(notes, null, 2));
  }
  return { success: true, message: "Note added successfully" };
}

export async function searchDocs(query, files, embed) {
  const words = String(query ?? "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const texts = files.map((file) => file.text);
  const [queryVector] = await embed([query], "RETRIEVAL_QUERY");
  const docVectors = await embed(texts, "RETRIEVAL_DOCUMENT");
  const scored = files.map((file, i) => {
    const text = file.text.toLowerCase();
    const keyword = words.filter((word) => text.includes(word)).length;
    const vector = dot(queryVector, docVectors[i]);
    return { file, keyword, score: keyword + vector };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].keyword === 0) return null;
  return scored[0].file;
}

export async function answerFromDocs(query, files, embed, generateContent) {
  const file = await searchDocs(query, files, embed);
  if (!file) return "I don't know";
  const response = await generateContent([
    { role: "user", parts: [{ text: file.text }] },
  ]);
  return String(response?.text ?? "").trim();
}
