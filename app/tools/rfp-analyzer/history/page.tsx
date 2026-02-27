"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  Monitor,
  Clock,
  MapPin,
  Building2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  LayoutGrid,
  LayoutList,
  Eye,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface AnalysisSummary {
  id: string;
  projectName: string | null;
  clientName: string | null;
  venue: string | null;
  location: string | null;
  filename: string;
  fileSize: number;
  pageCount: number;
  relevantPages: number;
  specsFound: number;
  processingTimeMs: number;
  status: string;
  createdBy: string | null;
  createdAt: string;
}

// ============================================================================
// Main Page
// ============================================================================

export default function RfpHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const limit = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch analyses
  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/rfp/analyses?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      setAnalyses(data.analyses);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch analyses:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this analysis? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/rfp/analyses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAnalyses((prev) => prev.filter((a) => a.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // Split into real analyses (have specs or relevant pages) vs empty noise
  const realAnalyses = analyses.filter((a) => a.specsFound > 0 || a.relevantPages > 0);
  const emptyAnalyses = analyses.filter((a) => a.specsFound === 0 && a.relevantPages === 0);

  return (
    <div className="flex-1 min-w-0 bg-background relative min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border py-3 px-6 xl:px-8">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/tools/rfp-analyzer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Analyzer
            </Link>
            <div className="w-px h-6 bg-border" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Analysis History</h1>
              <p className="text-xs text-muted-foreground">
                {total} saved — {realAnalyses.length} with results on this page
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setView("table")}
                className={`p-1.5 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                title="Table view"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("cards")}
                className={`p-1.5 transition-colors ${view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                title="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects, venues..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 xl:px-8 max-w-[1600px] mx-auto">
        {loading && analyses.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Loading analyses...</span>
          </div>
        ) : analyses.length === 0 ? (
          <div className="text-center py-24">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {debouncedSearch ? "No analyses match your search" : "No analyses yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {debouncedSearch ? "Try a different search term" : "Upload an RFP to get started"}
            </p>
            {!debouncedSearch && (
              <Link
                href="/tools/rfp-analyzer"
                className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Monitor className="w-4 h-4" />
                New Analysis
              </Link>
            )}
          </div>
        ) : view === "table" ? (
          <>
            {/* ── TABLE VIEW ── */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2.5 px-4 font-medium w-8">#</th>
                    <th className="py-2.5 px-4 font-medium">Project / Venue</th>
                    <th className="py-2.5 px-4 font-medium">Client</th>
                    <th className="py-2.5 px-4 font-medium text-center">Displays</th>
                    <th className="py-2.5 px-4 font-medium text-center">Pages</th>
                    <th className="py-2.5 px-4 font-medium text-center">Relevant</th>
                    <th className="py-2.5 px-4 font-medium">File</th>
                    <th className="py-2.5 px-4 font-medium">Created By</th>
                    <th className="py-2.5 px-4 font-medium text-right">When</th>
                    <th className="py-2.5 px-4 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {realAnalyses.map((a, i) => (
                    <TableRow
                      key={a.id}
                      analysis={a}
                      index={offset + i + 1}
                      isLatest={i === 0 && offset === 0 && !debouncedSearch}
                      onDelete={handleDelete}
                      deleting={deleting}
                    />
                  ))}
                  {emptyAnalyses.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={10} className="py-2 px-4 bg-muted/30">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            No results ({emptyAnalyses.length}) — non-RFP or failed extractions
                          </span>
                        </td>
                      </tr>
                      {emptyAnalyses.map((a, i) => (
                        <TableRow
                          key={a.id}
                          analysis={a}
                          index={offset + realAnalyses.length + i + 1}
                          isLatest={false}
                          dimmed
                          onDelete={handleDelete}
                          deleting={deleting}
                        />
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                offset={offset}
                limit={limit}
                total={total}
                onPrev={() => setOffset(Math.max(0, offset - limit))}
                onNext={() => setOffset(offset + limit)}
              />
            )}
          </>
        ) : (
          <>
            {/* ── CARD VIEW ── */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {realAnalyses.map((a, i) => (
                <AnalysisCard
                  key={a.id}
                  analysis={a}
                  isLatest={i === 0 && offset === 0 && !debouncedSearch}
                  onDelete={handleDelete}
                  deleting={deleting}
                />
              ))}
            </div>
            {emptyAnalyses.length > 0 && (
              <>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-6 mb-2">
                  No results ({emptyAnalyses.length})
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 opacity-50">
                  {emptyAnalyses.map((a) => (
                    <AnalysisCard
                      key={a.id}
                      analysis={a}
                      isLatest={false}
                      onDelete={handleDelete}
                      deleting={deleting}
                    />
                  ))}
                </div>
              </>
            )}

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                offset={offset}
                limit={limit}
                total={total}
                onPrev={() => setOffset(Math.max(0, offset - limit))}
                onNext={() => setOffset(offset + limit)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Table Row
// ============================================================================

function TableRow({
  analysis: a,
  index,
  isLatest,
  dimmed,
  onDelete,
  deleting,
}: {
  analysis: AnalysisSummary;
  index: number;
  isLatest: boolean;
  dimmed?: boolean;
  onDelete: (id: string, e: React.MouseEvent) => void;
  deleting: string | null;
}) {
  const date = new Date(a.createdAt);
  const timeAgo = getTimeAgo(date);
  const title = a.projectName || a.venue || a.filename;

  return (
    <tr className={`group hover:bg-muted/30 transition-colors ${dimmed ? "opacity-50" : ""} ${isLatest ? "bg-primary/[0.03]" : ""}`}>
      <td className="py-2.5 px-4 text-xs text-muted-foreground font-mono">{index}</td>
      <td className="py-2.5 px-4">
        <Link href={`/tools/rfp-analyzer/history/${a.id}`} className="block">
          <div className="flex items-center gap-2">
            {isLatest && (
              <span className="shrink-0 px-1.5 py-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded uppercase tracking-wide">
                Latest
              </span>
            )}
            <span className="font-medium text-foreground truncate max-w-[280px] group-hover:text-primary transition-colors">
              {title}
            </span>
            {a.status === "failed" && (
              <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
            )}
          </div>
          {a.venue && a.venue !== title && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-2.5 h-2.5" />{a.venue}
            </span>
          )}
        </Link>
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground">
        {a.clientName || <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="py-2.5 px-4 text-center">
        {a.specsFound > 0 ? (
          <span className="inline-flex items-center gap-1 font-bold text-foreground">
            <Monitor className="w-3 h-3 text-primary" />{a.specsFound}
          </span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-center text-xs text-muted-foreground font-mono">
        {a.pageCount}
      </td>
      <td className="py-2.5 px-4 text-center">
        {a.relevantPages > 0 ? (
          <span className="text-xs font-medium text-emerald-600">{a.relevantPages}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[140px]" title={a.filename}>
        {a.filename}
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[120px]" title={a.createdBy || ""}>
        {a.createdBy ? a.createdBy.split("@")[0] : <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="py-2.5 px-4 text-right">
        <div className="text-xs text-muted-foreground">{timeAgo}</div>
        <div className="text-[10px] text-muted-foreground/60">{formatDate(date)}</div>
      </td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            href={`/tools/rfp-analyzer/history/${a.id}`}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
            title="View analysis"
          >
            <Eye className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={(e) => onDelete(a.id, e)}
            disabled={deleting === a.id}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
            title="Delete analysis"
          >
            {deleting === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// Card View
// ============================================================================

function AnalysisCard({
  analysis: a,
  isLatest,
  onDelete,
  deleting,
}: {
  analysis: AnalysisSummary;
  isLatest: boolean;
  onDelete: (id: string, e: React.MouseEvent) => void;
  deleting: string | null;
}) {
  const date = new Date(a.createdAt);
  const timeAgo = getTimeAgo(date);
  const title = a.projectName || a.venue || a.filename;

  return (
    <Link href={`/tools/rfp-analyzer/history/${a.id}`}>
      <div className={`group bg-card border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer relative ${
        isLatest ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
      }`}>
        {isLatest && (
          <div className="absolute -top-2.5 left-3">
            <span className="px-2 py-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full uppercase tracking-wide shadow-sm">
              Latest
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {title}
            </h3>
            {a.clientName && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Building2 className="w-3 h-3" />{a.clientName}
              </div>
            )}
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            a.status === "complete" ? "bg-emerald-500/10" :
            a.status === "failed" ? "bg-destructive/10" :
            "bg-amber-500/10"
          }`}>
            {a.status === "complete" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : a.status === "failed" ? (
              <XCircle className="w-4 h-4 text-destructive" />
            ) : (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-bold text-foreground">{a.specsFound}</div>
            <div className="text-[9px] text-muted-foreground">displays</div>
          </div>
          <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-bold text-foreground">{a.pageCount}</div>
            <div className="text-[9px] text-muted-foreground">pages</div>
          </div>
          <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-bold text-emerald-600">{a.relevantPages}</div>
            <div className="text-[9px] text-muted-foreground">relevant</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1 truncate max-w-[50%]">
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{a.filename}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {a.createdBy && (
              <span className="text-muted-foreground/70">{a.createdBy.split("@")[0]}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{timeAgo}
            </span>
            <button
              onClick={(e) => onDelete(a.id, e)}
              disabled={deleting === a.id}
              className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              title="Delete"
            >
              {deleting === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// Pagination
// ============================================================================

function Pagination({
  currentPage,
  totalPages,
  offset,
  limit,
  total,
  onPrev,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  offset: number;
  limit: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
      <p className="text-xs text-muted-foreground">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={offset === 0}
          className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="px-3 py-1.5 text-xs text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={offset + limit >= total}
          className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
