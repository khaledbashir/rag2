"use client";

import React, { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Send,
  CheckCircle2,
  PenLine,
  Lock,
  GripVertical,
  ExternalLink,
  Monitor,
  DollarSign,
  BarChart3,
  Loader2,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineCard {
  id: string;
  clientName: string;
  venue: string | null;
  city: string | null;
  documentMode: string;
  status: string;
  calculationMode: string;
  screenCount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialCards: PipelineCard[];
}

// ── Column Config ─────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    status: "DRAFT",
    label: "Draft",
    icon: PenLine,
    color: "text-zinc-500",
    bg: "bg-zinc-100 dark:bg-zinc-800/50",
    border: "border-zinc-200 dark:border-zinc-700",
    dot: "bg-zinc-400",
  },
  {
    status: "SHARED",
    label: "Sent",
    icon: Send,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  {
    status: "APPROVED",
    label: "Approved",
    icon: CheckCircle2,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  {
    status: "SIGNED",
    label: "Signed",
    icon: Lock,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  {
    status: "CLOSED",
    label: "Closed",
    icon: BarChart3,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200 dark:border-purple-800",
    dot: "bg-purple-500",
  },
] as const;

const fmtCurrency = (n: number) =>
  n === 0 ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const modeLabels: Record<string, string> = {
  BUDGET: "Budget",
  PROPOSAL: "Proposal",
  LOI: "LOI",
  CONTRACT: "Contract",
};

const PHASE2_POSSIBILITIES = [
  {
    label: "RFP Drawing Analysis",
    detail: "Scan drawings to identify display locations and schedule-of-displays data.",
  },
  {
    label: "Catalog Auto-Matching",
    detail: "Map extracted specs to best-fit LED products with ranked options.",
  },
  {
    label: "RFP to Estimator Push",
    detail: "Send extracted screens directly into estimator with prefilled fields.",
  },
  {
    label: "Addendum Delta Tracking",
    detail: "Compare revisions and surface scope or cost-impacting changes quickly.",
  },
  {
    label: "SOW + Risk Checks",
    detail: "Generate SOW drafts and flag liability gaps before submission.",
  },
  {
    label: "Bid Readiness Signals",
    detail: "Show confidence, missing items, and decision-ready status by opportunity.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PipelineKanban({ initialCards }: Props) {
  const router = useRouter();
  const [cards, setCards] = useState<PipelineCard[]>(initialCards);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const dragDataRef = useRef<{ cardId: string; fromStatus: string } | null>(null);

  const moveCard = useCallback(async (cardId: string, newStatus: string) => {
    setUpdatingId(cardId);
    try {
      const res = await fetch(`/api/projects/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Failed to update status`);
      }
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c))
      );
    } catch (err: any) {
      console.error("Status update failed:", err);
      alert(err.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }, []);

  // Drag handlers
  const onDragStart = useCallback((e: React.DragEvent, card: PipelineCard) => {
    setDraggingId(card.id);
    dragDataRef.current = { cardId: card.id, fromStatus: card.status };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
    dragDataRef.current = null;
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(colStatus);
  }, []);

  const onDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    setDropTarget(null);
    const data = dragDataRef.current;
    if (!data || data.fromStatus === colStatus) return;
    moveCard(data.cardId, colStatus);
  }, [moveCard]);

  const openProject = useCallback((card: PipelineCard) => {
    const url = card.calculationMode === "ESTIMATE" ? `/estimator/${card.id}` : `/projects/${card.id}`;
    router.push(url);
  }, [router]);

  // Group cards by status
  const grouped = COLUMNS.map((col) => ({
    ...col,
    cards: cards.filter((c) => c.status === col.status),
  }));

  const totalValue = cards.reduce((s, c) => s + c.totalAmount, 0);

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">Pipeline</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                <Sparkles className="h-3 w-3" />
                DEMO FOR PHASE 2
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cards.length} projects · {fmtCurrency(totalValue)} total value
            </p>
          </div>
          <div className="flex items-center gap-3">
            {COLUMNS.map((col) => {
              const count = cards.filter((c) => c.status === col.status).length;
              return (
                <div key={col.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={cn("w-2 h-2 rounded-full", col.dot)} />
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            Possibilities in this phase
          </div>
          <TooltipProvider>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PHASE2_POSSIBILITIES.map((item) => (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {item.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {item.detail}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-4 h-full min-w-max">
          {grouped.map((col) => (
            <div
              key={col.status}
              className={cn(
                "w-[280px] shrink-0 rounded-xl border flex flex-col h-full transition-all duration-150",
                col.border,
                dropTarget === col.status && draggingId
                  ? "ring-2 ring-primary/50 scale-[1.01]"
                  : ""
              )}
              onDragOver={(e) => onDragOver(e, col.status)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, col.status)}
            >
              {/* Column Header */}
              <div className={cn("px-4 py-3 rounded-t-xl border-b flex items-center justify-between", col.bg, col.border)}>
                <div className="flex items-center gap-2">
                  <col.icon className={cn("w-4 h-4", col.color)} />
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  col.bg, col.color
                )}>
                  {col.cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                {col.cards.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {dropTarget === col.status ? "Drop here" : "No projects"}
                  </div>
                )}
                {col.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, card)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      "group relative rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-150 hover:shadow-md",
                      draggingId === card.id && "opacity-40 scale-95",
                      updatingId === card.id && "opacity-60 pointer-events-none"
                    )}
                  >
                    {updatingId === card.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-lg z-10">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      </div>
                    )}

                    {/* Drag Handle */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>

                    {/* Client + Mode */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground truncate">{card.clientName}</div>
                        {card.venue && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{card.venue}</div>
                        )}
                      </div>
                      <span className={cn(
                        "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        (card.documentMode === "LOI" || card.documentMode === "CONTRACT") ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" :
                        card.documentMode === "PROPOSAL" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                        "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      )}>
                        {modeLabels[card.documentMode] || card.documentMode}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {card.screenCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Monitor className="w-3 h-3" />{card.screenCount}
                        </span>
                      )}
                      {card.totalAmount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />{fmtCurrency(card.totalAmount)}
                        </span>
                      )}
                      {card.city && <span>{card.city}</span>}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(card.updatedAt), { addSuffix: true })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); openProject(card); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
                        title="Open project"
                      >
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
