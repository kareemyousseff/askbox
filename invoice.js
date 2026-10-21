import { Type } from "@google/genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import fs from "fs";

export const invoiceFile = "invoices/saved.json";
export const placeFile = "invoices/place.json";

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

export async function extractInvoice(page, generateContent, callCap = 2) {
  async function callModel(contents) {
    let tries = 0;
    while (tries < callCap) {
      tries += 1;
      try {
        return await generateContent(contents);
      } catch (error) {
        const status = Number(error?.status ?? error?.statusCode);
        if (status === 500 && tries < callCap) continue;
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

export function readPlace(file = placeFile) {
  if (!fs.existsSync(file)) return { done: 0, invoices: [] };
  const place = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    done: place.done ?? 0,
    invoices: Array.isArray(place.invoices) ? place.invoices : [],
  };
}

export async function runBatch(pages, extract, file = placeFile) {
  const place = readPlace(file);
  for (let i = place.done; i < pages.length; i += 1) {
    const invoice = await extract(pages[i]);
    place.invoices.push(invoice);
    place.done = i + 1;
    fs.writeFileSync(file, JSON.stringify({ done: place.done, invoices: place.invoices }));
  }
  return readPlace(file);
}

function sameField(invoice, label, field) {
  if (!invoice) return false;
  if (field === "lineItems") return JSON.stringify(invoice.lineItems) === JSON.stringify(label.lineItems);
  return invoice[field] === label[field];
}

export function fieldReport(before, after, right) {
  const fields = ["vendor", "date", "lineItems", "total"];
  return fields.flatMap((field) => {
    const count = (rows) => right.filter((label) => {
      const row = rows.find((item) => item.document === label.document);
      return sameField(row?.invoice, label, field);
    }).length;
    const first = count(before);
    const second = count(after);
    if (second <= first) return [];
    const document = right.find((label) => {
      const earlier = before.find((item) => item.document === label.document);
      const later = after.find((item) => item.document === label.document);
      return !sameField(earlier?.invoice, label, field) && sameField(later?.invoice, label, field);
    }).document;
    return [{ field, before: first, after: second, document }];
  });
}
