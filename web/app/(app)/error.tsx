"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-3 py-10 text-center">
      <h1 className="text-[22px] font-bold">Algo no ha ido bien</h1>
      <p className="text-[15px] text-ink-2">{error.message && !error.digest ? error.message : "No se pudo cargar esta pantalla."}</p>
      <div className="mt-2 flex justify-center gap-3">
        <button onClick={reset} className="tap rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-ink">
          Reintentar
        </button>
        <a href="/setup/check" className="tap rounded-full bg-surface-3 px-5 py-2.5 text-[15px] font-semibold text-ink">
          Comprobar configuración
        </a>
      </div>
    </div>
  );
}
