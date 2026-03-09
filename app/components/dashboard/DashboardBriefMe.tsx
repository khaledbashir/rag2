"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Sparkles, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

type BriefProject = {
    id: string;
    clientName?: string;
    documentMode?: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
    updatedAt?: string;
    additionalNotes?: string | null;
    paymentTerms?: string | null;
    status?: string;
    pricingDocument?: {
        documentTotal?: number;
        currency?: string;
        tables?: Array<{ name?: string }>;
    } | null;
    screens?: Array<{ id: string }>;
};

interface DashboardBriefMeProps {
    projectId: string | null;
    isOpen: boolean;
    onClose: () => void;
}

const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount || 0);

export default function DashboardBriefMe({ projectId, isOpen, onClose }: DashboardBriefMeProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [project, setProject] = useState<BriefProject | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (!projectId || !isOpen) return;

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || `Failed to fetch project ${projectId}`);
                }
                const data = await res.json();
                if (!cancelled) setProject(data.project || null);
            } catch (err: any) {
                if (!cancelled) setError(err?.message || "Failed to load project brief");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [projectId, isOpen]);

    const computed = useMemo(() => {
        const tables = project?.pricingDocument?.tables || [];
        const total = Number(project?.pricingDocument?.documentTotal || 0);
        const currency = project?.pricingDocument?.currency || "USD";
        const screens = project?.screens?.length || 0;

        const needsAttention: string[] = [];
        if (!project?.additionalNotes?.trim()) needsAttention.push("No custom introduction text set.");
        if (!project?.paymentTerms?.trim()) needsAttention.push("Payment terms are empty.");
        if (project?.status === "DRAFT") needsAttention.push("Status is still in Draft.");

        return { tables, total, currency, screens, needsAttention };
    }, [project]);

    return (
        <div
            className={`fixed inset-y-0 right-0 w-full max-w-md z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300 ${
                isOpen ? "translate-x-0" : "translate-x-full"
            }`}
        >
            <div className="h-full flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-brand-blue" />
                        <h3 className="text-sm font-semibold text-foreground">
                            Brief Me{project?.clientName ? ` — ${project.clientName}` : ""}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    {loading && <div className="text-sm text-muted-foreground">Loading project brief...</div>}
                    {error && <div className="text-sm text-red-600">{error}</div>}

                    {!loading && !error && project && (
                        <>
                            <section className="space-y-1">
                                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Project Overview</h4>
                                <p className="text-sm text-foreground">
                                    {project.documentMode || "BUDGET"} document with {computed.tables.length} pricing section{computed.tables.length !== 1 ? "s" : ""} and {computed.screens} screen{computed.screens !== 1 ? "s" : ""}.
                                </p>
                                <p className="text-sm text-foreground">
                                    Total value: {computed.total > 0 ? formatCurrency(computed.total, computed.currency) : "—"}.
                                </p>
                                {project.updatedAt && (
                                    <p className="text-xs text-muted-foreground">
                                        Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                                    </p>
                                )}
                            </section>

                            <section className="space-y-2">
                                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Sections</h4>
                                <ul className="space-y-1 text-sm text-foreground">
                                    {computed.tables.length > 0 ? computed.tables.map((table, idx) => (
                                        <li key={`${table.name || "section"}-${idx}`} className="truncate">• {table.name || `Section ${idx + 1}`}</li>
                                    )) : <li className="text-muted-foreground">No pricing sections available.</li>}
                                </ul>
                            </section>

                            <section className="space-y-2">
                                <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Needs Attention</h4>
                                <ul className="space-y-1 text-sm text-foreground">
                                    {computed.needsAttention.length > 0
                                        ? computed.needsAttention.map((item) => <li key={item}>• {item}</li>)
                                        : <li className="text-muted-foreground">No immediate issues detected.</li>}
                                </ul>
                            </section>
                        </>
                    )}
                </div>

                {projectId && (
                    <div className="px-4 py-3 border-t border-border">
                        <button
                            onClick={() => router.push(`/projects/${projectId}`)}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-brand-blue text-white hover:opacity-90 transition-opacity text-sm font-medium"
                        >
                            Open Project
                            <ArrowUpRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

