import notes from "./notes.json" with { type: "json" };
import fs from "fs";

export function searchNotes(query) {
  const needle = String(query ?? "").toLowerCase().trim();
  if (!needle) {
    return [];
  }

  return notes.notes.filter((note) =>
    `${note.title} ${note.content}`.toLowerCase().includes(needle),
  );
}
export function addNote(title, content) {
  notes.notes.push({ title, content });
  fs.writeFileSync("notes.json", JSON.stringify(notes, null, 2));
  return { success: true };
}
