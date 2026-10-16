export function recall(ranked, right, k) {
  const index = ranked.indexOf(right);
  return index !== -1 && index < k;
}
