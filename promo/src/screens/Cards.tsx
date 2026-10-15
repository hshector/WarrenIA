import React from "react";
import { FanChart, Sparkline } from "../components/Charts";
import { eur, prog, EASE_IN_OUT } from "../lib/anim";
import { planRows, projection, radarFactors, radarRows, sell, spark } from "../lib/data";
import { dark, FONT, MONO, series } from "../theme";

// Cards follow the app's components (surface, 28px radius, Geist) but are sized for video:
// fewer rows, larger type, one visual per card.
export const CARD_W = 380;

const shell: React.CSSProperties = {
  width: CARD_W,
  background: dark.surface,
  borderRadius: 30,
  padding: 22,
  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07)`,
  fontFamily: FONT,
  color: dark.ink,
};
const h2: React.CSSProperties = { fontSize: 21, fontWeight: 600, letterSpacing: "-0.015em" };
const sub: React.CSSProperties = { fontSize: 14, color: dark.ink2 };
const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const easeCount = (t: number) => 1 - Math.pow(1 - t, 3);

/** Plan: this month's split as a stacked bar, and the 20-year range. `f` = local frame. */
export const PlanCard: React.FC<{ f: number }> = ({ f }) => {
  const total = planRows.reduce((a, r) => a + r.amount, 0);
  const amountK = prog(f, 6, 30, easeCount);
  const barW = CARD_W - 44 - 4;
  const fan = prog(f, 22, 72, EASE_IN_OUT);
  const hi = Math.max(...projection.map((p) => p.p90)) * 1.05;
  const chartW = CARD_W - 44 - 92;
  const chartH = 150;
  return (
    <div style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={h2}>Este mes</div>
        <div style={{ ...tnum, fontSize: 40, fontWeight: 600, letterSpacing: "-0.035em" }}>{eur(Math.round(total * amountK), 0)}</div>
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 14, height: 16 }}>
        {planRows.map((r, i) => {
          const w = (r.amount / total) * barW;
          const k = prog(f, 8 + i * 5, 24 + i * 5, EASE_IN_OUT);
          return <div key={r.k} style={{ width: Math.max(0, w * k), height: 16, borderRadius: 8, background: series[r.color] }} />;
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1.1fr 1fr", gap: 8, marginTop: 14 }}>
        {planRows.map((r, i) => {
          const k = prog(f, 10 + i * 4, 28 + i * 4);
          return (
            <div key={r.k} style={{ opacity: Math.min(1, k * 2), translate: `0 ${(1 - k) * 10}px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: dark.ink2, whiteSpace: "nowrap" }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: series[r.color] }} />
                {r.k === "Diversificadores" ? "Diversif." : r.k === "Núcleo global" ? "Núcleo" : r.k}
              </div>
              <div style={{ ...tnum, fontSize: 22, fontWeight: 600, marginTop: 3, letterSpacing: "-0.02em" }}>{eur(Math.round(r.amount * k), 0)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 1, background: dark.line, margin: "18px 0 14px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>En 20 años</div>
        <div style={sub}>un rango, no una promesa</div>
      </div>
      <div style={{ position: "relative", marginTop: 14, height: chartH }}>
        <FanChart id="fan" w={chartW} h={chartH} pts={projection} draw={fan} color={series.salvia} grid={dark.line} />
        {[
          { v: projection[20].p90, l: "p90" },
          { v: projection[20].p50, l: "mediana" },
          { v: projection[20].p10, l: "p10" },
        ].map((e, i) => {
          const y = chartH - (e.v / hi) * chartH;
          return (
            <div
              key={e.l}
              style={{
                position: "absolute",
                left: chartW + 10,
                top: y - 10,
                fontSize: i === 1 ? 15 : 13.5,
                color: i === 1 ? dark.ink : dark.ink2,
                fontWeight: i === 1 ? 600 : 400,
                opacity: prog(f, 58 + i * 3, 70 + i * 3),
                ...tnum,
              }}
            >
              {eur(Math.round(e.v / 1000) * 1000, 0)}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: chartW, fontSize: 12.5, color: dark.ink3, marginTop: 7 }}>
        <span>hoy</span>
        <span>10 años</span>
        <span>20 años</span>
      </div>
    </div>
  );
};

const Avatar: React.FC<{ t: string; av: number }> = ({ t, av }) => (
  <span style={{ width: 44, height: 44, borderRadius: 99, background: dark.av[av], display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(245,245,247,0.8)", flexShrink: 0 }}>
    {t}
  </span>
);

/** Momentum Radar: scored rows with their 12-month trend, and the "why" behind the top one. */
export const RadarCard: React.FC<{ f: number }> = ({ f }) => (
  <div style={shell}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div style={h2}>Momentum Radar</div>
      <div style={sub}>0–100</div>
    </div>
    <div style={{ marginTop: 6 }}>
      {radarRows.slice(0, 3).map((r, i) => {
        const k = prog(f, 4 + i * 4, 26 + i * 4);
        const sc = prog(f, 6 + i * 4, 38 + i * 4, EASE_IN_OUT);
        return (
          <div
            key={r.t}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 0",
              borderTop: i ? `1px solid ${dark.line}` : "none",
              opacity: Math.min(1, k * 2),
              translate: `0 ${(1 - k) * 12}px`,
            }}
          >
            <Avatar t={r.t} av={r.av} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: dark.ink3, marginTop: 2 }}>tendencia 12 m</div>
            </div>
            <Sparkline id={`sp${i}`} w={64} h={30} values={spark(r.seed)} draw={sc} color={series.salvia} />
            <div style={{ width: 52, textAlign: "right" }}>
              <div style={{ ...tnum, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em" }}>{Math.round(r.score * sc)}</div>
              <div style={{ height: 4, borderRadius: 2, background: dark.surface3, marginTop: 3, overflow: "hidden" }}>
                <div style={{ width: `${r.score * sc}%`, height: 4, borderRadius: 2, background: series.salvia }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <div style={{ background: dark.surface2, borderRadius: 20, padding: "16px 18px", marginTop: 8, opacity: prog(f, 24, 38), translate: `0 ${(1 - prog(f, 24, 42)) * 16}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 15.5, fontWeight: 600 }}>Por qué puntúa 100</div>
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: dark.ink3 }}>REPRODUCIBLE</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 13 }}>
        {radarFactors.map((x, i) => {
          const k = prog(f, 30 + i * 4, 58 + i * 4, EASE_IN_OUT);
          return (
            <div key={x.k} style={{ display: "grid", gridTemplateColumns: "136px 1fr 30px", alignItems: "center", gap: 10, fontSize: 14 }}>
              <span style={{ color: dark.ink2, whiteSpace: "nowrap" }}>{x.k}</span>
              <div style={{ height: 8, borderRadius: 4, background: dark.surface3 }}>
                <div style={{ width: `${x.v * k}%`, height: 8, borderRadius: 4, background: series.violet }} />
              </div>
              <span style={{ ...tnum, textAlign: "right", fontWeight: 600 }}>{Math.round(x.v * k)}</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/** Before you sell: FIFO lot being consumed, the savings brackets and the result. */
export const SellCard: React.FC<{ f: number }> = ({ f }) => {
  const used = Math.round(prog(f, 8, 30, EASE_IN_OUT) * sell.units);
  const res = prog(f, 32, 66, easeCount);
  const brackets = [
    { r: "19 %", to: "6.000 €", w: 0.25 },
    { r: "21 %", to: "50.000 €", w: 0.36 },
    { r: "23 %", to: "200.000 €", w: 0.39 },
  ];
  return (
    <div style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={h2}>Antes de vender</div>
        <div style={sub}>IRPF · España</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {[sell.name, `${sell.units} uds`, eur(sell.price)].map((t, i) => (
          <div key={t} style={{ flex: i === 0 ? 1.7 : 1, height: 44, borderRadius: 15, background: dark.surface2, display: "flex", alignItems: "center", padding: "0 13px", fontSize: 15, whiteSpace: "nowrap", ...tnum }}>
            {t}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 14 }}>
        <span style={{ color: dark.ink2 }}>Lote FIFO · comprado a {eur(sell.lotPrice)}</span>
        <span style={{ ...tnum, fontWeight: 600 }}>
          {used}/{sell.held} uds
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 9 }}>
        {Array.from({ length: sell.held }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 26, borderRadius: 5, background: i < used ? series.gold : dark.surface3 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 16, opacity: prog(f, 24, 34) }}>
        <span style={{ fontSize: 15, color: dark.ink2 }}>Ganancia</span>
        <span style={{ ...tnum, fontSize: 22, fontWeight: 600, color: dark.pos }}>+{eur(sell.gain)}</span>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: dark.ink3 }}>Tramos del ahorro</div>
      <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
        {brackets.map((b, i) => (
          <div
            key={b.r}
            style={{
              flex: b.w,
              height: 32,
              borderRadius: 9,
              background: i === 0 ? `color-mix(in srgb, ${series.gold} ${34 * prog(f, 28, 38)}%, ${dark.surface2})` : dark.surface2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 10px",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontWeight: 600, color: i === 0 ? dark.ink : dark.ink3 }}>{b.r}</span>
            <span style={{ color: dark.ink3 }}>{b.to}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 10, marginTop: 16 }}>
        {[
          { k: "IRPF estimado", v: sell.tax },
          { k: "Recibes", v: sell.receive },
        ].map((r) => (
          <div key={r.k} style={{ background: dark.surface2, borderRadius: 20, padding: "14px 16px" }}>
            <div style={{ fontSize: 14, color: dark.ink2 }}>{r.k}</div>
            <div style={{ ...tnum, fontSize: 30, fontWeight: 600, letterSpacing: "-0.035em", marginTop: 4 }}>{eur(r.v * res)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13, fontSize: 13.5, color: dark.ink2, opacity: prog(f, 54, 64) }}>
        <svg width="17" height="17" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7.2" fill="none" stroke={dark.pos} strokeWidth="1.4" />
          <path d="M4.8 8.2 7 10.3 11.2 5.9" fill="none" stroke={dark.pos} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Simulación: no registra ninguna venta
      </div>
    </div>
  );
};
