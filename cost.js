// Paid-tier prices from https://ai.google.dev/gemini-api/docs/pricing (2026-10-10).
// Standard tier, per 1,000,000 tokens. Output includes thinking tokens.
// Free tier is $0. This estimate uses the paid rates so two runs can be compared.
const PER_MILLION = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

export function priceCall(model, usage) {
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens =
    (usage?.candidatesTokenCount ?? usage?.responseTokenCount ?? 0) +
    (usage?.thoughtsTokenCount ?? 0);
  const rates = PER_MILLION[model] ?? { input: 0, output: 0 };
  const dollars = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return { model, inputTokens, outputTokens, dollars };
}

export function budget(run, calls, cap) {
  const spent = calls.find((call) => call.inputTokens + call.outputTokens > cap);
  if (!spent) return null;
  return { question: run.question, recall: run.recall, failed: "cap", model: spent.model };
}

export function totalCost(aiCalls, stopped) {
  return {
    tokens: aiCalls.reduce((sum, aiCall) => sum + aiCall.inputTokens + aiCall.outputTokens, 0),
    dollars: aiCalls.reduce((sum, aiCall) => sum + aiCall.dollars, 0),
    aiCalls: aiCalls.length,
    stopped,
  };
}
