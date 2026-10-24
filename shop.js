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
    pending: result.order ? { id: result.order.id, amount: result.refund.amount, key: `refund-${result.order.id}` } : null,
  };
}

export function approveRefund(pending, file = shopFile) {
  const orders = readOrders(file);
  const next = orders.map((order) => {
    if (order.id !== pending.id) return order;
    const trace = Array.isArray(order.trace) ? order.trace : [];
    const seen = trace.some((row) => row.key === pending.key);
    const before = order.amount;
    const after = seen ? before : before - pending.amount;
    return {
      ...order,
      status: seen ? order.status : "refunded",
      amount: after,
      trace: [...trace, { key: pending.key, before, after }],
    };
  });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export function rejectRefund(file = shopFile) {
  return readOrders(file);
}

export function scoreRefund(responseText, orderId, file = shopFile) {
  if (!String(responseText).includes("refunded")) return null;
  const order = readOrders(file).find((item) => item.id === orderId);
  if (!order) return `Order ${orderId} is missing.`;
  if (order.status === "refunded") return null;
  return `Order ${order.id} is ${order.status}.`;
}
