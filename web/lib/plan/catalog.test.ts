import { describe, expect, it } from "vitest";

import { isinValid, momentumRoute, PRODUCTS, productsFor, recommended } from "./catalog";

describe("product catalog", () => {
  it("validates ISIN check digits (known references)", () => {
    expect(isinValid("US0378331005")).toBe(true); // Apple
    expect(isinValid("US0378331006")).toBe(false);
    expect(isinValid("IE00B4L5Y98")).toBe(false);
  });
  it("every ISIN in the catalog has a valid check digit (no typos to search in the broker)", () => {
    for (const p of PRODUCTS) expect(isinValid(p.isin), p.isin).toBe(true);
  });
  it("one recommended product per bucket, listed first, and sane fees", () => {
    for (const b of ["core", "gold", "momentum"] as const) {
      expect(PRODUCTS.filter((p) => p.bucket === b && p.recommended)).toHaveLength(1);
      expect(productsFor(b)[0]).toBe(recommended(b));
    }
    for (const p of PRODUCTS) {
      expect(p.ter).toBeGreaterThanOrEqual(0);
      expect(p.ter).toBeLessThan(0.01);
      expect(p.sources.length).toBeGreaterThan(0);
    }
  });
  it("momentum sleeve routes small amounts to the ETF", () => {
    expect(momentumRoute(1200)).toBe("etf");
    expect(momentumRoute(8000)).toBe("stocks");
  });
});
