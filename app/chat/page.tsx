"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ANYTHINGLLM_URL =
    process.env.NEXT_PUBLIC_ANYTHING_LLM_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://proposals.anc.com";

/**
 * Full-page AnythingLLM iframe.
 *
 * Usage:
 *   /chat                          → loads default AnythingLLM view
 *   /chat?workspace=client-slug    → loads specific workspace for a project
 */
function ChatFrame() {
    const params = useSearchParams();
    const workspace = params.get("workspace");

    const src = workspace
        ? `${ANYTHINGLLM_URL}/workspace/${workspace}`
        : ANYTHINGLLM_URL;

    return (
        <iframe
            src={src}
            className="w-full h-screen border-0"
            allow="clipboard-write; microphone"
        />
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="w-full h-screen bg-[#1e1e2e]" />}>
            <ChatFrame />
        </Suspense>
    );
}
