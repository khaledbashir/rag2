"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Trophy,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  Users,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Deal {
  id: string;
  clientName: string;
  venue: string | null;
  status: string;
  mode: string;
  value: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
}

interface PipelineSummary {
  totalDeals: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
  staleCount: number;
  wonValue: number;
  lostValue: number;
  activeValue: number;
  winRate: number;
  avgDaysToClose: number;
}

interface UserPerf {
  email: string;
  name: string;
  won: number;
  lost: number;
  active: number;
  value: number;
}

interface PipelineData {
  summary: PipelineSummary;
  deals: { won: Deal[]; lost: Deal[]; active: Deal[] };
  users: UserPerf[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

function daysAgo(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400", label: "Draft" },
  PENDING_VERIFICATION: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Pending" },
  AUDIT: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Audit" },
  APPROVED: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Approved" },
  SHARED: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Shared" },
  SIGNED: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Signed" },
  CLOSED: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Closed" },
  CANCELLED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Cancelled" },
  ARCHIVED: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-500 dark:text-zinc-500", label: "Archived" },
};

// ─── Component ───────────────────────────────────────────────────────────────

type DealTab = "active" | "won" | "lost";
type Period = "30d" | "90d" | "all";

export default function PipelineClient() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dealTab, setDealTab] = useState<DealTab>("active");
  const [period, setPeriod] = useState<Period>("all");
  const [expandedUsers, setExpandedUsers] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/ops/pipeline?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-4 text-sm text-destructive">
          Failed to load pipeline data: {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary, deals, users } = data;
  const currentDeals = deals[dealTab];

  const dealTabs: { key: DealTab; label: string; count: number; color: string }[] = [
    { key: "active", label: "Active Pipeline", count: summary.activeCount, color: "text-blue-500" },
    { key: "won", label: "Won", count: summary.wonCount, color: "text-emerald-500" },
    { key: "lost", label: "Lost", count: summary.lostCount, color: "text-red-500" },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
    { key: "all", label: "All time" },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
                period === p.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Won</span>
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{summary.wonCount}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{fmtCompact(summary.wonValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Lost</span>
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{summary.lostCount}</div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{fmtCompact(summary.lostValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Win Rate</span>
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">{summary.winRate}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {summary.wonCount + summary.lostCount} closed deals
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg Close</span>
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums">
              {summary.avgDaysToClose > 0 ? `${summary.avgDaysToClose}d` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">days to signature</div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline value bar */}
      <Card>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-foreground" />
              <span className="text-sm font-medium text-foreground">Pipeline Overview</span>
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {fmt(summary.wonValue + summary.activeValue + summary.lostValue)}
            </span>
          </div>
          {/* Stacked bar */}
          {(summary.wonValue + summary.activeValue + summary.lostValue) > 0 ? (
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
              {summary.wonValue > 0 && (
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${(summary.wonValue / (summary.wonValue + summary.activeValue + summary.lostValue)) * 100}%`,
                  }}
                  title={`Won: ${fmt(summary.wonValue)}`}
                />
              )}
              {summary.activeValue > 0 && (
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{
                    width: `${(summary.activeValue / (summary.wonValue + summary.activeValue + summary.lostValue)) * 100}%`,
                  }}
                  title={`Active: ${fmt(summary.activeValue)}`}
                />
              )}
              {summary.lostValue > 0 && (
                <div
                  className="h-full bg-red-400 transition-all duration-500"
                  style={{
                    width: `${(summary.lostValue / (summary.wonValue + summary.activeValue + summary.lostValue)) * 100}%`,
                  }}
                  title={`Lost: ${fmt(summary.lostValue)}`}
                />
              )}
            </div>
          ) : (
            <div className="w-full h-3 rounded-full bg-muted" />
          )}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Won {fmtCompact(summary.wonValue)}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Active {fmtCompact(summary.activeValue)}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              Lost {fmtCompact(summary.lostValue)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stale warning */}
      {summary.staleCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {summary.staleCount} draft{summary.staleCount > 1 ? "s" : ""} untouched for 7+ days — may need follow-up
          </span>
        </div>
      )}

      {/* Deal tabs + table */}
      <div>
        <div className="flex items-center gap-1 mb-3">
          {dealTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDealTab(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5",
                dealTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  dealTab === tab.key ? "opacity-70" : tab.color
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {currentDeals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No {dealTab === "active" ? "active" : dealTab} deals
                {period !== "all" ? ` in the last ${period === "30d" ? "30" : "90"} days` : ""}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-px">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              <div className="flex-1 min-w-0">Client</div>
              <div className="hidden sm:block w-20 shrink-0">Status</div>
              <div className="hidden md:block w-20 shrink-0">Owner</div>
              <div className="w-28 text-right shrink-0">Value</div>
              <div className="hidden lg:block w-24 text-right shrink-0">
                {dealTab === "won" ? "Signed" : "Updated"}
              </div>
            </div>

            {currentDeals.map((deal) => {
              const badge = STATUS_BADGE[deal.status] || STATUS_BADGE.DRAFT;
              return (
                <Link
                  key={deal.id}
                  href={`/projects/${deal.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {deal.clientName}
                    </p>
                    {deal.venue && (
                      <p className="text-[11px] text-muted-foreground truncate">{deal.venue}</p>
                    )}
                  </div>
                  <div className="hidden sm:block w-20 shrink-0">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", badge.bg, badge.text)}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="hidden md:block w-20 shrink-0 text-xs text-muted-foreground truncate">
                    {deal.owner}
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {deal.value > 0 ? fmtCompact(deal.value) : "—"}
                    </span>
                  </div>
                  <div className="hidden lg:block w-24 text-right shrink-0 text-xs text-muted-foreground">
                    {daysAgo(dealTab === "won" && deal.signedAt ? deal.signedAt : deal.updatedAt)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Performance */}
      {users.length > 1 && (
        <div>
          <button
            onClick={() => setExpandedUsers(!expandedUsers)}
            className="flex items-center gap-2 text-sm font-medium text-foreground mb-3 hover:text-primary transition-colors"
          >
            <Users className="w-4 h-4" />
            Team Performance
            {expandedUsers ? (
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>

          {expandedUsers && (
            <div className="space-y-px">
              <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                <div className="flex-1 min-w-0">Name</div>
                <div className="w-16 text-center shrink-0">Won</div>
                <div className="w-16 text-center shrink-0">Lost</div>
                <div className="w-16 text-center shrink-0">Active</div>
                <div className="w-24 text-right shrink-0">Won Value</div>
              </div>
              {users
                .sort((a, b) => b.value - a.value)
                .map((u) => (
                  <div
                    key={u.email}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                    </div>
                    <div className="w-16 text-center shrink-0">
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{u.won}</span>
                    </div>
                    <div className="w-16 text-center shrink-0">
                      <span className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums">{u.lost}</span>
                    </div>
                    <div className="w-16 text-center shrink-0">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400 tabular-nums">{u.active}</span>
                    </div>
                    <div className="w-24 text-right shrink-0">
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {u.value > 0 ? fmtCompact(u.value) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
