import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ background: "#0f172a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "white", textAlign: "center" }}>
        <h1 style={{ color: "#fbbf24" }}>ChiefAllocator</h1>
        <p>PHI Decision Tool — Loading test</p>
        <button onClick={() => setCount(c => c + 1)} style={{ padding: "10px 20px", background: "#fbbf24", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Clicked {count} times
        </button>
      </div>
    </div>
  );
}
