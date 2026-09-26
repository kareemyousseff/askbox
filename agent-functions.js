import notes from "./notes.json" with { type: "json" };
import fs from "fs";

export function searchNotes(query, store = notes) {
  const words = String(query ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  if (words.length === 0) {
    return [];
  }

  return store.notes.filter((note) => {
    const text = `${note.title} ${note.content}`.toLowerCase();
    return words.some((word) => text.includes(word));
  });
}
export function addNote(title, content, store = notes) {
  store.notes.push({ title, content });
  if (store === notes) {
    fs.writeFileSync("notes.json", JSON.stringify(notes, null, 2));
  }
  return { success: true };
}
