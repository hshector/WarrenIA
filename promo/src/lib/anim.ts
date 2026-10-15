import { Easing, interpolate, spring } from "remotion";

/** Low-bounce spring (ζ ≈ 0.87): settles in ~250 ms at 60 fps. */
export const SNAPPY = { damping: 26, stiffness: 220, mass: 1 };
/** Softer, for large objects (phone, cards). */
export const GENTLE = { damping: 30, stiffness: 140, mass: 1.1 };

export const sp = (frame: number, fps: number, delay = 0, config = SNAPPY) =>
  spring({ frame: frame - delay, fps, config });

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.55, 0, 1, 0.45);

/** 0→1 over [a, b] with an ease. */
export const prog = (frame: number, a: number, b: number, easing = EASE_OUT) =>
  interpolate(frame, [a, b], [0, 1], { ...clamp, easing });

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random in [0, 1). */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const eurFmt = (digits: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // es-ES skips the separator on 4-digit numbers by default; the app groups them.
    useGrouping: "always" as unknown as boolean,
  });
const fmts = [eurFmt(0), eurFmt(1), eurFmt(2)];
export const eur = (v: number, digits = 2) => fmts[digits].format(v);

export const num = (v: number, digits = 1) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: "always" as unknown as boolean,
  }).format(v);

/** Smooth SVG path through points (Catmull-Rom → cubic Bézier). */
export const smoothPath = (pts: [number, number][], tension = 0.5) => {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = tension / 3;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
};
