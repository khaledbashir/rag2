"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  FileSignature,
  Monitor,
  Clock,
  MapPin,
  Building2,
  ArrowLeft,
  Loader2,
  Trash2,
  LayoutGrid,
  LayoutList,
  HardHat,
  Moon,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface SOWRecord {
  id: string;
  projectName: string;
  clientName: string;
  venue: string;
  displayCount: number;
  hasUnionLabor: boolean;
  hasNightWork: boolean;
  fileName: string;
  createdBy: string | null;
  createdAt: string;
}

// ============================================================================
// Main Page
// ============================================================================

export default function SOWHistoryPage() {
  const [records, setRecords] = useState<SOWRecord[]>([]);
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

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/sow/history?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      setRecords(data.records);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch SOW history:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this SOW record? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/sow/history/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
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

  return (
    <div className="flex-1 min-w-0 bg-background relative min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border py-3 px-6 xl:px-8">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/tools/sow-generator"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              SOW Builder
            </Link>
            <div className="w-px h-6 bg-border" />
            <div>
              <h1 className="text-xl font-bold text-foreground">SOW History</h1>
              <p className="text-xs text-muted-foreground">
                {total} generated SOW{total !== 1 ? "s" : ""}
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
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Loading SOW history...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-24">
            <FileSignature className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {debouncedSearch ? "No SOWs match your search" : "No SOWs generated yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {debouncedSearch ? "Try a different search term" : "Generate a SOW from the builder to see it here"}
            </p>
            {!debouncedSearch && (
              <Link
                href="/tools/sow-generator"
                className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <FileSignature className="w-4 h-4" />
                New SOW
              </Link>
            )}
          </div>
        ) : view === "table" ? (
          <>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2.5 px-4 font-medium w-8">#</th>
                    <th className="py-2.5 px-4 font-medium">Project</th>
                    <th className="py-2.5 px-4 font-medium">Client</th>
                    <th className="py-2.5 px-4 font-medium">Venue</th>
                    <th className="py-2.5 px-4 font-medium text-center">Displays</th>
                    <th className="py-2.5 px-4 font-medium text-center">Flags</th>
                    <th className="py-2.5 px-4 font-medium">Created By</th>
                    <th className="py-2.5 px-4 font-medium text-right">When</th>
                    <th className="py-2.5 px-4 font-medium w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((r, i) => (
                    <TableRow
                      key={r.id}
                      record={r}
                      index={offset + i + 1}
                      isLatest={i === 0 && offset === 0 && !debouncedSearch}
                      onDelete={handleDelete}
                      deleting={deleting}
                    />
                  ))}
                </tbody>
              </table>
            </div>

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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {records.map((r, i) => (
                <SOWCard
                  key={r.id}
                  record={r}
                  isLatest={i === 0 && offset === 0 && !debouncedSearch}
                  onDelete={handleDelete}
                  deleting={deleting}
                />
              ))}
            </div>

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
  record: r,
  index,
  isLatest,
  onDelete,
  deleting,
}: {
  record: SOWRecord;
  index: number;
  isLatest: boolean;
  onDelete: (id: string, e: React.MouseEvent) => void;
  deleting: string | null;
}) {
  const date = new Date(r.createdAt);
  const timeAgo = getTimeAgo(date);

  return (
    <tr className={`group hover:bg-muted/30 transition-colors ${isLatest ? "bg-primary/[0.03]" : ""}`}>
      <td className="py-2.5 px-4 text-xs text-muted-foreground font-mono">{index}</td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          {isLatest && (
            <span className="shrink-0 px-1.5 py-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded uppercase tracking-wide">
              Latest
            </span>
          )}
          <span className="font-medium text-foreground truncate max-w-[250px]">
            {r.projectName}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground">
        {r.clientName || <span className="text-muted-foreground/40">&mdash;</span>}
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground">
        {r.venue ? (
          <span className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5" />{r.venue}
          </span>
        ) : (
          <span className="text-muted-foreground/40">&mdash;</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-center">
        <span className="inline-flex items-center gap-1 font-bold text-foreground">
          <Monitor className="w-3 h-3 text-primary" />{r.displayCount}
        </span>
      </td>
      <td className="py-2.5 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          {r.hasUnionLabor && (
            <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-bold rounded" title="Union Labor">
              <HardHat className="w-3 h-3 inline" />
            </span>
          )}
          {r.hasNightWork && (
            <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[9px] font-bold rounded" title="Night Work">
              <Moon className="w-3 h-3 inline" />
            </span>
          )}
          {!r.hasUnionLabor && !r.hasNightWork && (
            <span className="text-muted-foreground/40">&mdash;</span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[120px]">
        {r.createdBy ? r.createdBy.split("@")[0] : <span className="text-muted-foreground/40">&mdash;</span>}
      </td>
      <td className="py-2.5 px-4 text-right">
        <div className="text-xs text-muted-foreground">{timeAgo}</div>
        <div className="text-[10px] text-muted-foreground/60">{formatDate(date)}</div>
      </td>
      <td className="py-2.5 px-4">
        <button
          onClick={(e) => onDelete(r.id, e)}
          disabled={deleting === r.id}
          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
          title="Delete"
        >
          {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </td>
    </tr>
  );
}

// ============================================================================
// Card View
// ============================================================================

function SOWCard({
  record: r,
  isLatest,
  onDelete,
  deleting,
}: {
  record: SOWRecord;
  isLatest: boolean;
  onDelete: (id: string, e: React.MouseEvent) => void;
  deleting: string | null;
}) {
  const date = new Date(r.createdAt);
  const timeAgo = getTimeAgo(date);

  return (
    <div className={`group bg-card border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all relative ${
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
          <h3 className="font-semibold text-foreground truncate">
            {r.projectName}
          </h3>
          {r.clientName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Building2 className="w-3 h-3" />{r.clientName}
            </div>
          )}
          {r.venue && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3" />{r.venue}
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
          <FileSignature className="w-4 h-4 text-emerald-500" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-foreground">{r.displayCount}</div>
          <div className="text-[9px] text-muted-foreground">displays</div>
        </div>
        <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
          {r.hasUnionLabor ? (
            <>
              <HardHat className="w-4 h-4 mx-auto text-amber-600" />
              <div className="text-[9px] text-amber-600">union</div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-muted-foreground/40">&mdash;</div>
              <div className="text-[9px] text-muted-foreground">standard</div>
            </>
          )}
        </div>
        <div className="bg-muted/50 rounded-md px-2 py-1.5 text-center">
          {r.hasNightWork ? (
            <>
              <Moon className="w-4 h-4 mx-auto text-indigo-600" />
              <div className="text-[9px] text-indigo-600">night</div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-muted-foreground/40">&mdash;</div>
              <div className="text-[9px] text-muted-foreground">day</div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1 truncate max-w-[50%]">
          <FileSignature className="w-3 h-3 shrink-0" />
          <span className="truncate">{r.fileName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.createdBy && (
            <span className="text-muted-foreground/70">{r.createdBy.split("@")[0]}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />{timeAgo}
          </span>
          <button
            onClick={(e) => onDelete(r.id, e)}
            disabled={deleting === r.id}
            className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            {deleting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
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
        Showing {offset + 1}&ndash;{Math.min(offset + limit, total)} of {total}
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
