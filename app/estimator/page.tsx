"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Calculator,
    Plus,
    Search,
    Monitor,
    DollarSign,
    Clock,
    Trash2,
    ExternalLink,
    FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useConfirm } from "@/hooks/useConfirm";
import { useEstimatorPresence } from "@/hooks/useEstimatorPresence";

interface Estimate {
    id: string;
    clientName: string;
    venue: string | null;
    clientCity: string | null;
    status: string;
    documentMode: string;
    screenCount: number;
    totalAmount: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
    createdByName: string | null;
    createdByImage: string | null;
    lastActivity: { action: string; description: string; actor: string | null; createdAt: string } | null;
}

const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount || 0);

export default function EstimatorListPage() {
    const router = useRouter();
    const { confirm } = useConfirm();
    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const presence = useEstimatorPresence();

    const fetchEstimates = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ calculationMode: "ESTIMATE" });
            if (searchQuery) params.append("search", searchQuery);
            const res = await fetch(`/api/projects?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setEstimates(data.projects || []);
        } catch (err) {
            console.error("Error fetching estimates:", err);
        } finally {
            setLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        const timer = setTimeout(fetchEstimates, 300);
        return () => clearTimeout(timer);
    }, [fetchEstimates]);

    const handleNewEstimate = useCallback(() => {
        setCreating(true);
        router.push("/estimator/new");
    }, [router]);

    const handleDelete = useCallback(async (id: string, name: string) => {
        const ok = await confirm({
            title: "Delete Estimate",
            description: `Delete "${name}"? This cannot be undone.`,
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete");
            setEstimates((prev) => prev.filter((e) => e.id !== id));
        } catch (err) {
            console.error("Delete failed:", err);
        }
    }, [confirm]);

    const totalValue = estimates.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

    return (
        <div className="flex-1 flex flex-col min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="sticky top-0 h-14 border-b border-border flex items-center justify-between gap-3 px-4 sm:px-6 bg-background/80 backdrop-blur-md z-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-emerald-500" />
                        <h1 className="text-sm font-semibold text-foreground tracking-tight">Estimates</h1>
                    </div>

                    <div className="h-5 w-px bg-border/60 hidden sm:block" />

                    <div className="relative group max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search estimates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-1.5 bg-transparent border-b border-border text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary transition-all"
                        />
                    </div>
                </div>

                <button
                    onClick={handleNewEstimate}
                    disabled={creating}
                    className="px-3.5 py-1.5 bg-emerald-500 text-white rounded hover:bg-emerald-600 active:bg-emerald-700 transition-colors text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                    {creating ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Plus className="w-3.5 h-3.5" />
                    )}
                    New Estimate
                </button>
            </header>

            <main className="flex-1 px-6 sm:px-10 lg:px-12 py-6 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-4">
                    {/* KPI Strip */}
                    <div className="flex items-baseline gap-6 sm:gap-8 pb-3">
                        <div>
                            <span className="text-lg font-medium text-foreground tabular-nums">{estimates.length}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">Estimates</span>
                        </div>
                        <div>
                            <span className="text-lg font-medium text-foreground tabular-nums">{formatCurrency(totalValue)}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">Total Value</span>
                        </div>
                    </div>

                    {loading && estimates.length === 0 ? (
                        <div className="space-y-px">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-12 animate-pulse bg-accent/50 rounded" />
                            ))}
                        </div>
                    ) : estimates.length === 0 ? (
                        <div className="text-center py-20">
                            <FileSpreadsheet className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground mb-4">
                                {searchQuery ? "No estimates match your search." : "No estimates yet. Create your first one."}
                            </p>
                            {!searchQuery && (
                                <button
                                    onClick={handleNewEstimate}
                                    disabled={creating}
                                    className="px-4 py-2 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 text-xs font-medium inline-flex items-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    New Estimate
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Column headers */}
                            <div className="sticky top-0 z-10 bg-background flex items-center gap-3 px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                                <div className="flex-1 min-w-0">Name</div>
                                <div className="hidden sm:block w-20 text-right shrink-0">Screens</div>
                                <div className="w-28 text-right shrink-0">Value</div>
                                <div className="hidden md:block w-24 shrink-0">Created by</div>
                                <div className="hidden lg:block w-32 text-right shrink-0">Last Activity</div>
                                <div className="w-16 shrink-0" />
                            </div>

                            <div className="space-y-px">
                                {estimates.map((est) => (
                                    <div
                                        key={est.id}
                                        className="group flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/estimator/${est.id}`)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-foreground truncate">
                                                    {est.clientName}
                                                </span>
                                                {/* Live presence: who's editing right now */}
                                                {presence[est.id] && presence[est.id].length > 0 && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className="relative flex h-1.5 w-1.5">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                                        </span>
                                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                            {presence[est.id].map(u => u.userName.split(" ")[0]).join(", ")}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {(est.venue || est.clientCity) && (
                                                <div className="text-[11px] text-muted-foreground truncate">
                                                    {[est.venue, est.clientCity].filter(Boolean).join(" · ")}
                                                </div>
                                            )}
                                        </div>

                                        <div className="hidden sm:flex items-center justify-end gap-1 w-20 shrink-0 text-[11px] text-muted-foreground">
                                            {est.screenCount > 0 && (
                                                <>
                                                    <Monitor className="w-3 h-3" />
                                                    {est.screenCount}
                                                </>
                                            )}
                                        </div>

                                        <div className="w-28 text-right shrink-0 text-sm font-medium text-foreground tabular-nums">
                                            {est.totalAmount > 0 ? formatCurrency(est.totalAmount, est.currency) : "—"}
                                        </div>

                                        <div className="hidden md:flex items-center gap-1.5 w-24 shrink-0">
                                            {est.createdByImage ? (
                                                <img src={est.createdByImage} alt="" className="w-4 h-4 rounded-full shrink-0" />
                                            ) : est.createdByName ? (
                                                <div className="w-4 h-4 rounded-full bg-muted text-[7px] font-bold flex items-center justify-center shrink-0">
                                                    {est.createdByName.split(" ").map(w => w[0]).join("").slice(0, 2)}
                                                </div>
                                            ) : null}
                                            <span className="text-[11px] text-muted-foreground truncate">
                                                {est.createdByName || "—"}
                                            </span>
                                        </div>

                                        <div className="hidden lg:block w-32 text-right shrink-0">
                                            {est.lastActivity ? (
                                                <div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {est.lastActivity.description.length > 30
                                                            ? est.lastActivity.description.slice(0, 30) + "..."
                                                            : est.lastActivity.description}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground/60">
                                                        {formatDistanceToNow(new Date(est.lastActivity.createdAt), { addSuffix: true })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-muted-foreground">
                                                    {formatDistanceToNow(new Date(est.updatedAt), { addSuffix: true })}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-16 shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); router.push(`/estimator/${est.id}`); }}
                                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                title="Open"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(est.id, est.clientName); }}
                                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
