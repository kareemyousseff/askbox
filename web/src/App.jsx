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
    await response.json();
    setReply("Note cancelled");
    setTurns((current) => {
      const updated = current.map((turn) =>
        turn.pending?.title === pending.title ? { ...turn, pending: null } : turn,
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
      if (data.reply) {
        const updatedTurns = [
          ...nextTurns,
          {
            role: "model",
            content: data.reply,
            searches: data.searches || [],
            pending: data.pending || false,
            judgment: data.judgment || "",
            checklist: data.checklist || [],
            steps: data.steps || [],
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
          {turn.judgment ? <p>Judge: {turn.judgment}</p> : null}
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
