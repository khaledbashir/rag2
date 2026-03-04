"use client";

import dynamic from "next/dynamic";

const SpecGeneratorClient = dynamic(
  () => import("./SpecGeneratorClient"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading Spec Generator...</div>
      </div>
    ),
  }
);

export default function SpecGeneratorPage() {
  return <SpecGeneratorClient />;
}
