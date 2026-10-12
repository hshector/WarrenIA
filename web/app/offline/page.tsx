import { Wordmark } from "@/components/shell/brand";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4">
      <Wordmark />
      <h1 className="text-[17px] font-semibold">Offline</h1>
      <p className="t-body">
        WarrenIA does not keep prices or rankings for offline use, so you never see old data presented as current. Try again when you are back online.
      </p>
    </main>
  );
}
