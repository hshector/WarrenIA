import { NextResponse } from "next/server";

import { AuthError, requireStore } from "@/lib/user/store";

// Triggers the GitHub Actions market-data workflow (workflow_dispatch).
// The token lives only on the server (fine-grained PAT: Actions read/write on this repo).
const COOLDOWN_MIN = 15;

function gh() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO; // owner/name
  if (!token || !repo) return null;
  return {
    repo,
    workflow: process.env.GITHUB_WORKFLOW || "market-data.yml",
    ref: process.env.GITHUB_REF_NAME || "main",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  };
}

async function lastRun(g: NonNullable<ReturnType<typeof gh>>) {
  const r = await fetch(`https://api.github.com/repos/${g.repo}/actions/workflows/${g.workflow}/runs?per_page=1`, { headers: g.headers, cache: "no-store" });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  return j.workflow_runs?.[0] ?? null;
}

async function guard() {
  try {
    await requireStore();
    return null;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ message: "Not authorised" }, { status: 401 });
    throw e;
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const g = gh();
  if (!g) return NextResponse.json({ configured: false });
  try {
    const run = await lastRun(g);
    return NextResponse.json({ configured: true, status: run?.status, conclusion: run?.conclusion, created_at: run?.created_at, html_url: run?.html_url });
  } catch (e) {
    return NextResponse.json({ configured: true, message: (e as Error).message });
  }
}

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  const g = gh();
  if (!g) return NextResponse.json({ message: "Manual refresh not configured (GITHUB_DISPATCH_TOKEN)" }, { status: 501 });
  const run = await lastRun(g).catch(() => null);
  if (run && (run.status === "queued" || run.status === "in_progress")) {
    return NextResponse.json({ message: "An update is already running" }, { status: 409 });
  }
  if (run && Date.now() - Date.parse(run.created_at) < COOLDOWN_MIN * 60_000) {
    return NextResponse.json({ message: `Wait ${COOLDOWN_MIN} min between updates (data provider limits)` }, { status: 429 });
  }
  const r = await fetch(`https://api.github.com/repos/${g.repo}/actions/workflows/${g.workflow}/dispatches`, {
    method: "POST",
    headers: { ...g.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: g.ref, inputs: { mode: "update" } }),
  });
  if (!r.ok) return NextResponse.json({ message: `GitHub rejected the request (${r.status})` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
