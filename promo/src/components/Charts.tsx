import React from "react";
import { mix, smoothPath } from "../lib/anim";

/** Value (smooth area + line) against contributions (dashed step), revealed left → right. */
export const ValueChart: React.FC<{
  w: number;
  h: number;
  value: number[];
  contributed: number[];
  draw: number;
  line: string;
  fill: string;
  dash: string;
  pulse: number;
  id: string;
}> = ({ w, h, value, contributed, draw, line, fill, dash, pulse, id }) => {
  const all = [...value, ...contributed];
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.02;
  const x = (i: number, n: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const pts = value.map((v, i) => [x(i, value.length), y(v)] as [number, number]);
  const d = smoothPath(pts, 0.6);
  let step = `M0,${y(contributed[0])}`;
  contributed.forEach((v, i) => {
    if (i === 0) return;
    const xi = x(i, contributed.length);
    step += ` H${xi.toFixed(1)} V${y(v).toFixed(1)}`;
  });
  const cut = draw * w;
  const idx = Math.min(value.length - 1, draw * (value.length - 1));
  const i0 = Math.floor(idx);
  const ex = mix(pts[i0][0], pts[Math.min(i0 + 1, pts.length - 1)][0], idx - i0);
  const ey = mix(pts[i0][1], pts[Math.min(i0 + 1, pts.length - 1)][1], idx - i0);
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fill} stopOpacity="0.42" />
          <stop offset="1" stopColor={fill} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <rect x={-4} y={-20} width={cut + 4} height={h + 40} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id}-g)`} />
        <path d={step} fill="none" stroke={dash} strokeWidth={1.6} strokeDasharray="4 4" />
        <path d={d} fill="none" stroke={line} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {draw > 0.01 && (
        <>
          <circle cx={ex} cy={ey} r={5 + 9 * pulse} fill={line} opacity={0.35 * (1 - pulse)} />
          <circle cx={ex} cy={ey} r={4.5} fill={line} />
        </>
      )}
    </svg>
  );
};

/** Donut with 2px surface gaps; segments grow in sequence. */
export const Donut: React.FC<{ size: number; stroke: number; parts: { pct: number; color: string }[]; k: number; gapColor: string }> = ({
  size,
  stroke,
  parts,
  k,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 4;
  let acc = 0;
  return (
    <svg width={size} height={size} style={{ rotate: "-90deg" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      {parts.map((p, i) => {
        const len = (p.pct / 100) * c;
        const start = acc;
        acc += len;
        const shown = Math.max(0, Math.min(len - gap, k * c - start));
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth={stroke}
            strokeDasharray={`${shown} ${c}`}
            strokeDashoffset={-start}
          />
        );
      })}
    </svg>
  );
};

/** Fan chart: p10–p90 band, p50 line, revealed left → right. */
export const FanChart: React.FC<{
  w: number;
  h: number;
  pts: { p10: number; p50: number; p90: number }[];
  draw: number;
  color: string;
  grid: string;
  id: string;
}> = ({ w, h, pts, draw, color, grid, id }) => {
  const hi = Math.max(...pts.map((p) => p.p90)) * 1.05;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (v: number) => h - (v / hi) * h;
  const top = pts.map((p, i) => [x(i), y(p.p90)] as [number, number]);
  const bot = pts.map((p, i) => [x(i), y(p.p10)] as [number, number]).reverse();
  const mid = pts.map((p, i) => [x(i), y(p.p50)] as [number, number]);
  const band = `${smoothPath(top)} L${bot[0][0]},${bot[0][1]}${smoothPath(bot).replace(/^M[\d.,-]+/, "")} Z`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}-c`}>
          <rect x={-2} y={-10} width={draw * w + 2} height={h + 20} />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={w} y1={h * g} y2={h * g} stroke={grid} strokeWidth={1} />
      ))}
      <line x1={0} x2={w} y1={h} y2={h} stroke={grid} strokeWidth={1.5} />
      <g clipPath={`url(#${id}-c)`}>
        <path d={band} fill={color} opacity={0.22} />
        <path d={smoothPath(top)} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.2} />
        <path d={smoothPath(pts.map((p, i) => [x(i), y(p.p10)] as [number, number]))} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.2} />
        <path d={smoothPath(mid)} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    </svg>
  );
};

/** Thin trend line with an end dot. */
export const Sparkline: React.FC<{ w: number; h: number; values: number[]; draw: number; color: string; id: string }> = ({ w, h, values, draw, color, id }) => {
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - v * h] as [number, number]);
  const end = pts[Math.round(draw * (pts.length - 1))];
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}-c`}>
          <rect x={-2} y={-6} width={draw * w + 2} height={h + 12} />
        </clipPath>
      </defs>
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" clipPath={`url(#${id}-c)`} />
      {draw > 0.02 && <circle cx={end[0]} cy={end[1]} r={3} fill={color} />}
    </svg>
  );
};
