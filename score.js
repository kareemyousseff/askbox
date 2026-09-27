const cases = [
  { question: "how old is kareem?", expect: "18" },
  { question: "what does he do for work?", expect: "software engineer" },
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
  const reply = String(data.reply ?? "").toLowerCase();
  const ok = reply.includes(item.expect);
  console.log(ok ? "pass" : "fail", item.question, data.reply);
}
