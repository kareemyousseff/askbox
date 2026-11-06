export async function judge(reply, rubric, generateContent) {
  const response = await generateContent([
    { role: "user", parts: [{ text: rubric + "\n" + reply }] },
  ]);
  return response;
}
