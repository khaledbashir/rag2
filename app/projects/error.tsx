"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ProjectsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Projects page error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
            <AlertTriangle className="w-10 h-10 text-destructive mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-1">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Failed to load projects. This might be a temporary issue.
            </p>
            <button
                onClick={reset}
                className="px-4 py-2 bg-foreground text-background rounded text-xs font-medium hover:opacity-80 transition-opacity"
            >
                Try again
            </button>
        </div>
    );
}
