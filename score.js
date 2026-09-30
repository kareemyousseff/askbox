const cases = [
  { question: "what's my star sign?", expect: "taurus", searched: true },
  { question: "where do I live?", expect: "cairo", searched: true },
  { question: "how old is kareem?", expect: "18", searched: true },
  { question: "what is the capital of france?", exact: "i don't know", searched: true },
  { question: "hello", searched: false, not: "i don't know" },
  { question: "what food do I like?", expect: "cookies", also: "pasta", searched: true },
];

for (const item of cases) {
  const response = await fetch("http://localhost:3000/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: [{ role: "user", content: item.question }],
    }),
  });
  const data = await response.json();
  const reply = String(data.reply ?? "").toLowerCase().trim();
  const searches = data.searches ?? [];
  let ok = true;
  if (item.expect) ok = reply.includes(item.expect);
  if (item.also) ok = ok && reply.includes(item.also);
  if (item.exact) ok = reply.replace(/[.!?]+$/, "") === item.exact;
  if (item.not) ok = ok && !reply.includes(item.not);
  if (item.searched === true) ok = ok && searches.length > 0;
  if (item.searched === false) ok = ok && searches.length === 0;
  console.log(ok ? "pass" : "fail", item.question, data.reply, searches);
}
