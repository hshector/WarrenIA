import { describe, expect, it } from "vitest";

import { moneyHeadline, units } from "./format";

describe("worst-case number formatting", () => {
  it("keeps the precision of tiny fractional positions", () => {
    expect(units(0.000123)).toBe("0.000123");
    expect(units(1.5)).toBe("1.5");
    expect(units(214587.3)).toBe("214,587.3");
    expect(units(17)).toBe("17");
  });
  it("drops cents from headline amounts of 100,000 or more", () => {
    expect(moneyHeadline(8870622.02)).toBe("€8,870,622");
    expect(moneyHeadline(99999.5)).toBe("€99,999.50");
    expect(moneyHeadline(null)).toBe("—");
  });
});
