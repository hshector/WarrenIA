import React from "react";
import { Donut, ValueChart } from "../components/Charts";
import { AppTop, TabBar } from "../components/Phone";
import { eur, num } from "../lib/anim";
import { CONTRIBUTED, GAIN, GAIN_PCT, mixRows, portfolio, VALUE } from "../lib/data";
import { dark, FONT, series } from "../theme";

const card: React.CSSProperties = { background: dark.surface, borderRadius: 26, padding: 20, boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.05)` };

/** Home in dark mode, redrawn with richer charts (demo figures). */
export const HomeScreen: React.FC<{ count: number; draw: number; donut: number; pulse: number }> = ({ count, draw, donut, pulse }) => {
  const shownValue = VALUE * count;
  const gain = GAIN * count;
  return (
    <div style={{ width: 390, height: 844, background: dark.canvas, fontFamily: FONT, color: dark.ink, position: "relative" }}>
      <AppTop />
      <div style={{ padding: "16px 16px 0" }}>
        {/* Hero card: the app's pastel Salvia surface (dark tokens). */}
        <div
          style={{
            position: "relative",
            height: 318,
            borderRadius: 28,
            overflow: "hidden",
            background: `radial-gradient(120% 90% at 85% 0%, ${dark.hero3} 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, ${dark.hero1} 0%, transparent 60%), linear-gradient(160deg, ${dark.hero2}, ${dark.hero6})`,
            color: dark.heroInk,
          }}
        >
          <div style={{ padding: "22px 22px 0" }}>
            <div style={{ fontSize: 15, opacity: 0.78 }}>Tu cartera</div>
            <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.035em", marginTop: 4, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {eur(shownValue)}
            </div>
            <div style={{ fontSize: 14.5, marginTop: 4, opacity: 0.92, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              <span style={{ color: "#bff0cf" }}>
                +{eur(gain)} (+{num(GAIN_PCT * count)} %)
              </span>{" "}
              <span style={{ opacity: 0.75 }}>desde el inicio</span>
            </div>
          </div>
          <div style={{ position: "absolute", right: 20, top: 26, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", fontSize: 11.5, opacity: 0.85 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2.4, borderRadius: 2, background: dark.heroInk }} />
              Valor
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="3">
                <line x1="0" x2="14" y1="1.5" y2="1.5" stroke={dark.heroInk} strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="3 2.5" />
              </svg>
              Aportado
            </span>
          </div>
          <div style={{ position: "absolute", left: 0, bottom: 22 }}>
            <ValueChart
              id="home"
              w={358}
              h={150}
              value={portfolio.map((p) => p.value)}
              contributed={portfolio.map((p) => p.contributed)}
              draw={draw}
              line={dark.heroInk}
              fill={dark.heroInk}
              dash="rgba(232,243,236,0.5)"
              pulse={pulse}
            />
          </div>
          <div style={{ position: "absolute", left: 22, right: 22, bottom: 8, display: "flex", justifyContent: "space-between", fontSize: 10.5, opacity: 0.6 }}>
            <span>oct 2024</span>
            <span>oct 2025</span>
            <span>oct 2026</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, height: 50, borderRadius: 99, background: dark.accent, color: dark.accentInk, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16 }}>
            Ver cartera
          </div>
          <div style={{ flex: 1, height: 50, borderRadius: 99, background: dark.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16 }}>
            Añadir operación
          </div>
        </div>

        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Tu reparto</div>
            <div style={{ fontSize: 12.5, color: dark.ink2, fontVariantNumeric: "tabular-nums" }}>Aportado {eur(CONTRIBUTED, 0)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14 }}>
            <div style={{ position: "relative", width: 120, height: 120 }}>
              <Donut size={120} stroke={16} k={donut} gapColor={dark.surface} parts={mixRows.map((r) => ({ pct: r.pct, color: series[r.color] }))} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: dark.ink2 }}>Desviación</span>
                <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{num(1.8 * donut)} pp</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {mixRows.map((r) => (
                <div key={r.k}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 9, background: series[r.color] }} />
                      {r.k}
                    </span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{Math.round(r.pct * donut)} %</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: dark.ink3, marginLeft: 17, marginTop: 1 }}>objetivo {r.target} %</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <TabBar active={0} />
    </div>
  );
};
