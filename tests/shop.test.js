import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { approveRefund, dryRefund, rejectRefund, scoreRefund } from "../shop.js";

describe("shop", () => {
  it("returns the refund amount and leaves the order paid", async () => {
    const file = join(tmpdir(), `shop-${Date.now()}.json`);
    const orders = [{ id: 42, status: "paid", amount: 20 }];
    writeFileSync(file, JSON.stringify(orders, null, 2));
    const before = readFileSync(file, "utf8");

    const result = await dryRefund("refund order 42, it arrived broken.", file);

    expect(result.refund).toEqual({ amount: 20 });
    expect(result.order).toEqual({ id: 42, status: "paid", amount: 20 });
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(result.pending).toEqual({ id: 42, amount: 20, key: "refund-42" });
  });

  it("leaves the order paid when the refund is rejected", () => {
    const file = join(tmpdir(), `shop-reject-${Date.now()}.json`);
    const orders = [{ id: 42, status: "paid", amount: 20 }];
    writeFileSync(file, JSON.stringify(orders, null, 2));
    const before = readFileSync(file, "utf8");

    expect(rejectRefund(file)).toEqual(orders);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("moves the amount once for the same refund key", () => {
    const file = join(tmpdir(), `shop-approve-${Date.now()}.json`);
    const pending = { id: 42, amount: 20, key: "refund-42" };
    writeFileSync(file, JSON.stringify([{ id: 42, status: "paid", amount: 20 }], null, 2));

    const first = approveRefund(pending, file);
    const second = approveRefund(pending, file);

    expect(first[0].amount).toBe(0);
    expect(second[0].amount).toBe(0);
    expect(second[0].trace).toEqual([
      { key: "refund-42", before: 20, after: 0 },
      { key: "refund-42", before: 0, after: 0 },
    ]);
  });

  it("checks order 42 even when another order is still paid", () => {
    const file = join(tmpdir(), `shop-score-${Date.now()}.json`);
    const paid = [
      { id: 7, status: "paid", amount: 5 },
      { id: 42, status: "paid", amount: 20 },
    ];
    writeFileSync(file, JSON.stringify(paid, null, 2));

    expect(scoreRefund("refunded", 42, file)).toBe("Order 42 is paid.");

    const refunded = [
      { id: 7, status: "paid", amount: 5 },
      { id: 42, status: "refunded", amount: 0 },
    ];
    writeFileSync(file, JSON.stringify(refunded, null, 2));
    expect(scoreRefund("refunded", 42, file)).toBe(null);
  });
});
