"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Algo no ha ido bien</h1>
          <p style={{ color: "#6b6966" }}>No se pudo cargar WarrenIA.</p>
          <p>
            <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 999, border: 0, background: "#f2611d", color: "#fff", fontWeight: 600 }}>
              Reintentar
            </button>{" "}
            <a href="/setup/check" style={{ color: "#d9500f" }}>Comprobar configuración</a>
          </p>
        </div>
      </body>
    </html>
  );
}
