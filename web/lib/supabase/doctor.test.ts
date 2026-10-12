import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runDoctor } = await import("./doctor");

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

describe("setup check", () => {
  it("without a signed-in user: no secret-key calls and no details about the allowlist", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_x";
    process.env.ALLOWED_EMAILS = "a@x.com,b@x.com";
    const fetch = vi.fn(async (_url: string) => new Response('{"external":{"email":true}}', { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const limited = await runDoctor({ full: false });
    expect(limited.map((c) => c.name)).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "ALLOWED_EMAILS", "Login (Supabase Auth)"]);
    expect(limited.find((c) => c.name === "ALLOWED_EMAILS")?.detail).toBe("Set.");
    expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual(["https://abcdefghijklmnopqrst.supabase.co/auth/v1/settings"]);

    fetch.mockClear();
    const all = await runDoctor({ full: true });
    expect(all.map((c) => c.name)).toContain("Database");
    expect(all.find((c) => c.name === "ALLOWED_EMAILS")?.detail).toBe("2 allowed email(s).");
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
  });
});
