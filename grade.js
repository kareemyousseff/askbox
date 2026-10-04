export function grade(task, actual) {
  const got = actual.calls ?? [];
  for (let i = 0; i < task.calls.length; i++) {
    if (got[i] !== task.calls[i]) {
      return { ok: false, missing: task.calls[i] };
    }
  }
  if (got.length !== task.calls.length) {
    return { ok: false, missing: null };
  }
  const reply = String(actual.reply ?? "").toLowerCase();
  const textOk = reply.includes(String(task.text).toLowerCase());
  return { ok: textOk, missing: null };
}
