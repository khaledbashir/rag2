import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Sequence,
  Img,
  staticFile,
} from "remotion";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProposalVideoProps {
  venueName: string;
  clientName: string;
  displayCount: number;
  totalScreens: number;
  totalSqFt: number;
  totalCost: string;
  totalSelling: string;
  marginPct: string;
  displays: { name: string; dims: string; pitch: string }[];
}

// ─── Brand Constants ───────────────────────────────────────────────────────

const ANC_BLUE = "#0A52EF";
const ANC_DARK = "#061B3D";
const WHITE = "#FFFFFF";
const LIGHT_BG = "#F0F4FF";

// ─── Components ────────────────────────────────────────────────────────────

const FadeIn: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame - delay, [0, 15], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity, transform: `translateY(${y}px)` }}>{children}</div>
  );
};

const CountUp: React.FC<{ value: number; delay?: number; prefix?: string; suffix?: string }> = ({
  value,
  delay = 0,
  prefix = "",
  suffix = "",
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const current = Math.round(value * progress);
  return (
    <span>
      {prefix}
      {current.toLocaleString()}
      {suffix}
    </span>
  );
};

// ─── Scene 1: Title Card ───────────────────────────────────────────────────

const TitleCard: React.FC<ProposalVideoProps> = ({ venueName, clientName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barWidth = spring({ frame, fps, config: { damping: 20 } }) * 100;
  const titleOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subtitleOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${ANC_DARK} 0%, #0B2E6B 100%)`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 6,
          width: `${barWidth}%`,
          background: ANC_BLUE,
        }}
      />

      {/* ANC Logo text */}
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: ANC_BLUE,
          letterSpacing: 8,
          marginBottom: 40,
          opacity: titleOpacity,
        }}
      >
        anc
      </div>

      {/* Venue Name */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: WHITE,
          textAlign: "center",
          opacity: titleOpacity,
          maxWidth: "80%",
          lineHeight: 1.2,
        }}
      >
        {venueName}
      </div>

      {/* Client */}
      <div
        style={{
          fontSize: 28,
          color: "rgba(255,255,255,0.6)",
          marginTop: 16,
          opacity: subtitleOpacity,
        }}
      >
        Prepared for {clientName}
      </div>

      {/* Bottom line */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          fontSize: 16,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: 4,
          opacity: subtitleOpacity,
        }}
      >
        LED DISPLAY INTEGRATION
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Stats ────────────────────────────────────────────────────────

const StatsScene: React.FC<ProposalVideoProps> = ({
  displayCount,
  totalScreens,
  totalSqFt,
  totalSelling,
}) => {
  const frame = useCurrentFrame();

  const stats = [
    { label: "Displays", value: displayCount, suffix: "" },
    { label: "Total Screens", value: totalScreens, suffix: "" },
    { label: "Square Feet", value: totalSqFt, suffix: "" },
  ];

  return (
    <AbsoluteFill
      style={{
        background: LIGHT_BG,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <FadeIn>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: ANC_BLUE,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 40,
          }}
        >
          Project Overview
        </div>
      </FadeIn>

      <div style={{ display: "flex", gap: 80 }}>
        {stats.map((stat, i) => (
          <FadeIn key={stat.label} delay={10 + i * 8}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 800,
                  color: ANC_DARK,
                  lineHeight: 1,
                }}
              >
                <CountUp value={stat.value} delay={10 + i * 8} suffix={stat.suffix} />
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: "#6B7280",
                  marginTop: 8,
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </div>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={40}>
        <div
          style={{
            marginTop: 60,
            padding: "20px 50px",
            background: ANC_BLUE,
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 20, color: "rgba(255,255,255,0.7)" }}>
            Project Total
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: WHITE,
              marginTop: 4,
            }}
          >
            {totalSelling}
          </div>
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Display List ─────────────────────────────────────────────────

const DisplayList: React.FC<ProposalVideoProps> = ({ displays }) => {
  const frame = useCurrentFrame();
  const visibleDisplays = displays.slice(0, 8); // Show max 8

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${ANC_DARK} 0%, #0B2E6B 100%)`,
        padding: 60,
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <FadeIn>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: ANC_BLUE,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          Display Configuration
        </div>
      </FadeIn>

      {visibleDisplays.map((d, i) => (
        <FadeIn key={d.name} delay={8 + i * 6}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 24px",
              marginBottom: 8,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 8,
              borderLeft: `3px solid ${ANC_BLUE}`,
            }}
          >
            <div style={{ color: WHITE, fontSize: 22, fontWeight: 600 }}>
              {d.name}
            </div>
            <div style={{ display: "flex", gap: 30 }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>
                {d.dims}
              </div>
              <div
                style={{
                  color: ANC_BLUE,
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {d.pitch}
              </div>
            </div>
          </div>
        </FadeIn>
      ))}

      {displays.length > 8 && (
        <FadeIn delay={60}>
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 16,
              textAlign: "center",
              marginTop: 16,
            }}
          >
            + {displays.length - 8} more displays
          </div>
        </FadeIn>
      )}
    </AbsoluteFill>
  );
};

// ─── Scene 4: Closing ──────────────────────────────────────────────────────

const Closing: React.FC<ProposalVideoProps> = ({ venueName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 15 } });

  return (
    <AbsoluteFill
      style={{
        background: ANC_DARK,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: ANC_BLUE,
            letterSpacing: 6,
          }}
        >
          anc
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.4)",
            marginTop: 16,
            letterSpacing: 2,
          }}
        >
          www.anc.com
        </div>
      </div>

      <FadeIn delay={20}>
        <div
          style={{
            position: "absolute",
            bottom: 80,
            fontSize: 16,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          {venueName} — LED Display Integration Proposal
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Main Composition ──────────────────────────────────────────────────────

const BackgroundMusic: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Fade in over first 30 frames, fade out over last 30 frames
  // Duck to 12% when voice is playing (frames 10-300), 25% otherwise
  const musicVol = interpolate(
    frame,
    [0, 10, 15, durationInFrames - 45, durationInFrames - 30, durationInFrames],
    [0, 0.25, 0.12, 0.12, 0.25, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <Audio src={staticFile("audio/bg-music.mp3")} volume={musicVol} />;
};

const Voiceover: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const volume = interpolate(
    frame,
    [0, 5, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <Audio src={staticFile("audio/voiceover.mp3")} volume={volume} />;
};

export const ProposalVideo: React.FC<ProposalVideoProps> = (props) => {
  return (
    <AbsoluteFill>
      <BackgroundMusic />
      <Voiceover />
      {/* Scene 1: Title — 0s to ~5s */}
      <Sequence from={0} durationInFrames={150}>
        <TitleCard {...props} />
      </Sequence>
      {/* Scene 2: Stats — ~5s to ~18s */}
      <Sequence from={150} durationInFrames={390}>
        <StatsScene {...props} />
      </Sequence>
      {/* Scene 3: Display list — ~18s to ~45s */}
      <Sequence from={540} durationInFrames={810}>
        <DisplayList {...props} />
      </Sequence>
      {/* Scene 4: Closing — ~45s to ~55s */}
      <Sequence from={1350} durationInFrames={300}>
        <Closing {...props} />
      </Sequence>
    </AbsoluteFill>
  );
};
