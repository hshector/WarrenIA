import React from "react";
import { BrandMark } from "./Brand";
import { dark, FONT } from "../theme";

export const SCREEN_W = 390;
export const SCREEN_H = 844;

/** Generic rounded-rectangle phone (no maker's frame): bezel, hairline edge, screen. */
export const Phone: React.FC<{ scale: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ scale, children, style }) => {
  const bezel = 11;
  return (
    <div
      style={{
        width: (SCREEN_W + bezel * 2) * scale,
        height: (SCREEN_H + bezel * 2) * scale,
        borderRadius: 64 * scale,
        background: "#0c0c0e",
        boxShadow: `inset 0 0 0 ${1.5 * scale}px ${dark.surface3}`,
        padding: bezel * scale,
        ...style,
      }}
    >
      <div style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, borderRadius: 54 * scale, overflow: "hidden", position: "relative", background: dark.canvas }}>
        <div style={{ width: SCREEN_W, height: SCREEN_H, scale: String(scale), transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }}>{children}</div>
      </div>
    </div>
  );
};

/** Status bar + app header, as in the PWA (generic glyphs, no OS branding). */
export const AppTop: React.FC<{ date?: string }> = ({ date = "Cierre 14 oct" }) => (
  <>
    <div style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 30px 0", fontFamily: FONT, fontWeight: 600, fontSize: 16, color: dark.ink }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <svg width="18" height="11" viewBox="0 0 18 11">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={8 - i * 2.6} width="3.2" height={3 + i * 2.6} rx="0.8" fill={dark.ink} />
          ))}
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke={dark.ink} strokeOpacity="0.45" />
          <rect x="2.2" y="2.2" width="16" height="7.6" rx="1.8" fill={dark.ink} />
          <rect x="23.6" y="4" width="1.8" height="4" rx="0.8" fill={dark.ink} fillOpacity="0.45" />
        </svg>
      </span>
    </div>
    <div style={{ height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 0 16px", borderBottom: `1px solid ${dark.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BrandMark size={28} ink={dark.ink} accent={dark.accent} />
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: dark.ink }}>WarrenIA</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            height: 32,
            padding: "0 13px",
            borderRadius: 99,
            background: dark.surface2,
            fontFamily: FONT,
            fontSize: 13,
            color: dark.ink2,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 9, background: dark.accent }} />
          Demo · {date}
        </span>
      </div>
    </div>
  </>
);

const tabs = ["Inicio", "Plan", "Radar", "Cartera", "Ajustes"];
const icons = [
  "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12l6-6",
  "M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z",
  "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
];

export const TabBar: React.FC<{ active: number }> = ({ active }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 84,
      background: "rgba(28,28,30,0.92)",
      borderTop: `1px solid ${dark.line}`,
      display: "flex",
      justifyContent: "space-around",
      paddingTop: 9,
    }}
  >
    {tabs.map((t, i) => {
      const c = i === active ? dark.accent : dark.ink3;
      return (
        <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}>
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d={icons[i]} fill="none" stroke={c} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: c }}>{t}</span>
        </div>
      );
    })}
  </div>
);
