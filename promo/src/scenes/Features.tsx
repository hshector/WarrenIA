import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { DemoTag, MonoLabel } from "../components/Brand";
import { GENTLE, clamp, prog, sp } from "../lib/anim";
import { useLayout } from "../lib/layout";
import { CARD_W, PlanCard, RadarCard, SellCard } from "../screens/Cards";
import { dark, FONT, series } from "../theme";
import TL from "../timeline.json";

const F = TL.features;

type Beat = { n: string; label: string; color: string; title: string[]; caption: string; Card: React.FC<{ f: number }> };

export const BEATS: Beat[] = [
  { n: "01", label: "Plan", color: series.salvia, title: ["Qué aportar", "cada mes"], caption: "Con fiscalidad española y proyección de patrimonio.", Card: PlanCard },
  { n: "02", label: "Momentum Radar", color: series.violet, title: ["Momentum,", "explicado"], caption: "Screener cuantitativo, explicable y reproducible.", Card: RadarCard },
  { n: "03", label: "Antes de vender", color: series.gold, title: ["Tu IRPF, antes", "de vender"], caption: "Lotes FIFO y tramos del ahorro, antes de decidir.", Card: SellCard },
];

/** Feature chip: neutral pill, coloured dot, mono label (the app's StatePill, scaled up). */
export const Chip: React.FC<{ color: string; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ color, children, size = 24, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.55,
      height: size * 2.5,
      padding: `0 ${size * 1.05}px`,
      borderRadius: 999,
      background: dark.surface,
      boxShadow: `inset 0 0 0 1.5px ${dark.surface2}`,
      ...style,
    }}
  >
    <span style={{ width: size * 0.5, height: size * 0.5, borderRadius: 99, background: color }} />
    <MonoLabel size={size} color={dark.ink}>
      {children}
    </MonoLabel>
  </div>
);

const FeatureBeat: React.FC<{ beat: Beat }> = ({ beat }) => {
  const f = useCurrentFrame();
  const L = useLayout();
  const chipK = sp(f, 60, 0);
  const cardK = sp(f, 60, 3, GENTLE);
  const titleSize = L.wide ? 108 : 84;
  const cardScale = L.wide ? 1.75 : 1.55;
  const cardW = CARD_W * cardScale;
  const cardLeft = L.wide ? 1360 - cardW / 2 : L.width - L.margin - cardW + 12;
  const cardTop = L.wide ? 150 : 318;
  const textTop = L.wide ? 290 : 60;
  const flash = interpolate(f, [0, 1, 6], [0.22, 0.22, 0], clamp);
  let wi = 0;
  return (
    <AbsoluteFill style={{ background: dark.bg }}>
      <div style={{ position: "absolute", left: L.margin, top: textTop }}>
        <Chip color={beat.color} size={L.wide ? 26 : 23} style={{ scale: String(0.9 + 0.1 * chipK), opacity: chipK, transformOrigin: "0 50%" }}>
          {beat.n} · {beat.label}
        </Chip>
        <div style={{ marginTop: L.wide ? 40 : 30 }}>
          {beat.title.map((line, li) => (
            <div key={li} style={{ height: titleSize * 1.0, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: titleSize * 0.24 }}>
                {line.split(" ").map((w) => {
                  const k = sp(f, 60, 3 + wi++ * 3);
                  return (
                    <span
                      key={w + li}
                      style={{ fontFamily: FONT, fontWeight: 500, fontSize: titleSize, letterSpacing: "-0.035em", lineHeight: 0.98, color: dark.ink, translate: `0 ${(1 - k) * titleSize}px`, display: "inline-block" }}
                    >
                      {w}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: L.wide ? 34 : 20,
            width: L.wide ? 640 : 290,
            fontFamily: FONT,
            fontSize: L.wide ? 32 : 25,
            lineHeight: 1.3,
            color: dark.ink2,
            opacity: prog(f, 12, 24),
            translate: `0 ${(1 - prog(f, 12, 28)) * 12}px`,
          }}
        >
          {beat.caption}
        </div>
      </div>
      <div style={{ position: "absolute", left: cardLeft, top: cardTop, perspective: 2000 }}>
        <div
          style={{
            transform: `translateY(${(1 - cardK) * 260}px) rotateX(${12 * (1 - cardK) + 5}deg) rotateY(${-16 + 6 * cardK + 2 * prog(f, 20, 90)}deg)`,
            transformOrigin: "50% 40%",
            opacity: Math.min(1, cardK * 2.5),
          }}
        >
          <div style={{ scale: String(cardScale), transformOrigin: "0 0", width: CARD_W }}>
            <beat.Card f={f} />
          </div>
        </div>
      </div>
      <DemoTag ink={dark.ink2} bg={dark.surface} dot={dark.accent} scale={1} style={{ position: "absolute", left: L.margin, top: L.wide ? 960 : 1010 }} />
      <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />
    </AbsoluteFill>
  );
};

/** The four functions line up as chips: the beat before the flip. */
export const SummaryChips: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const items = [...BEATS.map((b) => ({ c: b.color, l: b.label })), { c: series.sand, l: "Alertas" }];
  const size = L.wide ? 34 : 34;
  return (
    <AbsoluteFill style={{ background: dark.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, width: L.wide ? 1760 : 860 }}>
        {items.map((it, i) => {
          const k = sp(f, 60, i * 3);
          return (
            <Chip key={it.l} color={it.c} size={size} style={{ scale: String(0.85 + 0.15 * k), opacity: Math.min(1, k * 2) }}>
              {it.l}
            </Chip>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Features: React.FC = () => (
  <>
    <Sequence durationInFrames={F.radar - F.plan} name="Plan">
      <FeatureBeat beat={BEATS[0]} />
    </Sequence>
    <Sequence from={F.radar - F.plan} durationInFrames={F.sell - F.radar} name="Radar">
      <FeatureBeat beat={BEATS[1]} />
    </Sequence>
    <Sequence from={F.sell - F.plan} durationInFrames={F.summary - F.sell} name="Antes de vender">
      <FeatureBeat beat={BEATS[2]} />
    </Sequence>
    <Sequence from={F.summary - F.plan} durationInFrames={TL.close.flip - F.summary} name="Resumen">
      <SummaryChips />
    </Sequence>
  </>
);
