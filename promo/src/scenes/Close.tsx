import React from "react";
import { AbsoluteFill, Freeze, useCurrentFrame } from "remotion";
import { Bracket, BrandMarkDraw } from "../components/Brand";
import { Caret, PillField, useField } from "../components/PillField";
import { EASE_IN, EASE_IN_OUT, mix, prog, sp } from "../lib/anim";
import { useLayout } from "../lib/layout";
import { dark, FONT, light, seriesLight } from "../theme";
import TL from "../timeline.json";
import { useWordmarkGeometry } from "./HookReveal";
import { SummaryChips } from "./Features";

const C = TL.close;
const at = (abs: number) => abs - C.flip; // local frame of an absolute time
export const CTA = "Instálala en el móvil";
export const LEGAL = "Contenido informativo. No es asesoramiento financiero. Cifras de demostración.";

/** Flip to white (the app's light tokens), [ WarrenIA ], CTA and legal line; then fold back
 *  into the caret and the empty field of frame 0, so the video loops. */
export const Close: React.FC = () => {
  const f = useCurrentFrame();
  const flip = prog(f, 0, at(C.flipEnd), EASE_IN_OUT);
  const dip = 1 - 0.16 * Math.sin(flip * Math.PI);
  const showBack = flip >= 0.5;

  return (
    <AbsoluteFill style={{ background: f < at(C.flipEnd) + 1 ? dark.surface : dark.bg }}>
      {f < at(C.flipEnd) + 1 ? (
        <AbsoluteFill style={{ perspective: 2400 }}>
          <AbsoluteFill style={{ transform: `scale(${dip}) rotateX(${flip * 180}deg)`, transformStyle: "preserve-3d" }}>
            <AbsoluteFill style={{ backfaceVisibility: "hidden", overflow: "hidden", background: dark.bg, borderRadius: 40 * (1 - dip) * 6 }}>
              {!showBack && (
                <Freeze frame={29}>
                  <SummaryChips />
                </Freeze>
              )}
            </AbsoluteFill>
            <AbsoluteFill style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)", background: light.bg, borderRadius: 40 * (1 - dip) * 6 }} />
          </AbsoluteFill>
        </AbsoluteFill>
      ) : (
        <LightEnd />
      )}
    </AbsoluteFill>
  );
};

const LightEnd: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const size = L.wide ? 176 : 140;
  const G = useWordmarkGeometry(size);

  // In: brackets draw closed at the centre, open, letters assemble.
  const draw = prog(f, at(C.flipEnd), at(C.flipEnd) + 12);
  const openIn = sp(f, 60, at(C.flipEnd) + 6, { damping: 24, stiffness: 170, mass: 1 });
  // Out: letters fragment, brackets close, then shrink into the caret.
  const closeOut = prog(f, at(C.outro) + 8, at(C.outro) + 26, EASE_IN_OUT);
  const open = openIn * (1 - closeOut);
  const off = mix(G.closed, G.open, open);
  const toCaret = prog(f, at(C.outro) + 26, at(C.black) - 2, EASE_IN);
  const fadeOut = 1 - prog(f, at(C.outro), at(C.outro) + 12);

  // Back to black: a disc grows from the caret.
  const disc = prog(f, at(C.black), at(C.black) + 12, EASE_IN_OUT);
  const R = Math.hypot(L.width, L.height) * 0.6 * disc;

  // The empty field of frame 0 grows around the caret.
  const field = useField(TL.hook.texts.A, 0, 0);
  const grow = prog(f, at(C.black) + 8, at(C.black) + 26, EASE_IN_OUT);
  const caretX = mix(L.cx, field.caret.x, grow);
  const caretH = mix(size * 0.9 * (1 - toCaret) + field.caret.h * toCaret, field.caret.h, grow);
  const caretW = Math.max(4, L.pill.font * 0.075);

  const letters = "WarrenIA".split("");
  const inK = (i: number) => sp(f, 60, at(C.flipEnd) + 10 + i * 2.5, { damping: 22, stiffness: 200, mass: 1 });
  const outK = (i: number) => prog(f, at(C.outro) + 2 + (letters.length - 1 - i) * 1.5, at(C.outro) + 12 + (letters.length - 1 - i) * 1.5, EASE_IN);
  const ctaK = sp(f, 60, at(C.cta));
  // The app's mark draws in above the wordmark, then leaves with the CTA.
  const markSize = L.wide ? 172 : 148;
  const markIn = sp(f, 60, at(C.flipEnd) + 2, { damping: 24, stiffness: 180, mass: 1 });
  const markDraw = prog(f, at(C.flipEnd) + 2, at(C.flipEnd) + 24, EASE_IN_OUT);
  const squares = [0, 1].map((i) => sp(f, 60, at(C.flipEnd) + 18 + i * 3));
  const legalK = prog(f, at(C.cta) + 8, at(C.cta) + 22);

  return (
    <AbsoluteFill style={{ background: light.bg }}>
      <div
        style={{
          position: "absolute",
          left: L.cx - markSize / 2,
          top: L.cy - size * 0.62 - markSize - (L.wide ? 36 : 28),
          opacity: Math.min(1, markIn * 1.5) * fadeOut,
          scale: String(0.92 + 0.08 * markIn),
          translate: `0 ${(1 - markIn) * 16}px`,
        }}
      >
        <BrandMarkDraw size={markSize} draw={markDraw} squares={squares} />
      </div>
      {toCaret < 1 && (
        <>
          <Bracket h={G.bh * (1 - toCaret)} side="l" color={light.accent} draw={draw} style={{ position: "absolute", left: L.cx - off * (1 - toCaret), top: L.cy - (G.bh * (1 - toCaret)) / 2 }} />
          <Bracket
            h={G.bh * (1 - toCaret)}
            side="r"
            color={light.accent}
            draw={draw}
            style={{ position: "absolute", left: L.cx + off * (1 - toCaret) - G.bw * (1 - toCaret), top: L.cy - (G.bh * (1 - toCaret)) / 2 }}
          />
        </>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: L.cy - size * 0.62,
          height: size * 1.24,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: "-0.03em",
          color: light.ink,
          clipPath: `inset(-20% ${L.width / 2 - off + G.bw * 0.6}px -20% ${L.width / 2 - off + G.bw * 0.6}px)`,
        }}
      >
        {letters.map((c, i) => {
          const t = inK(i) * (1 - outK(i));
          const tx = (1 - t) * 0.14 * size;
          return (
            <span key={i} style={{ position: "relative", display: "inline-block", opacity: Math.min(1, t * 1.6) }}>
              <span style={{ display: "inline-block", clipPath: "inset(0 0 50% 0)", translate: `${-tx}px 0` }}>{c}</span>
              <span style={{ position: "absolute", left: 0, top: 0, clipPath: "inset(50% 0 0 0)", translate: `${tx}px 0` }}>{c}</span>
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: L.cy + size * 0.82, display: "flex", justifyContent: "center", gap: 16, opacity: fadeOut }}>
        {[seriesLight.salvia, seriesLight.gold, seriesLight.violet, seriesLight.sand].map((c, i) => {
          const k = sp(f, 60, at(C.flipEnd) + 24 + i * 3);
          return <span key={c} style={{ width: 16, height: 16, borderRadius: 99, background: c, scale: String(0.6 + 0.4 * k), opacity: Math.min(1, k * 1.5) }} />;
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: L.cy + size * 1.12,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: L.wide ? 46 : 42,
          letterSpacing: "-0.02em",
          color: light.ink,
          opacity: Math.min(1, ctaK * 1.5) * fadeOut,
          translate: `0 ${(1 - ctaK) * 20}px`,
        }}
      >
        {CTA}
      </div>
      <div
        style={{
          position: "absolute",
          left: L.margin,
          right: L.margin,
          bottom: L.wide ? 64 : 56,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: L.wide ? 27 : 26,
          lineHeight: 1.35,
          color: light.ink2,
          opacity: legalK * fadeOut,
        }}
      >
        {LEGAL}
      </div>
      {toCaret > 0 && (
        <AbsoluteFill style={{ background: dark.bg, clipPath: `circle(${R}px at ${L.cx}px ${L.cy}px)` }}>
          {grow > 0 && <PillField text={TL.hook.texts.A} shown={0} grow={0} btnReady={0} opacity={grow} widthScale={mix(0.08, 1, grow)} btnScale={grow} />}
        </AbsoluteFill>
      )}
      {toCaret > 0 && <Caret x={caretX} y={mix(L.cy, field.caret.y, grow)} w={caretW} h={caretH} color={disc > 0.05 ? dark.ink : light.ink} />}
    </AbsoluteFill>
  );
};
