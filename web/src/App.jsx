import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("No reply yet.");
  const [waiting, setWaiting] = useState(false);
  const [turns, setTurns] = useState([]);
  const nextTurns = [...turns, { role: "user", content: message }];

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
        setTurns([
          ...nextTurns,
          { role: "model", content: data.reply, searches: data.searches || [] },
        ]);
        setMessage("");
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
          {turn.searches ? <p>Searches: {turn.searches.join(", ")}</p> : null}
        </div>
      ))}
      <pre>{JSON.stringify(turns, null, 2)}</pre>
    </>
  );
}

export default App;
