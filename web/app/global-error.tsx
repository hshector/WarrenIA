"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#6b6966" }}>WarrenIA could not load.</p>
          <p>
            <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 999, border: 0, background: "#527f62", color: "#fff", fontWeight: 600 }}>
              Try again
            </button>{" "}
            <a href="/setup/check" style={{ color: "#44705a" }}>Check the setup</a>
          </p>
        </div>
      </body>
    </html>
  );
}
