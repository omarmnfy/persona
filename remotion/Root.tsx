import { Composition } from "remotion";
import { PersonaPromo } from "./PersonaPromo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="PersonaPromo"
      component={PersonaPromo}
      durationInFrames={360}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
