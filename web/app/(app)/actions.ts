"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStore } from "@/lib/user/store";

const TickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,12}$/);

export async function toggleWatch(ticker: string, on: boolean, note?: string | null) {
  const t = TickerSchema.parse(ticker);
  const store = await requireStore();
  await store.setWatch(t, on, note ?? null);
  revalidatePath("/watchlist");
  return { ok: true };
}
