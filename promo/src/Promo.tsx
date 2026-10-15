import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { HookReveal } from "./scenes/HookReveal";
import { Product } from "./scenes/Product";
import { Features } from "./scenes/Features";
import { Close } from "./scenes/Close";
import { dark } from "./theme";
import TL from "./timeline.json";

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: dark.bg }}>
      <Audio src={staticFile("audio/soundtrack.wav")} />
      {frame < TL.product.start && <HookReveal />}
      <Sequence from={TL.product.start} durationInFrames={TL.features.plan - TL.product.start} name="Product">
        <Product />
      </Sequence>
      <Sequence from={TL.features.plan} durationInFrames={TL.close.flip - TL.features.plan} name="Features">
        <Features />
      </Sequence>
      <Sequence from={TL.close.flip} durationInFrames={TL.durationInFrames - TL.close.flip} name="Close">
        <Close />
      </Sequence>
    </AbsoluteFill>
  );
};
