import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("No reply yet.");
  const [waiting, setWaiting] = useState(false);
  const [turns, setTurns] = useState(()=>{
    const storedTurns = localStorage.getItem("turns");
    return storedTurns ? JSON.parse(storedTurns) : [];
  });
  const nextTurns = [...turns, { role: "user", content: message }];
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState("Vendor: Acme\nDate: 2026-01-02\nPaper 4");
  const [invoiceText, setInvoiceText] = useState("");
  const [reading, setReading] = useState(false);

  async function onApprove(pending) {
    const response = await fetch("http://localhost:3000/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: pending.title, content: pending.content }),
    });
    await response.json();
    setReply("Note added");
    setTurns((current) => {
      const updated = current.map((turn) =>
        turn.pending?.title === pending.title ? { ...turn, pending: null } : turn,
      );
      localStorage.setItem("turns", JSON.stringify(updated));
      return updated;
    });
  }
  async function onReject(pending) {
    const response = await fetch("http://localhost:3000/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: pending.title, content: pending.content }),
    });
    const data = await response.json();
    setReply("Note cancelled");
    setTurns((current) => {
      const updated = current.map((turn) =>
        turn.pending?.title === pending.title
          ? {
              ...turn,
              pending: null,
              cost: {
                ...(turn.cost ?? { tokens: 0, dollars: 0, aiCalls: 0 }),
                stopped: data.cost?.stopped ?? "rejected",
              },
            }
          : turn,
      );
      localStorage.setItem("turns", JSON.stringify(updated));
      return updated;
    });
  }
  async function onSubmit(event) {
    event.preventDefault();
    setWaiting(true);
    setReply("Asking...");
    try {
      const response = await fetch("http://localhost:3000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextTurns }),
      });
      const data = await response.json();
      setReply(data.reply || data.error || "No reply");
      if (data.reply || data.error) {
        const updatedTurns = [
          ...nextTurns,
          {
            role: "model",
            content: data.reply || data.error,
            searches: data.searches || [],
            pending: data.pending || false,
            judgment: data.judgment || "",
            checklist: data.checklist || [],
            steps: data.steps || [],
            trace: data.trace || [],
            latency: data.latency || [],
            cost: data.cost || null,
            failure: data.failure || null,
          },
        ];
        setTurns(updatedTurns);
        localStorage.setItem("turns", JSON.stringify(updatedTurns));
        setMessage("");
        setPending(data.pending || false);
      }
    } catch {
      setReply("Could not reach the server.");
    } finally {
      setWaiting(false);
    }
  }

  async function onInvoice(event) {
    event.preventDefault();
    setReading(true);
    setInvoiceText("Reading...");
    try {
      const response = await fetch("http://localhost:3000/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      });
      const data = await response.json();
      setInvoiceText(data.error ? data.error : JSON.stringify({ invoice: data.invoice, reply: data.reply, failure: data.failure }, null, 2));
    } catch {
      setInvoiceText("Could not reach the server.");
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <h1>Ask box</h1>
      <p>
        Type something. Your server sends it to Gemini and prints the reply.
      </p>
      <form onSubmit={onSubmit}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Say hello"
        />
        <button type="submit" disabled={waiting}>
          {waiting ? "Waiting..." : "Ask"}
        </button>
      </form>
      <pre>{reply}</pre>
      <form onSubmit={onInvoice}>
        <textarea
          value={page}
          onChange={(event) => setPage(event.target.value)}
          placeholder="Paste an invoice"
        />
        <button type="submit" disabled={reading}>
          {reading ? "Reading..." : "Extract"}
        </button>
      </form>
      <pre>{invoiceText}</pre>
      {turns.map((turn, index) => (
        <div key={index}>
          <p>
            {turn.role === "user" ? "You" : "Gemini"}: {turn.content}
          </p>
          {turn.steps?.length ? <p>Steps: {turn.steps.join(" → ")}</p> : null}
          {turn.checklist?.length ? (
            <p>Plan: {turn.checklist.map((row) => row.item).join(", ")}</p>
          ) : null}
          {turn.searches ? <p>Searches: {turn.searches.join(", ")}</p> : null}
          {turn.trace?.length ? (
            <p>
              Trace: {turn.trace.map((row) => `${row.item} -> ${row.search}: ${row.note}${row.blocked ? " blocked" : ""}${row.check ? ` (${row.check})` : ""}`).join(" | ")}
            </p>
          ) : null}
          {turn.latency?.length ? (
            <p>
              Trace: {turn.latency.map((row) => `${row.tries} ${row.tries === 1 ? "try" : "tries"}, ${row.ms}ms`).join(" | ")}
            </p>
          ) : null}
          {turn.judgment ? <p>Judge: {turn.judgment}</p> : null}
          {turn.cost ? (
            <p>
              Cost: {turn.cost.tokens} tokens, ${Number(turn.cost.dollars).toFixed(6)} paid-tier estimate, {turn.cost.stopped}
            </p>
          ) : null}
          {turn.failure ? <p>Cap: {turn.failure.failed}, {turn.failure.model}</p> : null}
          {turn.pending ? <p>Pending: {turn.pending.title}</p> : null}
          {turn.pending ? <p>Pending: {turn.pending.content}</p> : null}
          {turn.pending ? <button onClick={() => onApprove(turn.pending) } >Approve</button> : null}
          {turn.pending ? <button onClick={() => onReject(turn.pending)} >Reject</button> : null}
        </div>
      ))}
      <pre>{JSON.stringify(turns, null, 2)}</pre>
    </>
  );
}

export default App;
