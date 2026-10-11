import { NextResponse } from "next/server";

import { getLogo, StorageError } from "@/lib/market/source";
import { AuthError, requireStore } from "@/lib/user/store";

// Logos are fetched once by the engine and served from our storage: the browser
// never talks to the logo provider. Missing logos are a normal 404 (the avatar
// falls back to initials) and are cached for a day so they are not re-requested.
export async function GET(_: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    await requireStore();
  } catch (e) {
    if (e instanceof AuthError) return new NextResponse(null, { status: 401 });
    throw e;
  }
  const { ticker } = await params;
  let png: Buffer | null;
  try {
    png = await getLogo(ticker.toUpperCase());
  } catch (e) {
    if (e instanceof StorageError) return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    throw e;
  }
  if (!png) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff" },
  });
}
