import { Type } from "@google/genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import fs from "fs";

export const invoiceFile = "invoices/saved.json";

const InvoiceState = Annotation.Root({
  page: Annotation(),
  invoice: Annotation(),
  reply: Annotation(),
  failure: Annotation(),
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

function sumFailure(invoice) {
  if (invoice.total == null) return null;
  const sum = invoice.lineItems.reduce((total, item) => total + Number(item.amount), 0);
  if (sum === invoice.total) return null;
  return `Line items add up to ${sum}. Total is ${invoice.total}.`;
}

function replyFor(invoice) {
  const items = invoice.lineItems.map((item) => `${item.name} ${item.amount}`).join(", ");
  const text = [invoice.vendor, invoice.date, items].filter(Boolean).join(". ");
  if (invoice.total == null) return text;
  return `${text}. Total ${invoice.total}`;
}

export async function extractInvoice(page, generateContent) {
  async function callModel(contents) {
    let tries = 0;
    while (tries < 2) {
      tries += 1;
      try {
        return await generateContent(contents);
      } catch (error) {
        const status = Number(error?.status ?? error?.statusCode);
        if (status === 500 && tries < 2) continue;
        throw error;
      }
    }
  }

  async function fill() {
    const response = await callModel([
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

  function check(state) {
    return { failure: sumFailure(state.invoice) };
  }

  const app = new StateGraph(InvoiceState)
    .addNode("fill", fill)
    .addNode("check", check)
    .addEdge(START, "fill")
    .addEdge("fill", "check")
    .addEdge("check", END)
    .compile();

  const result = { page, invoice: null, reply: "", failure: null };
  const stream = await app.stream({ page, invoice: null, reply: "", failure: null }, { streamMode: "updates" });
  for await (const update of stream) {
    for (const patch of Object.values(update)) Object.assign(result, patch);
  }
  return {
    invoice: result.invoice,
    reply: result.reply,
    failure: result.failure,
    pending: result.failure ? result.invoice : null,
  };
}

export function readInvoices(file = invoiceFile) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function approveInvoice(invoice, file = invoiceFile) {
  const rows = readInvoices(file);
  rows.push(invoice);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  return rows;
}

export function rejectInvoice(file = invoiceFile) {
  return readInvoices(file);
}
