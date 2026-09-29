import notes from "./notes.json" with { type: "json" };
import fs from "fs";

export function searchNotes(query, store = notes) {
  const words = String(query ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  if (words.length === 0) {
    return { success: false, message: "No words found" };
  }

  const results = store.notes.filter((note) => {
    const text = `${note.title} ${note.content}`.toLowerCase();
    return words.some((word) => text.includes(word));
  });
  if (results.length === 0) {
    return {
      success: false,
      message:
        "No note had those words. Try a different word. If you already tried, say I don't know.",
      results,
    };
  }
  return {
    success: true,
    message: "Found matching notes. Answer only from these.",
    results,
  };
}
export function addNote(title, content, store = notes) {
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
