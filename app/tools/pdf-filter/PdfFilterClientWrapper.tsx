"use client";

import dynamic from "next/dynamic";

const PdfFilterClient = dynamic(() => import("./PdfFilterClient"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading PDF Filter...</div>
    </div>
  ),
});

export default function PdfFilterClientWrapper() {
  return <PdfFilterClient />;
}
