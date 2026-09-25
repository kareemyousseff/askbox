import notes from "./notes.json" with { type: "json" };
import fs from "fs";

export function searchNotes(query, store = notes) {
  const needle = String(query ?? "").toLowerCase().trim();
  if (!needle) {
    return [];
  }

  return store.notes.filter((note) =>
    `${note.title} ${note.content}`.toLowerCase().includes(needle),
  );
}
export function addNote(title, content, store = notes) {
  store.notes.push({ title, content });
  if (store === notes) {
    fs.writeFileSync("notes.json", JSON.stringify(notes, null, 2));
  }
  return { success: true };
}
