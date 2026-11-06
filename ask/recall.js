export function recall(ranked, right, k) {
  const index = ranked.indexOf(right);
  return index !== -1 && index < k;
}

export function compareRuns(before, after) {
  return before.flatMap((row) => {
    const next = after.find((item) => item.question === row.question);
    const dropped = row.recall - next.recall;
    return dropped > 0 ? [{ question: row.question, dropped }] : [];
  });
}
