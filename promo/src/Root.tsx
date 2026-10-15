import React from "react";
import { Composition, Folder } from "remotion";
import "./fonts";
import { Promo } from "./Promo";
import { HookClip } from "./scenes/HookClip";
import TL from "./timeline.json";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo-1x1" component={Promo} width={1080} height={1080} fps={TL.fps} durationInFrames={TL.durationInFrames} />
    <Composition id="Promo-16x9" component={Promo} width={1920} height={1080} fps={TL.fps} durationInFrames={TL.durationInFrames} />
    <Folder name="Hooks">
      <Composition id="Hook-A" component={HookClip} width={1080} height={1080} fps={TL.fps} durationInFrames={150} defaultProps={{ variant: "A" as const }} />
      <Composition id="Hook-B" component={HookClip} width={1080} height={1080} fps={TL.fps} durationInFrames={150} defaultProps={{ variant: "B" as const }} />
      <Composition id="Hook-C" component={HookClip} width={1080} height={1080} fps={TL.fps} durationInFrames={150} defaultProps={{ variant: "C" as const }} />
    </Folder>
  </>
);
