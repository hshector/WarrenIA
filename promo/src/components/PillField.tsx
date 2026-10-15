import React from "react";
import { dark, MONO } from "../theme";
import { monoWidth, useLayout } from "../lib/layout";

/** Field geometry. Text may hold one "\n": the field grows to two lines as you type. */
export const useField = (text: string, shown: number, grow: number) => {
  const { pill, cy } = useLayout();
  const lineH = Math.round(pill.font * 1.25);
  const h = pill.h + lineH * grow;
  const top = cy - h / 2;
  const visible = text.slice(0, shown);
  const lines = visible.split("\n");
  const padTop = (pill.h - lineH) / 2;
  const li = lines.length - 1;
  const caret = {
    x: pill.x + pill.padL + monoWidth(lines[li], pill.font) + 3,
    y: top + padTop + (li > 0 ? (li - 1 + Math.min(1, grow)) : 0) * lineH + lineH / 2,
    h: pill.font * 1.18,
  };
  return { pill, lineH, h, top, lines, padTop, caret };
};

/** Grok-style single input: field on black, mono text, blinking caret, round send button. */
export const PillField: React.FC<{
  text: string;
  shown: number;
  grow: number;
  btnReady: number; // 0 → 1: grey → white
  btnScale?: number;
  opacity?: number;
  widthScale?: number;
  charStyle?: (line: number, i: number) => React.CSSProperties;
}> = ({ text, shown, grow, btnReady, btnScale = 1, opacity = 1, widthScale = 1, charStyle }) => {
  const g = useField(text, shown, grow);
  const { pill } = g;
  const w = pill.w * widthScale;
  const btnBg = `color-mix(in srgb, ${dark.ink} ${btnReady * 100}%, ${dark.surface2})`;
  const arrow = `color-mix(in srgb, ${dark.bg} ${btnReady * 100}%, ${dark.ink3})`;
  const inset = (pill.h - pill.btn) / 2;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: pill.x + (pill.w - w) / 2,
          top: g.top,
          width: w,
          height: g.h,
          borderRadius: pill.h / 2,
          background: "#111113",
          boxShadow: `inset 0 0 0 2px ${dark.surface2}`,
          opacity,
        }}
      />
      {g.lines.map((line, li) => (
        <div
          key={li}
          style={{
            position: "absolute",
            left: pill.x + pill.padL,
            top: g.top + g.padTop + li * g.lineH,
            height: g.lineH,
            display: "flex",
            alignItems: "center",
            fontFamily: MONO,
            fontSize: pill.font,
            letterSpacing: 0,
            color: dark.ink,
            whiteSpace: "pre",
          }}
        >
          {line.split("").map((c, i) => (
            <span key={i} style={{ display: "inline-block", ...(charStyle?.(li, i) ?? {}) }}>
              {c}
            </span>
          ))}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          left: pill.x + (pill.w + w) / 2 - pill.btn - inset,
          top: g.top + g.h - pill.btn - inset,
          width: pill.btn,
          height: pill.btn,
          borderRadius: 999,
          background: btnBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          scale: String(btnScale),
          opacity,
        }}
      >
        <svg width={pill.btn * 0.42} height={pill.btn * 0.42} viewBox="0 0 24 24">
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke={arrow} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
};

export const Caret: React.FC<{ x: number; y: number; w: number; h: number; radius?: number; color?: string; scale?: number; opacity?: number }> = ({
  x,
  y,
  w,
  h,
  radius = 2,
  color = dark.ink,
  scale = 1,
  opacity = 1,
}) => (
  <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: radius, background: color, scale: String(scale), opacity }} />
);
