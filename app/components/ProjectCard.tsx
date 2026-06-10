"use client";

import React, { useState, useEffect } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import { useRouter } from "next/navigation";
import {
    ArrowUpRight,
    Download,
    Loader2,
    Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export type DashboardStatus = "DRAFT" | "SHARED" | "APPROVED" | "SIGNED" | "CANCELLED";

export interface ProjectCardData {
    id: string;
    clientName: string;
    clientCity: string | null;
    clientAddress: string | null;
    venue: string | null;
    documentMode: "BUDGET" | "PROPOSAL" | "LOI" | "CONTRACT";
    mirrorMode: boolean;
    calculationMode: string;
    currency: string;
    sectionCount: number;
    hasExcel: boolean;
    status: string;
    createdAt: string;
    updatedAt: string;
    screenCount: number;
    totalAmount: number;
    createdBy?: string | null;
}

interface ProjectCardProps {
    project: ProjectCardData;
    onStatusChange: (id: string, status: DashboardStatus) => Promise<void> | void;
    onBriefMe: (id: string) => void;
    onDelete?: (id: string) => void;
    viewMode?: "grid" | "list";
}

const statusConfig: Record<string, { label: string }> = {
    DRAFT: { label: "Draft" },
    SHARED: { label: "Sent" },
    APPROVED: { label: "Approved" },
    SIGNED: { label: "Signed" },
    CANCELLED: { label: "Lost" },
    PENDING_VERIFICATION: { label: "Pending" },
    AUDIT: { label: "Audit" },
    CLOSED: { label: "Closed" },
    ARCHIVED: { label: "Archived" },
};

const statusOptions: Array<{ value: DashboardStatus; label: string }> = [
    { value: "DRAFT", label: "Draft" },
    { value: "SHARED", label: "Sent" },
    { value: "APPROVED", label: "Approved" },
    { value: "SIGNED", label: "Signed" },
    { value: "CANCELLED", label: "Lost" },
];

const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);

const formatDateStamp = () => {
    const now = new Date();
    return `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}`;
};

const safeFileName = (value: string) =>
    value.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "Project";

export default function ProjectCard({ project, onStatusChange, onBriefMe, onDelete, viewMode = "list" }: ProjectCardProps) {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const timeLabel = mounted
        ? formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })
        : new Date(project.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const status = statusConfig[project.status] || { label: project.status, dot: "bg-[#878787]" };
    const selectedStatus: DashboardStatus = (() => {
        if (project.status === "SHARED" || project.status === "APPROVED" || project.status === "SIGNED" || project.status === "CANCELLED" || project.status === "DRAFT") {
            return project.status;
        }
        if (project.status === "PENDING_VERIFICATION" || project.status === "AUDIT") return "SHARED";
        if (project.status === "CLOSED" || project.status === "ARCHIVED") return "SIGNED";
        return "DRAFT";
    })();

    const venue = project.venue || project.clientCity || null;
    const totalDisplay = project.totalAmount === 0 && !project.hasExcel ? "—" : formatCurrency(project.totalAmount, project.currency || "USD");
    const projectUrl = project.calculationMode === "ESTIMATE" ? `/estimator/${project.id}` : `/projects/${project.id}`;
    const isEstimate = project.calculationMode === "ESTIMATE";

    const [isExporting, setIsExporting] = useState(false);
    const { confirm, alert: showAlert } = useConfirm();
    const [isStatusUpdating, setIsStatusUpdating] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    const handleQuickExport = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isExporting) return;

        try {
            setIsExporting(true);
            const res = await fetch(`/api/projects/${project.id}/pdf`, { method: "POST" });

            if (!res.ok) {
                const errorText = await res.text();
                console.error("PDF export failed:", errorText);
                void showAlert({ title: "Export Failed", description: "PDF export failed. Please try opening the project and exporting from there." });
                return;
            }

            const contentType = res.headers.get("content-type");
            if (!contentType?.includes("application/pdf")) {
                console.error("Response is not a PDF:", contentType);
                void showAlert({ title: "Export Failed", description: "PDF export failed — unexpected response format." });
                return;
            }

            const blob = await res.blob();

            if (blob.size === 0) {
                console.error("PDF blob is empty");
                void showAlert({ title: "Export Failed", description: "PDF export failed — generated PDF is empty." });
                return;
            }

            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `ANC_${safeFileName(project.clientName)}_${project.documentMode}_${formatDateStamp()}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Quick PDF export failed:", err);
            void showAlert({ title: "Export Failed", description: "PDF export failed. Please try again or export from the project page." });
        } finally {
            setIsExporting(false);
        }
    };

    const handleStatusChange = async (nextStatus: DashboardStatus) => {
        setStatusError(null);
        setIsStatusUpdating(true);
        try {
            await onStatusChange(project.id, nextStatus);
        } catch (err: any) {
            setStatusError(err?.message || "Status update failed");
        } finally {
            setIsStatusUpdating(false);
        }
    };

    /* ─── LIST ROW (default) ─── */
    if (viewMode === "list") {
        return (
            <div
                onClick={() => router.push(projectUrl)}
                className="group flex items-center gap-3 px-3 py-2 border-b border-white/5 cursor-pointer hover:bg-muted/50 transition-colors"
            >
                {/* Name */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">{project.clientName}</div>
                    {venue && <div className="text-[10px] text-muted-foreground truncate">{venue}</div>}
                </div>

                {/* Type */}
                <div className="hidden sm:block w-20 text-[11px] text-muted-foreground shrink-0">
                    {isEstimate ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">Estimate</span>
                    ) : (
                        project.documentMode === "LOI" ? "Short Form" : project.documentMode === "CONTRACT" ? "Contract" : project.documentMode.charAt(0) + project.documentMode.slice(1).toLowerCase()
                    )}
                </div>

                {/* Status select */}
                <div className="hidden md:flex items-center gap-1.5 w-24 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <select
                        value={selectedStatus}
                        onChange={(e) => handleStatusChange(e.target.value as DashboardStatus)}
                        className="w-full bg-transparent text-[11px] text-muted-foreground cursor-pointer border-0 outline-none p-0 appearance-none hover:text-foreground"
                        aria-label="Change project status"
                    >
                        {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    {isStatusUpdating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
                </div>

                {/* Screens */}
                <div className="hidden lg:block w-20 text-[11px] text-muted-foreground text-right tabular-nums shrink-0">
                    {project.screenCount > 0 ? `${project.screenCount} screen${project.screenCount !== 1 ? "s" : ""}` : "—"}
                </div>

                {/* Created by */}
                <div className="hidden lg:block w-24 text-[11px] text-muted-foreground truncate shrink-0">
                    {project.createdBy || "—"}
                </div>

                {/* Value */}
                <div className="w-28 text-[13px] font-medium text-foreground text-right tabular-nums shrink-0">
                    {totalDisplay}
                </div>

                {/* Time */}
                <div className="hidden xl:block w-28 text-[11px] text-muted-foreground text-right shrink-0">
                    {timeLabel}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 w-16 justify-end shrink-0 opacity-0 group-hover:opacity-100">
                    <button
                        onClick={handleQuickExport}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Export PDF"
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    </button>
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                confirm({ title: "Delete Project", description: "Are you sure you want to delete this project? This cannot be undone.", confirmLabel: "Delete", variant: "destructive" }).then((ok) => { if (ok) onDelete(project.id); });
                            }}
                            className="p-1 text-muted-foreground hover:text-destructive"
                            title="Delete"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>

                {statusError && (
                    <div className="absolute right-4 top-full mt-1 text-[10px] text-destructive bg-card border border-border rounded px-2 py-1 z-10">
                        {statusError}
                    </div>
                )}
            </div>
        );
    }

    /* ─── GRID CARD ─── */
    return (
        <div
            onClick={() => router.push(projectUrl)}
            className="group relative bg-card border border-border overflow-hidden cursor-pointer rounded flex flex-col"
        >
            <div className="p-3 flex flex-col gap-2 flex-1">
                {/* Row 1: Name + value */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-foreground truncate leading-tight">{project.clientName}</div>
                        {venue && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{venue}</div>}
                    </div>
                    <div className="text-xs font-medium text-foreground tabular-nums shrink-0 whitespace-nowrap">{totalDisplay}</div>
                </div>

                {/* Row 2: Meta chips */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{status.label}</span>
                    {isEstimate ? (
                        <span className="text-emerald-500 font-medium">Estimate</span>
                    ) : (
                        <span>{project.documentMode === "LOI" ? "Short Form" : project.documentMode === "CONTRACT" ? "Contract" : project.documentMode.charAt(0) + project.documentMode.slice(1).toLowerCase()}</span>
                    )}
                    {project.screenCount > 0 && <span>{project.screenCount} screens</span>}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border">
                <div className="text-[10px] text-muted-foreground">
                    {timeLabel}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                        onClick={handleQuickExport}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Export PDF"
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    </button>
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                confirm({ title: "Delete Project", description: "Are you sure you want to delete this project? This cannot be undone.", confirmLabel: "Delete", variant: "destructive" }).then((ok) => { if (ok) onDelete(project.id); });
                            }}
                            className="p-1 text-muted-foreground hover:text-destructive"
                            title="Delete"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
