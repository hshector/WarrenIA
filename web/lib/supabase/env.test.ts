import { afterEach, describe, expect, it, vi } from "vitest";

import { appMode, isAllowedEmail } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("app mode (fail closed)", () => {
  it("uses Supabase when public env is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    expect(appMode()).toBe("supabase");
  });
  it("never runs in local (no-login) mode on Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("WARRENIA_LOCAL_MODE", "1");
    expect(appMode()).toBe("misconfigured");
  });
  it("production build without Supabase requires explicit local flag", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WARRENIA_LOCAL_MODE", "");
    expect(appMode()).toBe("misconfigured");
    vi.stubEnv("WARRENIA_LOCAL_MODE", "1");
    expect(appMode()).toBe("local");
  });
});

describe("allowlist", () => {
  it("empty allowlist allows nobody", () => {
    vi.stubEnv("ALLOWED_EMAILS", "");
    expect(isAllowedEmail("a@b.com")).toBe(false);
  });
  it("is case-insensitive and exact", () => {
    vi.stubEnv("ALLOWED_EMAILS", " Me@Example.com , other@x.io");
    expect(isAllowedEmail("me@example.com")).toBe(true);
    expect(isAllowedEmail("me@example.com.evil.io")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });
});

describe("supabaseBaseUrl", () => {
  it("strips trailing slashes and pasted API paths", async () => {
    const { supabaseBaseUrl } = await import("./env");
    for (const u of ["https://x.supabase.co", "https://x.supabase.co/", "https://x.supabase.co/rest/v1/", " https://x.supabase.co/rest/v1 "]) {
      expect(supabaseBaseUrl(u)).toBe("https://x.supabase.co");
    }
  });
});

describe("misconfiguration fails closed into /setup", () => {
  it("malformed URL or empty allowlist on Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ALLOWED_EMAILS", "me@x.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "x.supabase.co");
    expect(appMode()).toBe("misconfigured");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co/rest/v1/");
    expect(appMode()).toBe("supabase");
    vi.stubEnv("ALLOWED_EMAILS", "");
    expect(appMode()).toBe("misconfigured");
  });
});
