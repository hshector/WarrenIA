import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bracket } from "../components/Brand";
import { Caret, PillField, useField } from "../components/PillField";
import { EASE_IN, EASE_IN_OUT, clamp, mix, prog, rand, sp } from "../lib/anim";
import { sansWidth, useLayout } from "../lib/layout";
import { dark, FONT, series } from "../theme";
import TL from "../timeline.json";

const H = TL.hook;
const R = TL.reveal;
const COLORS = [series.salvia, series.gold, series.violet, series.sand];
const N = 40;

export const typedCount = (frame: number, text: string) =>
  Math.max(0, Math.min(text.length, Math.floor((frame - H.typeStart) / H.charEvery) + 1));

export const lastTypeFrame = (text: string) => H.typeStart + (text.length - 1) * H.charEvery;

/** Caret: solid while typing, then blinks (530 ms on / 530 ms off). */
export const caretOn = (frame: number, text: string) => {
  const last = lastTypeFrame(text);
  if (frame < last + 8) return true;
  return Math.floor((frame - last - 8) / 32) % 2 === 1;
};

/** Frame at which the field grows to a second line (0 if single-line). */
export const growFrame = (text: string) => {
  const i = text.indexOf("\n");
  return i < 0 ? Infinity : H.typeStart + i * H.charEvery;
};

/** Hook (0–2.5 s) and reveal (2.5–5 s): the caret bursts into a school of brand-coloured
 *  dots that settle into [ ] brackets around the WarrenIA wordmark. */
export const HookReveal: React.FC<{ text?: string }> = ({ text = H.texts.A }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const n = typedCount(frame, text);
  const done = n === text.length;
  const grow = sp(frame, 60, growFrame(text), { damping: 24, stiffness: 260, mass: 1 });

  // ---- hook -------------------------------------------------------------
  const btnReady = done ? prog(frame, lastTypeFrame(text) + 2, lastTypeFrame(text) + 12) : 0;
  const press = frame >= H.sendAt ? 1 - 0.1 * Math.sin(Math.min(1, (frame - H.sendAt) / 10) * Math.PI) : 1;

  // ---- reveal: the text breaks apart, the field dissolves -----------------
  const out = prog(frame, R.start + 2, R.start + 14, EASE_IN);
  const g = useField(text, n, grow);
  const toCenter = prog(frame, R.start - 2, R.burst - 2, EASE_IN_OUT);
  const caretX = mix(g.caret.x, L.cx, toCenter);
  const caretY = mix(g.caret.y, L.cy, toCenter);
  const morph = prog(frame, R.burst - 10, R.burst, EASE_IN_OUT);
  const caretW = mix(Math.max(4, L.pill.font * 0.075), 26, morph);
  const caretH = mix(g.caret.h, 26, morph);
  const pop = frame >= R.burst ? 1 + 0.6 * prog(frame, R.burst, R.burst + 4) : 1;
  const showCaret = frame < R.burst + 3 && (frame < R.start ? caretOn(frame, text) : true);

  return (
    <AbsoluteFill style={{ background: dark.bg }}>
      {frame < R.burst && (
        <PillField
          text={text}
          shown={n}
          grow={grow}
          btnReady={btnReady}
          btnScale={press * (1 - out)}
          opacity={1 - out}
          widthScale={1 - 0.04 * out}
          charStyle={(li, i) => {
            if (frame < R.start) return {};
            const k = li * 20 + i;
            const d = (k % 20) * 0.22 + (k >= 20 ? 1.5 : 0);
            const t = prog(frame, R.start + d, R.start + d + 9, EASE_IN);
            return {
              opacity: 1 - t,
              translate: `${(rand(k * 7) - 0.5) * 70 * t}px ${(rand(k * 13) - 0.5) * 140 * t}px`,
              rotate: `${(rand(k * 3) - 0.5) * 50 * t}deg`,
            };
          }}
        />
      )}
      {showCaret && (
        <Caret
          x={caretX}
          y={caretY}
          w={caretW}
          h={caretH}
          radius={mix(2, 13, morph)}
          scale={pop}
          opacity={frame >= R.burst ? 1 - prog(frame, R.burst, R.burst + 3) : 1}
        />
      )}
      {frame >= R.burst - 1 && <School />}
      {frame >= R.brackets - 2 && <Wordmark />}
    </AbsoluteFill>
  );
};

/** Geometry of the wordmark lock-up; shared with the closing scene. */
export const useWordmarkGeometry = (size: number) => {
  const L = useLayout();
  const textW = sansWidth("WarrenIA", size, "500", "-0.03em");
  const bh = size * 1.02;
  const bw = bh * 0.3;
  const gap = size * 0.3;
  const open = textW / 2 + gap + bw; // outer edge offset when open
  const closed = bw + size * 0.06;
  return { L, textW, bh, bw, gap, open, closed };
};

const School: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const G = useWordmarkGeometry(L.word);
  const u = frame - R.burst;
  const spread = L.wide ? 1.25 : 1;

  // Targets along the closed bracket strokes (left 18, right 18) + 4 dots under the word.
  const target = (i: number): { x: number; y: number; rot: number } => {
    if (i < 4) {
      const gx = 30;
      return { x: L.cx + (i - 1.5) * gx, y: L.cy + L.word * 0.95, rot: 0 };
    }
    const j = i - 4;
    const side = j % 2 === 0 ? -1 : 1;
    const k = Math.floor(j / 2) / 17; // 0..1 along the path
    const len = G.bw * 2 + G.bh;
    const s = k * len;
    const xIn = side < 0 ? L.cx - G.closed + G.bw : L.cx + G.closed - G.bw; // open end of the bracket
    const xOut = side < 0 ? L.cx - G.closed : L.cx + G.closed; // spine
    const top = L.cy - G.bh / 2;
    if (s < G.bw) return { x: mix(xIn, xOut, s / G.bw), y: top, rot: 0 };
    if (s < G.bw + G.bh) return { x: xOut, y: top + (s - G.bw), rot: 90 };
    return { x: mix(xOut, xIn, (s - G.bw - G.bh) / G.bw), y: top + G.bh, rot: 0 };
  };

  const flock = (i: number, t: number) => {
    const a = i * 2.39996;
    const r = (70 + 330 * Math.sqrt((i + 0.5) / N)) * (0.85 + 0.3 * rand(i));
    const e = sp(t, 60, 0, { damping: 14, stiffness: 110, mass: 1 });
    const swirl = 1.9 * (1 - Math.exp(-t / 18)) + 0.5 * rand(i * 5) * (t / 40);
    const ang = a + swirl;
    const cxo = (L.wide ? 170 : 80) * Math.sin(Math.min(1, t / 42) * Math.PI);
    const cyo = -70 * Math.sin(Math.min(1, t / 42) * Math.PI * 2);
    const wob = 9 * Math.sin(t * 0.32 + i);
    return { x: L.cx + cxo + Math.cos(ang) * r * e * spread + wob, y: L.cy + cyo + Math.sin(ang) * r * e * 0.78 + wob * 0.6 };
  };

  const pos = (i: number, f: number) => {
    const t = f - R.burst;
    const p = flock(i, Math.max(0, t));
    const tg = target(i);
    const k = interpolate(f, [R.brackets - 10, R.brackets + 2], [0, 1], { ...clamp, easing: EASE_IN_OUT });
    return { x: mix(p.x, tg.x, k), y: mix(p.y, tg.y, k), k, rot: tg.rot };
  };

  if (u < 0) return null;
  const fade = (i: number) => (i < 4 ? 1 : 1 - prog(frame, R.brackets + 1, R.brackets + 6));
  const dotsOpen = sp(frame, 60, R.word + 6);

  return (
    <>
      {Array.from({ length: N }, (_, i) => {
        const isPill = i >= 4 && rand(i * 3.3) > 0.55;
        const size = 12 + 12 * rand(i * 1.7);
        const color = COLORS[i % 4];
        const ghosts = u < 50 && i >= 0 ? [3, 1.5, 0] : [0];
        return ghosts.map((lag, gi) => {
          const p = pos(i, frame - lag);
          const prev = pos(i, frame - lag - 1);
          const vAng = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI;
          const rot = mix(vAng, p.rot, p.k);
          const shrink = mix(1, i < 4 ? 0.85 : 0.55, p.k);
          const w = (isPill ? size * 2.6 : size) * shrink;
          const h = size * (isPill ? 0.55 : 1) * shrink;
          // The 4 kept dots spread from the cluster into the row under the wordmark.
          const dx = i < 4 ? (i - 1.5) * 8 * dotsOpen : 0;
          const born = prog(frame, R.burst, R.burst + 5);
          const alpha = (gi === ghosts.length - 1 ? 1 : gi === 0 ? 0.14 : 0.32) * fade(i) * born;
          if (alpha <= 0.001) return null;
          return (
            <div
              key={`${i}-${gi}`}
              style={{
                position: "absolute",
                left: p.x + dx - w / 2,
                top: p.y - h / 2,
                width: w,
                height: h,
                borderRadius: 999,
                background: color,
                rotate: `${rot}deg`,
                opacity: alpha,
              }}
            />
          );
        });
      })}
    </>
  );
};

/** [ WarrenIA ]: brackets solidify where the dots landed, open, and the letters assemble. */
const Wordmark: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const G = useWordmarkGeometry(L.word);
  const solid = prog(frame, R.brackets - 1, R.brackets + 4);
  const openK = sp(frame, 60, R.word, { damping: 24, stiffness: 170, mass: 1 });
  const off = mix(G.closed, G.open, openK);
  const flash = interpolate(frame, [R.brackets, R.brackets + 2, R.brackets + 10], [0, 0.55, 0], clamp);
  const letters = "WarrenIA".split("");
  return (
    <>
      <Bracket h={G.bh} side="l" color={dark.ink} style={{ position: "absolute", left: L.cx - off, top: L.cy - G.bh / 2, opacity: solid }} />
      <Bracket h={G.bh} side="r" color={dark.ink} style={{ position: "absolute", left: L.cx + off - G.bw, top: L.cy - G.bh / 2, opacity: solid }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: L.cy - L.word * 0.62,
          height: L.word * 1.24,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: L.word,
          letterSpacing: "-0.03em",
          color: dark.ink,
          clipPath: `inset(-20% ${L.width / 2 - off + G.bw * 0.6}px -20% ${L.width / 2 - off + G.bw * 0.6}px)`,
        }}
      >
        {letters.map((c, i) => {
          const t = sp(frame, 60, R.word + 4 + i * 2.5, { damping: 22, stiffness: 200, mass: 1 });
          const tx = (1 - t) * 0.14 * L.word;
          return (
            <span key={i} style={{ position: "relative", display: "inline-block", opacity: Math.min(1, t * 1.6) }}>
              <span style={{ display: "inline-block", clipPath: "inset(0 0 50% 0)", translate: `${-tx}px 0` }}>{c}</span>
              <span style={{ position: "absolute", left: 0, top: 0, clipPath: "inset(50% 0 0 0)", translate: `${tx}px 0` }}>{c}</span>
            </span>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: dark.ink, opacity: flash * 0.18, pointerEvents: "none" }} />
    </>
  );
};

