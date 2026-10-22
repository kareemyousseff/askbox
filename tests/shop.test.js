import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { dryRefund } from "../shop.js";

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
  });
});
