import React from "react";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import TL from "../timeline.json";
import { HookReveal } from "./HookReveal";

/** One of the three 2.5 s opening variants, with its own typing sound. */
export const HookClip: React.FC<{ variant: "A" | "B" | "C" }> = ({ variant }) => (
  <>
    <Audio src={staticFile(`audio/hook-${variant}.wav`)} />
    <HookReveal text={TL.hook.texts[variant]} />
  </>
);
