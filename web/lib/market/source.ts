import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { supabaseBaseUrl } from "@/lib/supabase/env";

import type { AssetDetail, Backtest, Excluded, FxFile, Latest, Market, Meta, PriceFile, Radar } from "./types";

// Market artifacts are read server-side only, from Supabase Storage (production,
// private bucket + secret key) or from a local directory (development / demo).
// The browser never talks to the data provider nor to the storage directly.

type Source = { kind: "supabase"; url: string; key: string; bucket: string } | { kind: "local"; dir: string } | { kind: "none" };

export function marketSource(): Source {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { kind: "supabase", url: supabaseBaseUrl(url), key, bucket: process.env.SUPABASE_BUCKET || "market" };
  const dir = process.env.WARRENIA_DATA_DIR || (process.env.VERCEL ? "" : path.resolve(process.cwd(), "..", "data"));
  if (dir) return { kind: "local", dir };
  return { kind: "none" };
}

export function storageHeaders(key: string): Record<string, string> {
  // Same as supabase-js: the key in `apikey` and as Bearer (sb_secret_ and legacy JWT keys alike).
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export class StorageError extends Error {
  constructor(readonly status: number) {
    super(`storage ${status}`);
  }
}

// Run artifacts are immutable (versioned by run id): memoise them per server instance.
const memo = new Map<string, unknown>();
const MEMO_MAX = 80;

async function readRaw(p: string): Promise<Buffer | null> {
  const src = marketSource();
  if (src.kind === "none") return null;
  if (src.kind === "local") {
    try {
      return await readFile(/*turbopackIgnore: true*/ path.join(src.dir, "published", p));
    } catch {
      return null;
    }
  }
  const res = await fetch(`${src.url}/storage/v1/object/${src.bucket}/published/${p}`, {
    headers: storageHeaders(src.key),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (res.status === 400) {
    // Storage answers 400 both for "object not found" and for auth problems: tell them apart.
    const body = await res.text();
    if (/not.?found/i.test(body)) return null;
    console.error("market: storage 400", p, body.slice(0, 200));
    throw new StorageError(400);
  }
  if (!res.ok) {
    console.error("market: storage", res.status, p);
    throw new StorageError(res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function readJson<T>(p: string, immutable: boolean): Promise<T | null> {
  if (immutable && memo.has(p)) return memo.get(p) as T;
  const buf = await readRaw(p);
  if (!buf) return null;
  const text = (p.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8");
  const data = JSON.parse(text) as T;
  if (immutable) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
    memo.set(p, data);
  }
  return data;
}

export async function getLatest(): Promise<Latest | null> {
  return readJson<Latest>("latest.json", false);
}

async function inRun<T>(latest: Latest | null, file: string): Promise<T | null> {
  if (!latest) return null;
  // latest.json already proved storage access: a failure here is transient or a corrupt file, never a crash.
  return readJson<T>(`${latest.path}/${file}`, true).catch((e) => {
    console.error("market: read failed", file, e);
    return null;
  });
}

export async function getMeta(latest: Latest | null) {
  return inRun<Meta>(latest, "meta.json");
}
export async function getRadar(latest: Latest | null) {
  return inRun<Radar>(latest, "radar.json.gz");
}
export async function getMarket(latest: Latest | null) {
  return inRun<Market>(latest, "market.json");
}
export async function getExcluded(latest: Latest | null) {
  return inRun<Excluded[]>(latest, "excluded.json.gz");
}

export function shardOf(ticker: string): string {
  const c = ticker.charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "_";
}

export async function getAsset(latest: Latest | null, ticker: string): Promise<AssetDetail | null> {
  const t = ticker.toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(t)) return null;
  const shard = await inRun<Record<string, AssetDetail>>(latest, `assets/${shardOf(t)}.json.gz`);
  return shard?.[t] ?? null;
}

export async function getAssets(latest: Latest | null, tickers: string[]): Promise<Record<string, AssetDetail>> {
  const out: Record<string, AssetDetail> = {};
  await Promise.all(
    [...new Set(tickers.map((t) => t.toUpperCase()))].map(async (t) => {
      const a = await getAsset(latest, t);
      if (a) out[t] = a;
    }),
  );
  return out;
}

function quiet(e: unknown): null {
  console.error("market: read failed", e);
  return null;
}

export async function getBacktest() {
  return readJson<Backtest>("backtest/latest.json", false).catch(quiet);
}

export async function getFx() {
  return readJson<FxFile>("fx/ecb.json", false).catch(quiet);
}

export async function getPriceFile(symbol: string) {
  if (!/^[A-Z0-9.\-]{1,24}$/i.test(symbol)) return null;
  return readJson<PriceFile>(`prices/${symbol.toUpperCase()}.json`, false).catch(quiet);
}

/** Everything a typical page needs, in one call. */
/** Never throws: pages render an empty state, and `error` explains a configuration problem. */
export async function loadMarket() {
  let error: string | null = null;
  const fail = (e: unknown) => {
    if (!error) {
      error =
        e instanceof StorageError && [400, 401, 403].includes(e.status)
          ? `Supabase rechaza la clave secreta de Vercel (${e.status}). Revisa /setup/check.`
          : "No se pudieron leer los datos de mercado. Se reintentará en la próxima carga.";
      console.error("market: load failed", e);
    }
    return null;
  };
  const latest = await getLatest().catch(fail);
  const meta = await getMeta(latest).catch(fail);
  const src = marketSource().kind;
  if (src === "none" && process.env.VERCEL) error = "Falta SUPABASE_SECRET_KEY en Vercel. Revisa /setup/check.";
  return { latest, meta, source: src, error };
}
