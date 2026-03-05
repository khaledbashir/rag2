"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const RfpAnalyzerClient = dynamic(() => import("./RfpAnalyzerClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading RFP Analyzer...</div>
    </div>
  ),
});

export default function RfpAnalyzerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading RFP Analyzer...</div>
      </div>
    }>
      <RfpAnalyzerClient />
    </Suspense>
  );
}
