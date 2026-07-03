import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const SCENE_DURATION = 90;
const FADE_DURATION = 15;

const palette = {
  ink: "#0f172a",
  muted: "#5b6472",
  primary: "#2563eb",
  accent: "#0f766e",
  surface: "rgba(255,255,255,0.88)",
  border: "rgba(148,163,184,0.35)"
};

const useSceneOpacity = (frame: number, durationInFrames: number) => {
  const fadeIn = interpolate(frame, [0, FADE_DURATION], [0, 1], {
    extrapolateRight: "clamp"
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE_DURATION, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );
  return fadeIn * fadeOut;
};

const HeroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(frame, SCENE_DURATION);
  const scale = spring({ frame, fps, config: { damping: 200 } });
  const lift = interpolate(frame, [0, 24], [24, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity,
          transform: `translateY(${lift}px) scale(${0.92 + scale * 0.08})`,
          textAlign: "center"
        }}
      >
        <div
          style={{
            width: 160,
            height: 160,
            margin: "0 auto 24px",
            borderRadius: 36,
            background: "rgba(255,255,255,0.9)",
            border: `1px solid ${palette.border}`,
            display: "grid",
            placeItems: "center",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)"
          }}
        >
          <Img
            src={staticFile("icons/persona-icon-light-512.png")}
            style={{ width: 120, height: 120 }}
          />
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: palette.ink }}>Persona</div>
        <div style={{ fontSize: 24, color: palette.muted, marginTop: 12 }}>
          A classroom game of deception, roles, and rapid-fire chat
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TopicScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSceneOpacity(frame, SCENE_DURATION);
  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const slide = interpolate(entrance, [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity, transform: `translateY(${slide}px)`, textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: palette.ink }}>
          One topic per round
        </div>
        <div style={{ fontSize: 22, color: palette.muted, marginTop: 14 }}>
          Rooms of three — every student plays a role
        </div>
        <div
          style={{
            marginTop: 28,
            display: "inline-flex",
            gap: 12,
            padding: "10px 18px",
            borderRadius: 999,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            fontSize: 18,
            color: palette.ink
          }}
        >
          Real-time • Private DMs • Instructor oversight
        </div>
      </div>
    </AbsoluteFill>
  );
};

const RoleCard = ({
  label,
  color,
  delay
}: {
  label: string;
  color: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 200 }
  });
  const lift = interpolate(entry, [0, 1], [24, 0]);
  const opacity = interpolate(entry, [0, 1], [0, 1]);

  return (
    <div
      style={{
        flex: 1,
        padding: "22px 24px",
        borderRadius: 24,
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
        transform: `translateY(${lift}px)`,
        opacity
      }}
    >
      <div style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 2, color }}>
        Role
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: palette.ink, marginTop: 10 }}>
        {label}
      </div>
    </div>
  );
};

const RolesScene = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneOpacity(frame, SCENE_DURATION);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "78%", opacity }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: palette.ink, textAlign: "center" }}>
          Every room has three roles
        </div>
        <div
          style={{
            display: "flex",
            gap: 22,
            marginTop: 36
          }}
        >
          <RoleCard label="Real" color={palette.primary} delay={0} />
          <RoleCard label="Fake" color="#d97706" delay={8} />
          <RoleCard label="Interrogator" color={palette.accent} delay={16} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ClosingScene = () => {
  const frame = useCurrentFrame();
  const opacity = useSceneOpacity(frame, SCENE_DURATION);
  const glow = interpolate(frame, [0, 30], [0.2, 0.6], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", opacity }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: palette.ink }}>
          Real-time conversations.
        </div>
        <div style={{ fontSize: 24, color: palette.muted, marginTop: 12 }}>
          Built for classrooms, powered by Persona.
        </div>
        <div
          style={{
            marginTop: 28,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 20px",
            borderRadius: 999,
            background: "rgba(37,99,235,0.08)",
            border: `1px solid rgba(37,99,235,${0.3 + glow})`,
            color: palette.primary,
            fontWeight: 600
          }}
        >
          persona
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PersonaPromo = () => {
  return (
    <AbsoluteFill
      style={{
        fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif",
        background:
          "radial-gradient(1200px at 12% 8%, rgba(37,99,235,0.16), transparent 60%), radial-gradient(1000px at 92% 8%, rgba(15,118,110,0.16), transparent 55%), #f5f7fb",
        color: palette.ink
      }}
    >
      <Sequence from={0} durationInFrames={SCENE_DURATION} premountFor={30}>
        <HeroScene />
      </Sequence>
      <Sequence from={SCENE_DURATION} durationInFrames={SCENE_DURATION} premountFor={30}>
        <TopicScene />
      </Sequence>
      <Sequence from={SCENE_DURATION * 2} durationInFrames={SCENE_DURATION} premountFor={30}>
        <RolesScene />
      </Sequence>
      <Sequence from={SCENE_DURATION * 3} durationInFrames={SCENE_DURATION} premountFor={30}>
        <ClosingScene />
      </Sequence>
    </AbsoluteFill>
  );
};
