"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
    Calculator,
    FolderOpen,
    LayoutGrid,
    List,
    Plus,
    Search,
    X,
} from "lucide-react";
import NewProjectModal from "@/app/components/modals/NewProjectModal";
import ProjectCard, { type DashboardStatus, type ProjectCardData } from "@/app/components/ProjectCard";
import DashboardChat from "@/app/components/DashboardChat";
import DashboardBriefMe from "@/app/components/dashboard/DashboardBriefMe";
import CopilotPanel from "@/app/components/chat/CopilotPanel";
import PromptLibraryPanel from "@/app/components/dashboard/PromptLibraryPanel";
import { FEATURES } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

const statusFilters = [
    { key: "all", label: "Overview" },
    { key: "DRAFT", label: "Drafts" },
    { key: "APPROVED", label: "Approved" },
    { key: "SIGNED", label: "Signed" },
];

const typeFilters = [
    { key: "all", label: "All Types" },
    { key: "BUDGET", label: "Budgets" },
    { key: "PROPOSAL", label: "Proposals" },
    { key: "LOI", label: "Short Forms" },
    { key: "CONTRACT", label: "Contracts" },
];

const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount || 0);

const formatCompactCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(amount || 0);

function generateInsights(projects: ProjectCardData[]): string[] {
    const insights: string[] = [];

    const staleCount = projects.filter((project) => {
        const daysSinceUpdate = (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceUpdate > 7 && project.status === "DRAFT";
    }).length;
    if (staleCount > 0) {
        insights.push(`${staleCount} proposal${staleCount > 1 ? "s" : ""} unchanged for 7+ days — may need follow-up`);
    }

    const sortedByValue = [...projects].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));
    if (sortedByValue[0]?.totalAmount > 0) {
        insights.push(`${sortedByValue[0].clientName} is your highest-value deal at ${formatCurrency(sortedByValue[0].totalAmount, sortedByValue[0].currency)}`);
    }

    const recentCount = projects.filter((project) => {
        const hoursSinceUpdate = (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate < 24;
    }).length;
    if (recentCount > 0) {
        insights.push(`${recentCount} project${recentCount > 1 ? "s" : ""} updated in the last 24 hours`);
    }

    const intelligenceCount = projects.filter((project) => !project.mirrorMode).length;
    if (intelligenceCount > 0) {
        insights.push(`${intelligenceCount} Intelligence Mode project${intelligenceCount > 1 ? "s" : ""} in progress`);
    }

    return insights.slice(0, 3);
}

export default function ProjectsPage() {
    const { data: session } = useSession();
    const { alert: showAlert } = useConfirm();
    const [projects, setProjects] = useState<ProjectCardData[]>([]);
    const [globalStats, setGlobalStats] = useState<{
        totalProjects: number;
        mirrorCount: number;
        intelligenceCount: number;
        estimateCount: number;
        totalPipeline: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [briefProjectId, setBriefProjectId] = useState<string | null>(null);
    const [isBriefOpen, setIsBriefOpen] = useState(false);
    const router = useRouter();

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            if (statusFilter !== "all") params.append("status", statusFilter);
            if (typeFilter !== "all") params.append("documentMode", typeFilter);

            const response = await fetch(`/api/projects?${params.toString()}`, { cache: "no-store" });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Failed to fetch projects");
            }
            const data = await response.json();
            setProjects(data.projects || []);
            if (data.stats) setGlobalStats(data.stats);
        } catch (error) {
            console.error("Error fetching projects:", error);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, statusFilter, typeFilter]);

    useEffect(() => {
        const timer = setTimeout(fetchProjects, 300);
        return () => clearTimeout(timer);
    }, [fetchProjects]);

    const summary = useMemo(() => {
        // Use server-side global stats (all projects, no pagination/filter limits)
        const projectCount = globalStats?.totalProjects ?? projects.length;
        const estimateCount = globalStats?.estimateCount ?? projects.filter((project: any) => project.calculationMode === "ESTIMATE").length;
        const mirrorCount = globalStats?.mirrorCount ?? projects.filter((project: any) => project.calculationMode === "MIRROR").length;
        const intelligenceCount = globalStats?.intelligenceCount ?? projects.filter((project: any) => project.calculationMode === "INTELLIGENCE").length;
        const totalPipeline = globalStats?.totalPipeline ?? projects.reduce((sum, project) => sum + (project.totalAmount || 0), 0);
        const formattedPipeline = formatCurrency(totalPipeline, "USD");
        const filterLabel = statusFilter === "all"
            ? "All Projects"
            : statusFilter === "DRAFT"
                ? "Drafts"
                : statusFilter === "APPROVED"
                    ? "Approved"
                    : "Signed";

        return {
            projectCount,
            mirrorCount,
            intelligenceCount,
            estimateCount,
            totalPipeline,
            formattedPipeline,
            filterLabel,
        };
    }, [projects, globalStats, statusFilter]);

    // Time-dependent values computed client-side only to avoid hydration mismatch
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => { setNow(Date.now()); }, [projects]);

    const insights = useMemo(() => now != null ? generateInsights(projects) : [], [projects, now]);
    const heroGreeting = useMemo(() => {
        const firstName = session?.user?.name?.trim()?.split(/\s+/)?.[0] || null;
        const totalProjectCount = globalStats?.totalProjects ?? projects.length;
        const totalValue = globalStats?.totalPipeline ?? projects.reduce((sum, project) => sum + (project.totalAmount || 0), 0);

        // Use a stable greeting on server, real time on client
        if (now == null) {
            const title = firstName ? `Welcome, ${firstName}` : `Welcome`;
            return { title, line: `${totalProjectCount} projects in the pipeline worth ${formatCompactCurrency(totalValue)}.` };
        }

        const hour = new Date(now).getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const updatedTodayCount = projects.filter((project) => {
            const hoursSinceUpdate = (now - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60);
            return hoursSinceUpdate < 24;
        }).length;
        const staleCount = projects.filter((project) => {
            const daysSinceUpdate = (now - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceUpdate > 7 && project.status === "DRAFT";
        }).length;
        const topDeal = [...projects].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))[0];

        const title = firstName ? `${greeting}, ${firstName}` : greeting;
        const lines: string[] = [];

        lines.push(`${totalProjectCount} projects in the pipeline worth ${formatCompactCurrency(totalValue)}.`);

        if (updatedTodayCount > 0) {
            lines.push(`${updatedTodayCount} proposal${updatedTodayCount > 1 ? "s" : ""} updated today`);
        }

        if (topDeal?.clientName && topDeal.totalAmount > 0) {
            lines.push(`${topDeal.clientName} is your biggest deal at ${formatCompactCurrency(topDeal.totalAmount, topDeal.currency || "USD")}`);
        }

        if (staleCount > 0) {
            lines.push(`${staleCount} draft${staleCount > 1 ? "s haven't" : " hasn't"} been touched in over a week`);
        }

        return {
            title,
            line: lines.slice(0, 2).join(". ") + (lines.length > 0 ? "." : ""),
        };
    }, [projects, globalStats, session?.user?.name, now]);

    const handleStatusChange = useCallback(async (id: string, nextStatus: DashboardStatus) => {
        const response = await fetch(`/api/projects/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Failed to update status to ${nextStatus}`);
        }

        setProjects((current) =>
            current
                .map((project) => (project.id === id ? { ...project, status: nextStatus } : project))
                .filter((project) => (statusFilter === "all" ? true : project.status === statusFilter))
        );
    }, [statusFilter]);

    const handleBriefMe = useCallback((id: string) => {
        setBriefProjectId(id);
        setIsBriefOpen(true);
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        try {
            const response = await fetch(`/api/projects/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || "Failed to delete project");
            }

            setProjects((current) => current.filter((project) => project.id !== id));
        } catch (error) {
            console.error("Error deleting project:", error);
            void showAlert({ title: "Delete Failed", description: "Failed to delete project. Please try again." });
        }
    }, []);

    const copilotContext = useMemo(() => {
        const topProjects = [...projects]
            .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
            .slice(0, 3)
            .map((project) => `${project.clientName} (${formatCurrency(project.totalAmount, project.currency)})`)
            .join(", ");
        const staleCount = projects.filter((project) => {
            const days = (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
            return days > 7 && project.status === "DRAFT";
        }).length;
        return `Pipeline: ${summary.projectCount} projects, ${summary.formattedPipeline} total value, ${summary.mirrorCount} Mirror, ${summary.intelligenceCount} Intelligence. Top projects: ${topProjects || "None"}. ${staleCount} stale draft projects.`;
    }, [projects, summary]);

    const dashboardChatStats = useMemo(() => {
        const staleCount = projects.filter((p) => {
            const days = (Date.now() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
            return days > 7 && p.status === "DRAFT";
        }).length;
        const mostRecent = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        return {
            projectCount: summary.projectCount,
            mirrorCount: summary.mirrorCount,
            intelligenceCount: summary.intelligenceCount,
            formattedPipeline: summary.formattedPipeline,
            staleCount,
            recentProjectName: mostRecent?.clientName,
        };
    }, [projects, summary]);

    const handleCopilotMessage = useCallback(async (message: string) => {
        const lower = message.toLowerCase();

        // Local navigation shortcuts (need client-side router)
        if (lower.startsWith("open ")) {
            const query = lower.replace(/^open\s+/, "").trim();
            const match = projects.find((project) => project.clientName.toLowerCase().includes(query));
            if (match) {
                router.push(`/projects/${match.id}`);
                return `Opening ${match.clientName}.`;
            }
            return `I couldn't find a project matching "${query}".`;
        }
        if (lower.includes("start a new") || lower.includes("new project") || lower.includes("new budget")) {
            router.push("/projects/new");
            return "Opening new project setup.";
        }

        // Everything else → real AI via AnythingLLM dashboard workspace
        try {
            const res = await fetch("/api/copilot/dashboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    pipelineContext: copilotContext,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                return `AI error: ${data.response || data.error || res.statusText}`;
            }
            return data.response || "No response received.";
        } catch (err: any) {
            return `AI connection error: ${err?.message || String(err)}`;
        }
    }, [copilotContext, projects, router]);

    return (
        <div className="flex min-h-screen min-w-0 bg-background text-muted-foreground selection:bg-brand-blue/30 overflow-x-hidden">
            <div className="flex-1 flex flex-col min-w-0 relative overflow-x-hidden">
                <header className="sticky top-0 h-14 border-b border-border flex items-center justify-between gap-3 px-4 sm:px-6 bg-background/80 backdrop-blur-md z-50 min-w-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Link href="/" className="flex items-center gap-2 shrink-0">
                            <span className="text-foreground font-semibold text-sm tracking-tight">ANC</span>
                        </Link>

                        <div className="h-5 w-px bg-border/60 hidden sm:block" />

                        <div className="relative group max-w-sm w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                            <input
                                type="text"
                                placeholder="Search projects..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-8 py-1.5 bg-transparent border-b border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary transition-all duration-200"
                            />
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground rounded-sm border border-border">
                                    ⌘K
                                </kbd>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <Link
                            href="/estimator/new"
                            className="px-3.5 py-1.5 border border-border text-foreground rounded hover:bg-muted transition-colors text-xs font-medium flex items-center gap-1.5"
                        >
                            <Calculator className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">New Estimate</span>
                        </Link>
                        <NewProjectModal>
                            <button className="px-3.5 py-1.5 bg-foreground text-background rounded hover:opacity-80 active:opacity-70 transition-opacity duration-150 text-xs font-medium flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">New Project</span>
                                <span className="sm:hidden">New</span>
                            </button>
                        </NewProjectModal>
                    </div>
                </header>

                <main className="flex-1 pt-6 pb-48 px-6 sm:px-10 lg:px-12 overflow-y-auto">
                    <div className="max-w-7xl mx-auto space-y-5">
                        {/* Hero */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-semibold text-foreground tracking-tight leading-tight">
                                    {heroGreeting.title}
                                </h1>
                                <p className="text-xs text-muted-foreground mt-0.5">{heroGreeting.line}</p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex gap-1 shrink-0">
                                    {statusFilters.map((filter) => (
                                        <button
                                            key={filter.key}
                                            onClick={() => setStatusFilter(filter.key)}
                                            className={cn(
                                                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-150",
                                                statusFilter === filter.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="h-4 w-px bg-border/60" />

                                <div className="flex gap-1 shrink-0">
                                    {typeFilters.map((filter) => (
                                        <button
                                            key={filter.key}
                                            onClick={() => setTypeFilter(filter.key)}
                                            className={cn(
                                                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-150",
                                                typeFilter === filter.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>

                                <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
                                    {viewMode === "grid" ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {loading && projects.length === 0 ? (
                            <div className="space-y-px">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <div key={i} className="h-12 animate-pulse bg-accent/50" />
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* KPI Strip */}
                                <div className="flex items-baseline gap-6 sm:gap-8 pb-3">
                                    <div>
                                        <span className="text-lg font-medium text-foreground tabular-nums">{summary.projectCount}</span>
                                        <span className="text-[10px] text-muted-foreground ml-1.5">{summary.filterLabel}</span>
                                    </div>
                                    <div>
                                        <span className="text-lg font-medium text-foreground tabular-nums">{summary.mirrorCount}</span>
                                        <span className="text-[10px] text-muted-foreground ml-1.5">Mirror</span>
                                    </div>
                                    <div>
                                        <span className="text-lg font-medium text-foreground tabular-nums">{summary.intelligenceCount}</span>
                                        <span className="text-[10px] text-muted-foreground ml-1.5">Intelligence</span>
                                    </div>
                                    <div>
                                        <span className="text-lg font-medium text-emerald-500 tabular-nums">{summary.estimateCount}</span>
                                        <span className="text-[10px] text-muted-foreground ml-1.5">Estimates</span>
                                    </div>
                                    <div>
                                        <span className="text-lg font-medium text-foreground tabular-nums">{summary.formattedPipeline}</span>
                                        <span className="text-[10px] text-muted-foreground ml-1.5">Pipeline</span>
                                    </div>
                                </div>

                                {projects.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <FolderOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
                                        <p className="text-sm font-medium text-muted-foreground">No projects found</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                                            {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                                                ? "Try adjusting your search or filters."
                                                : "Create your first project to get started."}
                                        </p>
                                        {(searchQuery || statusFilter !== "all" || typeFilter !== "all") && (
                                            <button
                                                onClick={() => { setSearchQuery(""); setStatusFilter("all"); setTypeFilter("all"); }}
                                                className="mt-3 text-xs text-primary hover:underline"
                                            >
                                                Clear all filters
                                            </button>
                                        )}
                                    </div>
                                ) : viewMode === "list" ? (
                                    <div className="space-y-px">
                                        {/* Column headers */}
                                        <div className="sticky top-0 z-10 bg-background flex items-center gap-3 px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                                            <div className="flex-1 min-w-0">Name</div>
                                            <div className="hidden sm:block w-20 shrink-0">Type</div>
                                            <div className="hidden md:block w-24 shrink-0">Status</div>
                                            <div className="hidden lg:block w-20 text-right shrink-0">Screens</div>
                                            <div className="hidden lg:block w-24 shrink-0">Created by</div>
                                            <div className="w-28 text-right shrink-0">Value</div>
                                            <div className="hidden xl:block w-28 text-right shrink-0">Updated</div>
                                            <div className="w-16 shrink-0" />
                                        </div>
                                        {projects.map((project) => (
                                            <ProjectCard
                                                key={project.id}
                                                project={project}
                                                onStatusChange={handleStatusChange}
                                                onBriefMe={handleBriefMe}
                                                onDelete={handleDelete}
                                                viewMode="list"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                        {projects.map((project) => (
                                            <ProjectCard
                                                key={project.id}
                                                project={project}
                                                onStatusChange={handleStatusChange}
                                                onBriefMe={handleBriefMe}
                                                onDelete={handleDelete}
                                                viewMode="grid"
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>

                {FEATURES.DASHBOARD_CHAT && (
                    <div className="fixed bottom-0 left-16 md:left-20 right-0 p-4 sm:p-8 flex justify-center pointer-events-none z-40">
                        <div className="w-full max-w-3xl min-w-0 pointer-events-auto">
                            <DashboardChat pipelineStats={dashboardChatStats} />
                        </div>
                    </div>
                )}

                <DashboardBriefMe projectId={briefProjectId} isOpen={isBriefOpen} onClose={() => setIsBriefOpen(false)} />

                {/* AI Operations Prompt Library — hidden for now */}


                <div className="fixed bottom-6 right-6 z-50">
                    <CopilotPanel
                        onSendMessage={handleCopilotMessage}
                        quickActions={[
                            { label: dashboardChatStats.formattedPipeline || "Pipeline Value", prompt: "What's my total pipeline value and how is it distributed?" },
                            { label: dashboardChatStats.staleCount > 0 ? `${dashboardChatStats.staleCount} Stale Drafts` : "Needs Attention", prompt: dashboardChatStats.staleCount > 0 ? `Show me the ${dashboardChatStats.staleCount} stale draft projects.` : "Which projects need attention?" },
                            { label: dashboardChatStats.recentProjectName ? `Latest: ${dashboardChatStats.recentProjectName.slice(0, 15)}` : "New Proposal", prompt: dashboardChatStats.recentProjectName ? `What do we know about the ${dashboardChatStats.recentProjectName} project?` : "Start a new budget proposal." },
                        ]}
                        className="!bottom-0 !right-0"
                    />
                </div>
            </div>
        </div>
    );
}
