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
  });
});
