"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
    /**
     * "icon" — the compact square button used in page headers.
     * "row"  — a full-width sidebar row that matches Settings / Sign Out.
     */
    variant?: "icon" | "row";
    /** Sidebar rows show their label only while the sidebar is expanded. */
    expanded?: boolean;
    className?: string;
}

/**
 * The single theme switcher for the whole app.
 *
 * Reads `resolvedTheme`, not `theme`: with system preference enabled `theme`
 * can be the string "system", which never equals "dark" and left the control
 * showing the wrong icon — and toggling from it sent you to the theme you were
 * already looking at. `resolvedTheme` is always the concrete theme on screen.
 *
 * Nothing is rendered until mount. The server has no way to know which theme
 * the browser will pick, so rendering an icon during SSR guarantees a
 * hydration mismatch; a same-size placeholder holds the layout instead.
 */
export function ThemeToggle({ variant = "icon", expanded = true, className }: ThemeToggleProps) {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    const isDark = resolvedTheme === "dark";
    const toggle = () => setTheme(isDark ? "light" : "dark");
    const label = isDark ? "Light mode" : "Dark mode";

    if (variant === "row") {
        return (
            <button
                type="button"
                onClick={toggle}
                aria-label={mounted ? label : "Toggle theme"}
                title={mounted ? label : "Toggle theme"}
                className={cn(
                    "w-full rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center",
                    expanded ? "gap-3 px-3 py-2" : "justify-center p-2.5",
                    className,
                )}
            >
                {mounted && isDark ? (
                    <Sun className="w-5 h-5 shrink-0" />
                ) : (
                    <Moon className="w-5 h-5 shrink-0" />
                )}
                {expanded && <span className="text-sm">{mounted ? label : "Theme"}</span>}
            </button>
        );
    }

    if (!mounted) {
        return <div className={cn("w-9 h-9", className)} aria-hidden />;
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn(
                "w-9 h-9 px-0 border border-zinc-200 dark:border-zinc-800 rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                className,
            )}
            title={label}
        >
            {isDark ? (
                <Moon className="h-[1.2rem] w-[1.2rem] text-zinc-600 dark:text-zinc-400" />
            ) : (
                <Sun className="h-[1.2rem] w-[1.2rem] text-zinc-600 dark:text-zinc-400" />
            )}
            <span className="sr-only">{label}</span>
        </Button>
    );
}
