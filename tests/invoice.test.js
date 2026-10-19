import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { extractInvoice } from "../invoice.js";

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
});
