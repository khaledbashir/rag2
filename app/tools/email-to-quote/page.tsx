"use client";

import dynamic from "next/dynamic";

const EmailToQuoteClient = dynamic(() => import("./EmailToQuoteClient"), {
    ssr: false,
    loading: () => (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading Email Intake...</div>
        </div>
    ),
});

export default function EmailToQuotePage() {
    return <EmailToQuoteClient />;
}
