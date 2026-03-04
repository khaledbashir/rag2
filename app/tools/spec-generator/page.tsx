"use client";

import dynamic from "next/dynamic";

const SpecGeneratorClient = dynamic(
  () => import("./SpecGeneratorClient"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading Spec Generator...</div>
      </div>
    ),
  }
);

export default function SpecGeneratorPage() {
  return <SpecGeneratorClient />;
}
