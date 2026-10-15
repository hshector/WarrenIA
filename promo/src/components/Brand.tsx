import React from "react";
import { FONT, MONO } from "../theme";

/** The app's own mark (web/public/icons/icon.svg): a "w" stroke with two Salvia squares. */
export const BrandMark: React.FC<{ size: number; ink: string; accent: string; tile?: string }> = ({ size, ink, accent, tile }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    {tile && <rect width="32" height="32" rx="7.2" fill={tile} />}
    <g transform="translate(2.24 2.24) scale(0.86)">
      <path d="M6 11.55v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V11.55" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4.5" y="5.15" width="3" height="3" rx="0.6" fill={accent} />
      <rect x="24.5" y="5.15" width="3" height="3" rx="0.6" fill={accent} />
    </g>
  </svg>
);

/** The mark drawing itself: the "w" stroke traces in, then the two Salvia squares pop. Light tokens. */
export const BrandMarkDraw: React.FC<{ size: number; draw: number; squares: number[]; ink?: string; accent?: string }> = ({
  size,
  draw,
  squares,
  ink = "#111111",
  accent = "#527f62",
}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible" }}>
    <g transform="translate(2.24 2.24) scale(0.86)">
      <path
        d="M6 11.55v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V11.55"
        fill="none"
        stroke={ink}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - draw}
        opacity={draw > 0.001 ? 1 : 0}
      />
      {[4.5, 24.5].map((x, i) => (
        <rect key={x} x={x} y="5.15" width="3" height="3" rx="0.6" fill={accent} style={{ transformBox: "fill-box", transformOrigin: "center", scale: String(0.4 + 0.6 * squares[i]), opacity: Math.min(1, squares[i] * 2) }} />
      ))}
    </g>
  </svg>
);

/** One square bracket, drawn as a stroke so it can be revealed. */
export const Bracket: React.FC<{ h: number; side: "l" | "r"; color: string; draw?: number; style?: React.CSSProperties }> = ({
  h,
  side,
  color,
  draw = 1,
  style,
}) => {
  const w = h * 0.3;
  const sw = h * 0.07;
  const len = w * 2 + h;
  const d = side === "l" ? `M${w},${sw / 2} H${sw / 2} V${h - sw / 2} H${w}` : `M0,${sw / 2} H${w - sw / 2} V${h - sw / 2} H0`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", ...style }}>
      <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="butt" strokeLinejoin="miter" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
    </svg>
  );
};

/** Text label in Geist Mono caps, the DevDay-style annotation. */
export const MonoLabel: React.FC<{ size: number; color: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ size, color, children, style }) => (
  <div style={{ fontFamily: MONO, fontSize: size, letterSpacing: "0.04em", textTransform: "uppercase", color, whiteSpace: "nowrap", ...style }}>{children}</div>
);

/** "Datos de demostración" tag: neutral pill with a 6px state dot, as StatePill in the app. */
export const DemoTag: React.FC<{ scale?: number; ink: string; bg: string; dot: string; style?: React.CSSProperties }> = ({ scale = 1, ink, bg, dot, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10 * scale,
      padding: `${8 * scale}px ${16 * scale}px`,
      borderRadius: 999,
      background: bg,
      fontFamily: MONO,
      fontSize: 18 * scale,
      letterSpacing: "0.05em",
      color: ink,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <span style={{ width: 8 * scale, height: 8 * scale, borderRadius: 99, background: dot }} />
    DATOS DE DEMOSTRACIÓN
  </div>
);

export const sans = (size: number, weight = 500, tracking = -0.02): React.CSSProperties => ({
  fontFamily: FONT,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: `${tracking}em`,
  lineHeight: 1.02,
});
