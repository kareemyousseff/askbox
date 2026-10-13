import notes from "./notes.json" with { type: "json" };
import fs from "fs";

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function terms(text) {
  return String(text ?? "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}

export function cite(reply, notes) {
  const allowed = new Set(terms(notes.map((note) => note.content).join(" ")));
  const sentences = String(reply).match(/[^.!?]+[.!?]?/g) ?? [];
  const kept = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const words = terms(sentence);
      return words.length > 0 && words.every((word) => allowed.has(word));
    });
  const text = kept.join(" ");
  if (!text) return "";
  const sources = [...new Set(notes.map((note) => note.source).filter(Boolean))];
  if (sources.length === 0) return text;
  return text + " (" + sources.join(", ") + ")";
}

function bm25(query, text, docs) {
  const queryTerms = [...new Set(terms(query))];
  const docsTerms = docs.map((doc) => terms(doc));
  const count = docsTerms.length;
  if (queryTerms.length === 0 || count === 0) return 0;
  const average = docsTerms.reduce((sum, row) => sum + row.length, 0) / count || 1;
  const k1 = 1.2;
  const b = 0.75;
  const textTerms = terms(text);
  const length = textTerms.length || 1;
  let score = 0;
  for (const term of queryTerms) {
    const times = textTerms.filter((word) => word === term).length;
    if (times === 0) continue;
    const docsWithTerm = docsTerms.filter((row) => row.includes(term)).length;
    const rarity = Math.log(1 + (count - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
    const denominator = times + k1 * (1 - b + b * length / average);
    score += rarity * (times * (k1 + 1)) / denominator;
  }
  return score;
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

export async function searchNotes(query, store = notes, embed, rerank) {
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
    return pageChunkOrMiss(question, embed, rerank);
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
  const texts = files.map((file) => file.text);
  const [queryVector] = await embed([query], "RETRIEVAL_QUERY");
  const docVectors = await embed(texts, "RETRIEVAL_DOCUMENT");
  const scored = files.map((file, i) => {
    const keyword = bm25(query, file.text, texts);
    const vector = dot(queryVector, docVectors[i]);
    return { file, keyword, score: keyword + vector };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].keyword === 0) return null;
  return scored[0].file;
}

const pages = [
  { title: "page", source: "page.txt", date: "2026-10-11" },
  { title: "other", source: "other.txt", date: "2024-05-01" },
];

async function rowsForPage(embed) {
  const saved = savedPageRows.get(embed);
  if (saved) return saved;
  const rows = [];
  for (const page of pages) {
    const chunks = chunkText(fs.readFileSync(page.source, "utf8"));
    const vectors = await embed(chunks, "RETRIEVAL_DOCUMENT");
    chunks.forEach((content, index) => {
      rows.push({
        note: { title: page.title, content, source: page.source, date: page.date },
        vector: vectors[index],
      });
    });
  }
  savedPageRows.set(embed, rows);
  return rows;
}

async function pageChunkOrMiss(question, embed, rerank) {
  const miss = {
    success: false,
    message: "No note was close enough. Say I don't know.",
    results: [],
  };
  const source = question.match(/\b[\w.-]+\.txt\b/)?.[0];
  let rows = await rowsForPage(embed);
  if (source) rows = rows.filter((row) => row.note.source === source);
  const [queryVector] = await embed([question], "RETRIEVAL_QUERY");
  const texts = rows.map((row) => row.note.content);
  const scored = rows.map((row) => ({
    note: row.note,
    score: dot(queryVector, row.vector) + bm25(question, row.note.content, texts),
  }));
  scored.sort((a, b) => b.score - a.score);
  if (!rerank) {
    const matched = matchedNotes(scored);
    if (matched.length === 0) return miss;
    return {
      success: true,
      message: "Found matching notes. Use every note in results. Do not answer from only the first one.",
      results: matched.map((row) => row.note),
    };
  }
  const top = scored.filter((row) => row.score >= MIN_SCORE).slice(0, 3);
  if (top.length === 0) return miss;
  const notesInScoreOrder = top.map((row) => row.note);
  const ordered = await rerank(question, notesInScoreOrder);
  const results = Array.isArray(ordered) && ordered.length === notesInScoreOrder.length
    ? ordered
    : notesInScoreOrder;
  return {
    success: true,
    message: "Found matching notes. Use every note in results. Do not answer from only the first one.",
    results,
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
