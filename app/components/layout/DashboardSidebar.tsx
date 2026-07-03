"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    LayoutGrid,
    FileText,
    Users,
    Workflow,
    Settings,
    DollarSign,
    Package,
    Calculator,
    X,
    UserCircle,
    Bell,
    Lock,
    LogOut,
    BarChart3,
    Kanban,
    Scan,
    ChevronRight,
    ChevronLeft,
    History,
    FileSpreadsheet,
    FileSignature,
    MailPlus,
    Bot,
    PanelLeftClose,
    PanelLeftOpen,
    Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRbac } from "@/hooks/useRbac";
import type { UserRole } from "@/lib/rbac";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Navigation Data ────────────────────────────────────────────────────────

interface NavItem {
    icon: typeof LayoutGrid;
    label: string;
    description?: string;
    href: string;
    allowedRoles: UserRole[] | null;
    soon?: boolean;
    beta?: boolean;
    devOnly?: boolean;
    demoPhase?: string;
    hidden?: boolean;
    children?: NavChild[];
}

interface NavChild {
    label: string;
    href: string;
    icon?: typeof LayoutGrid;
}

const mainMenuItems: NavItem[] = [
    { icon: LayoutGrid, label: "ANC Hub", description: "Open the unified ANC app launcher.", href: "/hub", allowedRoles: null },
    { icon: LayoutGrid, label: "Projects", description: "View all proposal, mirror, intelligence, and estimate records.", href: "/projects", allowedRoles: null },
    { icon: Kanban, label: "Pipeline", description: "Track proposal stages, approvals, and deal movement.", href: "/pipeline", allowedRoles: null },
];

const toolsMenuItems: NavItem[] = [
    { icon: Scan, label: "RFP Analyzer", description: "Upload bid documents and extract screens, requirements, and pricing.", href: "/tools/rfp-analyzer", allowedRoles: null, children: [
        { label: "New Analysis", href: "/tools/rfp-analyzer", icon: Scan },
        { label: "History", href: "/tools/rfp-analyzer/history", icon: History },
    ]},
    { icon: FileSignature, label: "SOW Builder", description: "Generate scopes of work from project and pricing details.", href: "/tools/sow-generator", allowedRoles: null, children: [
        { label: "New SOW", href: "/tools/sow-generator", icon: FileSignature },
        { label: "History", href: "/tools/sow-generator/history", icon: History },
    ]},
    { icon: FileSpreadsheet, label: "Spec Sheets", description: "Generate per-display product spec sheets and submittal forms.", href: "/tools/spec-generator", allowedRoles: null },
    { icon: MailPlus, label: "Email Intake", description: "Turn inbound estimate emails into reviewed estimator drafts.", href: "/tools/email-to-quote", allowedRoles: null },
    { icon: Bot, label: "Meeting Capture", description: "Schedule meeting recorders and sync recordings back to CRM.", href: "/meeting-capture", allowedRoles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] as UserRole[] },
    { icon: Calculator, label: "Estimator", description: "Build budgets, swap products, and export scoping workbooks.", href: "/estimator", allowedRoles: null, children: [
        { label: "New Estimate", href: "/estimator/new", icon: Calculator },
        { label: "History", href: "/estimator", icon: History },
    ]},
];

const settingsMenuItems: NavItem[] = [
    { icon: UserCircle, label: "Profile", href: "/settings/profile", allowedRoles: null },
    { icon: Bell, label: "Notifications", href: "/settings/notifications", soon: true, demoPhase: "3", allowedRoles: null },
    { icon: Users, label: "Users", href: "/admin/users", allowedRoles: ["ADMIN"] as UserRole[] },
];

const dataPricingMenuItems: NavItem[] = [
    { icon: Package, label: "Product Catalog", href: "/admin/products", allowedRoles: null },
    { icon: DollarSign, label: "Rate Card", href: "/admin/rate-card", allowedRoles: null },
    { icon: Workflow, label: "Pricing Logic", href: "/admin/pricing-logic", beta: true, allowedRoles: null },
];

const adminMenuItems: NavItem[] = [
    { icon: BarChart3, label: "Performance", href: "/admin/performance", demoPhase: "3", allowedRoles: ["ADMIN", "ESTIMATOR", "PROPOSAL_LEAD"] as UserRole[] },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { hasRole, userRole, isLoading } = useRbac();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const displayRole = userRole
        ? userRole.toLowerCase().split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
        : "Viewer";

    const isAdmin = mounted ? session?.user?.authRole === "admin" : false;
    const isPlatformOwner = mounted ? (session?.user?.email?.toLowerCase() === (process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL || "ahmad@assisted.vip").toLowerCase()) : false;

    const canAccess = (allowedRoles: UserRole[] | null): boolean => {
        if (!allowedRoles) return true;
        if (isLoading || !mounted) return false;
        return hasRole(allowedRoles);
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    // Auto-expand groups whose children are active
    useEffect(() => {
        const groups = new Set<string>();
        [...toolsMenuItems, ...mainMenuItems].forEach((item) => {
            if (item.children?.some((c) => pathname.startsWith(c.href))) {
                groups.add(item.label);
            }
            if (pathname.startsWith(item.href) && item.children) {
                groups.add(item.label);
            }
        });
        setExpandedGroups(groups);
    }, [pathname]);

    const toggleGroup = (label: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const isActive = (href: string) => pathname === href;
    const isParentActive = (item: NavItem) =>
        pathname === item.href ||
        pathname.startsWith(item.href + "/") ||
        Boolean(item.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/")));

    // ─── Render ─────────────────────────────────────────────────────────

    return (
        <>
            <aside
                className={cn(
                    "h-full border-r border-border bg-background flex flex-col z-50 transition-all duration-200 overflow-hidden shrink-0",
                    expanded ? "w-52" : "w-16",
                )}
            >
                {/* Logo + collapse toggle */}
                <div className={cn(
                    "flex items-center border-b border-border shrink-0",
                    expanded ? "px-4 py-3 justify-between" : "px-3 py-3 justify-center",
                )}>
                    <Link href="/projects" className="flex items-center gap-3 shrink-0">
                        <div className="w-9 h-9 flex items-center justify-center relative shrink-0">
                            <Image src="/ANC_Logo_2023_blue.png" alt="ANC" width={36} height={36} className="w-full h-auto object-contain dark:hidden" />
                            <Image src="/ANC_Logo_2023_white.png" alt="ANC" width={36} height={36} className="w-full h-auto object-contain hidden dark:block" />
                        </div>
                        {/* Logo only — no text badge */}
                    </Link>
                    {expanded && (
                        <button
                            onClick={() => setExpanded(false)}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Nav sections */}
                <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-5 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Main */}
                    <NavSection label="Main" expanded={expanded}>
                        {mainMenuItems.filter((i) => !i.hidden).map((item) => (
                            <NavItemRow
                                key={item.label}
                                item={item}
                                expanded={expanded}
                                isActive={isActive(item.href)}
                                isParentActive={isParentActive(item)}
                                canAccess={canAccess(item.allowedRoles)}
                                isGroupExpanded={expandedGroups.has(item.label)}
                                onToggleGroup={() => toggleGroup(item.label)}
                                pathname={pathname}
                            />
                        ))}
                    </NavSection>

                    {/* Tools */}
                    <NavSection label="Tools" expanded={expanded}>
                        {toolsMenuItems.filter((i) => !i.hidden).map((item) => (
                            <NavItemRow
                                key={item.label}
                                item={item}
                                expanded={expanded}
                                isActive={isActive(item.href)}
                                isParentActive={isParentActive(item)}
                                canAccess={canAccess(item.allowedRoles)}
                                isGroupExpanded={expandedGroups.has(item.label)}
                                onToggleGroup={() => toggleGroup(item.label)}
                                pathname={pathname}
                            />
                        ))}
                    </NavSection>
                </nav>

                {/* Bottom */}
                <div className="shrink-0 border-t border-border p-2 space-y-1">
                    {/* Expand toggle when collapsed */}
                    {!expanded && (
                        <button
                            onClick={() => setExpanded(true)}
                            className="w-full p-2.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                            title="Expand sidebar"
                        >
                            <PanelLeftOpen className="w-5 h-5" />
                        </button>
                    )}

                    {/* Settings */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className={cn(
                            "w-full rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center",
                            expanded ? "gap-3 px-3 py-2" : "justify-center p-2.5",
                        )}
                    >
                        <Settings className="w-5 h-5 shrink-0" />
                        {expanded && <span className="text-sm">Settings</span>}
                    </button>

                    {/* User */}
                    {expanded && (
                        <div className="px-3 py-2 rounded bg-muted/50">
                            <p className="text-sm font-medium text-foreground truncate">{session?.user?.name || "User"}</p>
                            <p className="text-xs text-muted-foreground truncate">{displayRole}</p>
                        </div>
                    )}

                    {/* Logout */}
                    <button
                        onClick={() => signOut({ callbackUrl: "/auth/login" })}
                        className={cn(
                            "w-full rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center",
                            expanded ? "gap-3 px-3 py-2" : "justify-center p-2.5",
                        )}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {expanded && <span className="text-sm">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-background border border-border rounded-lg shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
                            <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-accent rounded-lg transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-3">General</h3>
                                <div className="space-y-1">
                                    {settingsMenuItems.map((item) => {
                                        const hasAccess = canAccess(item.allowedRoles);
                                        if (item.allowedRoles && !hasAccess) return null;
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.soon ? "#" : item.href}
                                                onClick={() => !item.soon && setIsSettingsOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                                                    isActive(item.href) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                                                    item.soon && "pointer-events-none opacity-40",
                                                )}
                                            >
                                                <item.icon className="w-5 h-5" />
                                                <span className="text-sm font-medium">{item.label}</span>
                                                {item.soon && <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">Soon</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-foreground mb-3">Data & Pricing</h3>
                                <div className="space-y-1">
                                    {dataPricingMenuItems.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsSettingsOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                                                isActive(item.href)
                                                    ? item.beta ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                                                    : "text-foreground hover:bg-accent",
                                            )}
                                        >
                                            <item.icon className="w-5 h-5" />
                                            <span className="text-sm font-medium flex-1">{item.label}</span>
                                            {item.beta && <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">BETA</span>}
                                        </Link>
                                    ))}
                                </div>
                            </div>

                            {isAdmin && adminMenuItems.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                        Admin
                                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Admin Only</span>
                                    </h3>
                                    <div className="space-y-1">
                                        {adminMenuItems.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setIsSettingsOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                                                    isActive(item.href)
                                                        ? "bg-primary/10 text-primary"
                                                        : "text-foreground hover:bg-accent",
                                                )}
                                            >
                                                <item.icon className="w-5 h-5" />
                                                <span className="text-sm font-medium flex-1">{item.label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {isPlatformOwner && (
                            <div className="px-6 pb-4">
                                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                    Platform
                                    <span className="text-xs bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">Vendor</span>
                                </h3>
                                <div className="space-y-1">
                                    <Link
                                        href="/admin/ops"
                                        onClick={() => setIsSettingsOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                                            isActive("/admin/ops")
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                : "text-foreground hover:bg-accent",
                                        )}
                                    >
                                        <Radio className="w-5 h-5" />
                                        <span className="text-sm font-medium">Operations</span>
                                    </Link>
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-4 border-t border-border bg-muted/30">
                            <p className="text-xs text-muted-foreground">ANC Proposal Engine</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function NavSection({ label, expanded, children }: {
    label: string;
    expanded: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            {expanded && (
                <h3 className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {label}
                </h3>
            )}
            {!expanded && <div className="h-px bg-border mx-2 mb-2" />}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}

function NavItemRow({ item, expanded, isActive, isParentActive, canAccess, isGroupExpanded, onToggleGroup, pathname }: {
    item: NavItem;
    expanded: boolean;
    isActive: boolean;
    isParentActive: boolean;
    canAccess: boolean;
    isGroupExpanded: boolean;
    onToggleGroup: () => void;
    pathname: string;
}) {
    const isRestricted = item.allowedRoles && !canAccess;
    const hasChildren = item.children && item.children.length > 0;
    const Icon = isRestricted ? Lock : item.icon;

    const tooltipText = item.description || item.label;

    // Collapsed mode — icon only with tooltip
    if (!expanded) {
        return (
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            href={isRestricted ? "#" : item.href}
                            className={cn(
                                "group relative flex items-center justify-center p-2.5 rounded-lg transition-all duration-150",
                                (isActive || isParentActive) && canAccess
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                                (item.soon || isRestricted) && "pointer-events-none opacity-40",
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            {(isActive || isParentActive) && canAccess && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full" />
                            )}
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-64">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold">
                                {item.label}
                                {item.soon && " (Soon)"}
                            </div>
                            <div className="text-xs text-muted-foreground leading-relaxed">{tooltipText}</div>
                            {hasChildren && (
                                <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                                    {item.children!.map((c) => (
                                        <div key={c.href} className="text-[11px] text-muted-foreground">{c.label}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Expanded mode — full label + children
    return (
        <div>
            <div className="flex items-center">
                <TooltipProvider delayDuration={150}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link
                                href={isRestricted ? "#" : item.href}
                                className={cn(
                                    "flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                                    (isActive || isParentActive) && canAccess
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-foreground hover:bg-muted",
                                    (item.soon || isRestricted) && "pointer-events-none opacity-40",
                                )}
                            >
                                <Icon className="w-4.5 h-4.5 shrink-0" />
                                <span className="truncate flex-1">{item.label}</span>
                                {item.soon && <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">Soon</span>}
                                {item.beta && <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded ml-auto">BETA</span>}
                                {item.devOnly && <span className="text-[10px] bg-slate-500/20 text-slate-500 px-1.5 py-0.5 rounded ml-auto">Dev Only</span>}
                            </Link>
                        </TooltipTrigger>
                        {item.description && (
                            <TooltipContent side="right" className="max-w-64">
                                <div className="space-y-1">
                                    <div className="text-xs font-semibold">{item.label}</div>
                                    <div className="text-xs text-muted-foreground leading-relaxed">{item.description}</div>
                                </div>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
                {hasChildren && !isRestricted && (
                    <button
                        onClick={onToggleGroup}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    >
                        <ChevronRight className={cn(
                            "w-3.5 h-3.5 transition-transform duration-150",
                            isGroupExpanded && "rotate-90",
                        )} />
                    </button>
                )}
            </div>

            {/* Children */}
            {hasChildren && isGroupExpanded && (
                <div className="ml-4 pl-3 border-l border-border/50 mt-0.5 space-y-0.5">
                    {item.children!.map((child) => {
                        const childActive = pathname === child.href || (child.href !== item.href && pathname.startsWith(child.href + "/"));
                        const ChildIcon = child.icon;
                        return (
                            <Link
                                key={child.href}
                                href={child.href}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                                    childActive
                                        ? "bg-primary/8 text-primary font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                                )}
                            >
                                {ChildIcon && <ChildIcon className="w-3.5 h-3.5" />}
                                <span className="truncate">{child.label}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
