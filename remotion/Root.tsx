import React from "react";
import { Composition } from "remotion";
import { ProposalVideo, type ProposalVideoProps } from "./ProposalVideo";

const defaultProps: ProposalVideoProps = {
  venueName: "Oklahoma City Arena",
  clientName: "Oklahoma City Thunder",
  displayCount: 72,
  totalScreens: 98,
  totalSqFt: 43026,
  totalCost: "$1,715,590",
  totalSelling: "$2,142,000",
  marginPct: "19.9%",
  displays: [
    { name: "Main Scoreboard", dims: "50'W x 5'H", pitch: "6mm" },
    { name: "Ribbon on Handrailing", dims: "600'W x 3'H", pitch: "5.95mm" },
    { name: "SE Corner — Gaylord & Reno", dims: "14'W x 48'H", pitch: "10mm" },
    { name: "Exterior at Thunder Alley", dims: "9.5'W x 20.5'H", pitch: "3.91mm" },
    { name: "Mezz Level — SW Family VIP", dims: "5.5'W x 32'H", pitch: "2.5mm" },
    { name: "Main Team Store Entry", dims: "9.5'W x 20.5'H", pitch: "2.5mm" },
    { name: "Founders Lounge Behind Bar", dims: "7'W x 7'H", pitch: "1.2mm" },
    { name: "Main Concourse — West Entry", dims: "10'W x 12'H", pitch: "2.5mm" },
    { name: "Event Level Service Tunnel", dims: "3'W x 9'H", pitch: "2.5mm" },
    { name: "Courtside Club Circulation", dims: "3'W x 8'H", pitch: "2.5mm" },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProposalVideo"
        component={ProposalVideo}
        durationInFrames={1650}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
      />
    </>
  );
};
