import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import fs from "fs";

export const shopFile = "shop/orders.json";

const ShopState = Annotation.Root({
  ticket: Annotation(),
  order: Annotation(),
  refund: Annotation(),
});

function orderId(ticket) {
  const match = String(ticket).match(/order\s+(\d+)/i);
  if (!match) return null;
  return Number(match[1]);
}

export function readOrders(file = shopFile) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export async function dryRefund(ticket, file = shopFile) {
  const orders = readOrders(file);
  const order = orders.find((item) => item.id === orderId(ticket)) ?? null;

  function preview(state) {
    return { refund: { amount: state.order.amount } };
  }

  const app = new StateGraph(ShopState)
    .addNode("preview", preview)
    .addEdge(START, "preview")
    .addEdge("preview", END)
    .compile();

  const result = { ticket, order, refund: null };
  const stream = await app.stream({ ticket, order, refund: null }, { streamMode: "updates" });
  for await (const update of stream) {
    for (const patch of Object.values(update)) Object.assign(result, patch);
  }
  return {
    refund: result.refund,
    order: result.order,
    pending: result.order ? { id: result.order.id, amount: result.refund.amount } : null,
  };
}

export function approveRefund(id, file = shopFile) {
  const orders = readOrders(file);
  const next = orders.map((order) => order.id === id ? { ...order, status: "refunded" } : order);
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export function rejectRefund(file = shopFile) {
  return readOrders(file);
}
