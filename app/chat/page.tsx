"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

const ANYTHINGLLM_URL = process.env.NEXT_PUBLIC_ANYTHING_LLM_URL || "";

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
    const src = useMemo(() => {
        if (!ANYTHINGLLM_URL) return null;
        return workspace
            ? `${ANYTHINGLLM_URL}/workspace/${workspace}`
            : ANYTHINGLLM_URL;
    }, [workspace]);

    if (!src) {
        return (
            <div className="flex h-screen items-center justify-center bg-background px-6 text-center">
                <div className="max-w-md space-y-2">
                    <h1 className="text-lg font-semibold">Chat is not configured</h1>
                    <p className="text-sm text-muted-foreground">
                        `NEXT_PUBLIC_ANYTHING_LLM_URL` is missing, so this page cannot open the external chat workspace.
                    </p>
                </div>
            </div>
        );
    }

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
