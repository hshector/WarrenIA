import { NextResponse } from "next/server";

import { getAsset, getLatest, getMeta } from "@/lib/market/source";
import { AuthError, requireStore } from "@/lib/user/store";

export async function GET(_: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    await requireStore();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    throw e;
  }
  const { ticker } = await params;
  const latest = await getLatest();
  const [asset, meta] = await Promise.all([getAsset(latest, ticker), getMeta(latest)]);
  if (!asset) return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  return NextResponse.json(
    { asset, sessions: meta?.sessions ?? [], run_id: latest?.run_id, data_asof: latest?.data_asof },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
