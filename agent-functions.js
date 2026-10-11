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
const savedRows = new WeakMap();
const savedPageRows = new WeakMap();

function matchedNotes(scored) {
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < MIN_SCORE) return [];
  return ranked.filter(
    (row) => row.score >= MIN_SCORE && best.score - row.score <= 0.05,
  );
}

async function rowsFor(store, embed) {
  const saved = savedRows.get(store);
  if (saved?.length === store.notes.length) return saved;
  const texts = store.notes.map((note) => `${note.title} ${note.content}`);
  const vectors = await embed(texts, "RETRIEVAL_DOCUMENT");
  const rows = store.notes.map((note, i) => ({ note, vector: vectors[i] }));
  savedRows.set(store, rows);
  return rows;
}

export async function searchNotes(query, store = notes, embed) {
  const question = String(query ?? "").trim();
  if (!question) {
    return { success: false, message: "No words found" };
  }
  if (!embed) {
    throw new Error("embed is required");
  }

  const rows = await rowsFor(store, embed);
  const [queryVector] = await embed([question], "RETRIEVAL_QUERY");
  const scored = rows.map((row) => ({
    note: row.note,
    score: dot(queryVector, row.vector),
  }));
  console.log(
    scored.map((row) => ({ title: row.note.title, score: row.score })),
  );
  scored.sort((a, b) => b.score - a.score);
  const matched = matchedNotes(scored);
  if (matched.length === 0) {
    return pageChunkOrMiss(question, embed);
  }
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

async function rowsForPage(embed) {
  const saved = savedPageRows.get(embed);
  if (saved) return saved;
  const chunks = chunkText(fs.readFileSync("page.txt", "utf8"));
  const vectors = await embed(chunks, "RETRIEVAL_DOCUMENT");
  const rows = chunks.map((content, index) => ({
    note: { title: "page", content },
    vector: vectors[index],
  }));
  savedPageRows.set(embed, rows);
  return rows;
}

async function pageChunkOrMiss(question, embed) {
  const miss = {
    success: false,
    message: "No note was close enough. Say I don't know.",
    results: [],
  };
  const rows = await rowsForPage(embed);
  const [queryVector] = await embed([question], "RETRIEVAL_QUERY");
  const scored = rows.map((row) => ({
    note: row.note,
    score: dot(queryVector, row.vector),
  }));
  const matched = matchedNotes(scored);
  if (matched.length === 0) return miss;
  return {
    success: true,
    message: "Found matching notes. Use every note in results. Do not answer from only the first one.",
    results: matched.map((row) => row.note),
  };
}

export function chunkText(text, size = 127, overlap = 20) {
  const step = size - overlap;
  const chunks = [];
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}

export async function searchPage(query, text, embed) {
  const files = chunkText(text).map((piece, index) => ({ name: String(index), text: piece }));
  const best = await searchDocs(query, files, embed);
  return best?.text ?? null;
}

export async function answerFromDocs(query, files, embed, generateContent) {
  const file = await searchDocs(query, files, embed);
  if (!file) return "I don't know";
  const response = await generateContent([
    { role: "user", parts: [{ text: file.text }] },
  ]);
  return String(response?.text ?? "").trim();
}
