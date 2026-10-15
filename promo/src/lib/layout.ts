import { measureText } from "@remotion/layout-utils";
import { useVideoConfig } from "remotion";
import { FONT, MONO } from "../theme";

/** Layout constants for the two deliverables: 1080×1080 (master) and 1920×1080. */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const wide = width / height > 1.3;
  const pill = wide ? { w: 1200, h: 164, font: 72, padL: 64, btn: 104 } : { w: 960, h: 148, font: 64, padL: 56, btn: 92 };
  return {
    width,
    height,
    wide,
    cx: width / 2,
    cy: height / 2,
    pill: { ...pill, x: (width - pill.w) / 2, y: (height - pill.h) / 2 },
    margin: wide ? 120 : 72,
    word: wide ? 168 : 132,
  };
};

export const monoWidth = (text: string, fontSize: number) =>
  text.length === 0 ? 0 : measureText({ text, fontFamily: MONO, fontSize, fontWeight: "400" }).width;

export const sansWidth = (text: string, fontSize: number, weight = "500", letterSpacing = "-0.03em") =>
  measureText({ text, fontFamily: FONT, fontSize, fontWeight: weight, letterSpacing }).width;
