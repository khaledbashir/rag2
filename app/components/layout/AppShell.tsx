"use client";

import React from "react";
import { usePathname } from "next/navigation";
import DashboardSidebar from "@/app/components/layout/DashboardSidebar";

const SIDEBAR_EXCLUDED_PREFIXES = ["/api", "/auth", "/share", "/catalog"];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || "";
    const showSidebar = !SIDEBAR_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    if (!showSidebar) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen min-w-0 bg-background text-foreground overflow-hidden">
            <DashboardSidebar />
            <div className="flex-1 min-w-0 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
