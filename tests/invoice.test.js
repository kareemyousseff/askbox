import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { approveInvoice, extractInvoice, fieldReport, readPlace, rejectInvoice, runBatch } from "../invoice.js";

const page = readFileSync("invoices/missing-total.txt", "utf8");

describe("invoice", () => {
  it("leaves the total null when the page has no total", async () => {
    const result = await extractInvoice(page, async () => ({
      text: JSON.stringify({
        vendor: "Acme",
        date: "2026-01-02",
        lineItems: [{ name: "paper", amount: 4 }],
        total: 99,
      }),
    }));

    expect(result.invoice).toEqual({
      vendor: "Acme",
      date: "2026-01-02",
      lineItems: [{ name: "paper", amount: 4 }],
      total: null,
    });
    expect(result.reply.includes("99")).toBe(false);
    expect(result.failure).toBe(null);
    expect(result.pending).toBe(null);
  });

  it("fails before a retry when the line items do not add up to the total", async () => {
    const badPage = readFileSync("invoices/bad-total.txt", "utf8");
    let calls = 0;
    const result = await extractInvoice(badPage, async () => {
      calls += 1;
      return {
        text: JSON.stringify({
          vendor: "Acme",
          date: "2026-01-02",
          lineItems: [{ name: "paper", amount: 4 }],
          total: 99,
        }),
      };
    });

    expect(calls).toBe(1);
    expect(result.failure).toBe("Line items add up to 4. Total is 10.");
    expect(result.pending).toEqual(result.invoice);

    const file = join(tmpdir(), `invoice-${Date.now()}.json`);
    writeFileSync(file, "[]");
    const before = readFileSync(file, "utf8");
    rejectInvoice(file);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(approveInvoice(result.pending, file)).toEqual([result.invoice]);
  });

  it("retries a 500 once and keeps the invoice from the second call", async () => {
    let calls = 0;
    const result = await extractInvoice(page, async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("server");
        error.status = 500;
        throw error;
      }
      return {
        text: JSON.stringify({
          vendor: "Acme",
          date: "2026-01-02",
          lineItems: [{ name: "paper", amount: 4 }],
          total: 99,
        }),
      };
    });

    expect(calls).toBe(2);
    expect(result.invoice.vendor).toBe("Acme");
    expect(result.invoice.total).toBe(null);
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    await expect(extractInvoice(page, async () => {
      calls += 1;
      const error = new Error("bad request");
      error.status = 400;
      throw error;
    })).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("starts at the next invoice after a kill", async () => {
    const file = join(tmpdir(), `place-${Date.now()}.json`);
    const pages = ["Acme", "Beta", "Cairo"];
    const calls = [];
    let kill = true;

    await expect(runBatch(pages, async (page) => {
      if (page === "Beta" && kill) throw new Error("killed");
      calls.push(page);
    }, file)).rejects.toThrow("killed");

    expect(calls).toEqual(["Acme"]);
    expect(readPlace(file)).toEqual({ done: 1 });

    calls.length = 0;
    kill = false;
    const place = await runBatch(pages, async (page) => {
      calls.push(page);
    }, file);

    expect(calls).toEqual(["Beta", "Cairo"]);
    expect(place).toEqual({ done: 3 });
  });

  it("counts the boxes the retry filled", async () => {
    const bills = [
      ["Acme", "2026-01-02", "Paper", 4],
      ["Beta", "2026-01-03", "Pen", 2],
      ["Cairo", "2026-01-04", "Book", 7],
      ["Delta", "2026-01-05", "Tape", 3],
      ["Echo", "2026-01-06", "Ink", 5],
      ["Foxtrot", "2026-01-07", "Clip", 1],
      ["Gulf", "2026-01-08", "Pad", 6],
      ["Hotel", "2026-01-09", "Lamp", 8],
    ].map(([vendor, date, item, amount]) => ({
      document: vendor,
      page: `Vendor: ${vendor}\nDate: ${date}\n${item} ${amount}\nTotal: ${amount}`,
      vendor,
      date,
      lineItems: [{ name: item, amount }],
      total: amount,
    }));

    async function run(callCap) {
      const rows = [];
      for (const bill of bills) {
        let calls = 0;
        try {
          const result = await extractInvoice(bill.page, async () => {
            calls += 1;
            if (bill.document === "Beta" && calls === 1) {
              const error = new Error("server");
              error.status = 500;
              throw error;
            }
            return {
              text: JSON.stringify({
                vendor: bill.vendor,
                date: bill.date,
                lineItems: bill.lineItems,
                total: bill.total,
              }),
            };
          }, callCap);
          rows.push({ document: bill.document, invoice: result.invoice });
        } catch {
          rows.push({ document: bill.document, invoice: null });
        }
      }
      return rows;
    }

    const before = await run(1);
    const after = await run(2);
    expect(fieldReport(before, after, bills)).toEqual([
      { field: "vendor", before: 7, after: 8, document: "Beta" },
      { field: "date", before: 7, after: 8, document: "Beta" },
      { field: "lineItems", before: 7, after: 8, document: "Beta" },
      { field: "total", before: 7, after: 8, document: "Beta" },
    ]);
  });
});
