import { Wordmark } from "@/components/shell/brand";

export const metadata = { title: "Sin conexión" };

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4">
      <Wordmark />
      <h1 className="text-[17px] font-semibold">Sin conexión</h1>
      <p className="t-body">
        WarrenIA no guarda precios ni rankings para uso sin conexión: así nunca verás datos antiguos presentados como actuales. Vuelve a intentarlo cuando
        tengas red.
      </p>
    </main>
  );
}
