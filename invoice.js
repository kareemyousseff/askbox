import { Type } from "@google/genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const InvoiceState = Annotation.Root({
  page: Annotation(),
  invoice: Annotation(),
  reply: Annotation(),
});

export const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    vendor: { type: Type.STRING },
    date: { type: Type.STRING },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          amount: { type: Type.NUMBER },
        },
      },
    },
    total: { type: Type.NUMBER },
  },
};

function totalOnPage(page) {
  const line = String(page).match(/^total\s*:\s*(\d+(?:\.\d+)?)\s*$/im);
  if (!line) return null;
  return Number(line[1]);
}

function replyFor(invoice) {
  const items = invoice.lineItems.map((item) => `${item.name} ${item.amount}`).join(", ");
  const text = [invoice.vendor, invoice.date, items].filter(Boolean).join(". ");
  if (invoice.total == null) return text;
  return `${text}. Total ${invoice.total}`;
}

export async function extractInvoice(page, generateContent) {
  async function fill() {
    const response = await generateContent([
      {
        role: "user",
        parts: [{ text: "Fill the invoice from this page. Use null when a field is missing.\n" + page }],
      },
    ]);
    const cleaned = String(response?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    const invoice = {
      vendor: parsed.vendor ?? null,
      date: parsed.date ?? null,
      lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
      total: totalOnPage(page),
    };
    return { invoice, reply: replyFor(invoice) };
  }

  const app = new StateGraph(InvoiceState)
    .addNode("fill", fill)
    .addEdge(START, "fill")
    .addEdge("fill", END)
    .compile();

  const result = { page, invoice: null, reply: "" };
  const stream = await app.stream({ page, invoice: null, reply: "" }, { streamMode: "updates" });
  for await (const update of stream) {
    for (const patch of Object.values(update)) Object.assign(result, patch);
  }
  return { invoice: result.invoice, reply: result.reply };
}
