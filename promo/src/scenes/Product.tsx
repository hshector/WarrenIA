import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DemoTag, MonoLabel } from "../components/Brand";
import { Phone } from "../components/Phone";
import { EASE_IN_OUT, GENTLE, clamp, mix, prog, sp } from "../lib/anim";
import { stats } from "../lib/data";
import { useLayout } from "../lib/layout";
import { HomeScreen } from "../screens/HomeScreen";
import { dark, FONT } from "../theme";
import TL from "../timeline.json";

const P = TL.product;
export const CLAIM: string[][] = [["Tu", "cartera,"], ["con", "las", "cuentas"], ["claras."]];

/** Revolut-style claim, then the real app (redrawn) rises in 2.5D and its figures count up. */
export const Product: React.FC = () => {
  const f = useCurrentFrame(); // local: 0 = 5.0 s
  const L = useLayout();
  const size = L.wide ? 124 : 124;
  const lineH = size * 1.0;

  // Claim: words rise through a line mask, staggered.
  const shrink = L.wide ? 0 : prog(f, 64, 96, EASE_IN_OUT);
  const small = 0.42;
  const blockH = lineH * 3;
  const top0 = L.wide ? L.cy - blockH / 2 - 60 : (L.height - blockH) / 2;
  const top = mix(top0, 64, shrink);
  const sc = mix(1, small, shrink);

  // Phone.
  const inK = sp(f, 60, P.phoneIn - P.start, GENTLE);
  const phoneScale = L.wide ? 1.16 : 1.18;
  const phoneW = 412 * phoneScale;
  const left = L.wide ? 1350 - phoneW / 2 : L.width - L.margin - phoneW + 10;
  const topP = L.wide ? 150 : 300;
  const drift = (f - (P.phoneIn - P.start)) / 170;
  const rotY = mix(-26, -11, inK) + 4 * Math.max(0, Math.min(1, drift));
  const rotX = mix(16, 7, inK) - 2 * Math.max(0, Math.min(1, drift));

  const count = interpolate(f, [P.countStart - P.start, P.countEnd - P.start], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3.2) });
  const draw = prog(f, P.countStart - P.start + 4, P.countEnd - P.start + 14, EASE_IN_OUT);
  const donut = prog(f, 120, 176, EASE_IN_OUT);
  const pulse = f > 186 ? ((f - 186) % 54) / 54 : 0;
  const camera = interpolate(f, [0, 240], [1, 1.03]);

  let wi = 0;
  return (
    <AbsoluteFill style={{ background: dark.bg, scale: String(camera) }}>
      <div style={{ position: "absolute", left: L.margin, top, transformOrigin: "0 0", scale: String(sc) }}>
        {CLAIM.map((line, li) => (
          <div key={li} style={{ height: lineH, overflow: "hidden", display: "flex", gap: size * 0.24, paddingTop: size * 0.04 }}>
            {line.map((w) => {
              const k = sp(f, 60, 2 + wi++ * 4);
              const accent = w === "claras.";
              return (
                <span
                  key={w}
                  style={{
                    fontFamily: FONT,
                    fontWeight: 500,
                    fontSize: size,
                    letterSpacing: "-0.035em",
                    lineHeight: 0.92,
                    color: accent ? dark.accent : dark.ink,
                    translate: `0 ${(1 - k) * size * 1.05}px`,
                    display: "inline-block",
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left, top: topP, perspective: 2200 }}>
        <div
          style={{
            transform: `translateY(${(1 - inK) * 760}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            transformOrigin: "50% 30%",
            opacity: Math.min(1, inK * 3),
          }}
        >
          <Phone scale={phoneScale}>
            <HomeScreen count={count} draw={draw} donut={donut} pulse={pulse} />
          </Phone>
        </div>
      </div>

      {stats.map((s, i) => {
        const k = sp(f, 60, 128 + i * 7);
        const pos = L.wide ? { x: L.margin + i * 300, y: 760 } : { x: L.margin, y: 430 + i * 150 };
        return (
          <div
            key={s.k}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: L.wide ? "20px 36px" : "20px 34px",
              borderRadius: 999,
              background: dark.surface,
              boxShadow: `inset 0 0 0 1.5px ${dark.surface2}`,
              opacity: Math.min(1, k * 1.5),
              translate: L.wide ? `0 ${(1 - k) * 40}px` : `${(1 - k) * -50}px 0`,
            }}
          >
            <MonoLabel size={22} color={dark.ink2}>
              {s.k}
            </MonoLabel>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 54, letterSpacing: "-0.035em", color: dark.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.v}</div>
          </div>
        );
      })}

      <DemoTag
        ink={dark.ink2}
        bg={dark.surface}
        dot={dark.accent}
        scale={1.1}
        style={{ position: "absolute", left: L.margin, top: L.wide ? 960 : 1000, opacity: prog(f, 150, 166), translate: `0 ${(1 - prog(f, 150, 170)) * 10}px` }}
      />
    </AbsoluteFill>
  );
};
