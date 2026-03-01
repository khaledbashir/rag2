"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  FileText,
  Upload,
  Download,
  Edit3,
  UserPlus,
  MessageSquare,
  RefreshCw,
  ChevronDown,
  Zap,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PipelineClient from "./PipelineClient";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  action: string;
  description: string;
  actor: string | null;
  createdAt: string;
  metadata: any;
  proposalId: string;
  clientName: string;
  venue: string | null;
  ownerName: string | null;
}

// ─── Action config ───────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  created: { icon: FileText, label: "Created proposal", color: "text-blue-500" },
  excel_imported: { icon: Upload, label: "Imported Excel", color: "text-emerald-500" },
  data_exported: { icon: Download, label: "Exported data", color: "text-purple-500" },
  client_name_updated: { icon: Edit3, label: "Updated client", color: "text-amber-500" },
  status_changed: { icon: Zap, label: "Changed status", color: "text-orange-500" },
  document_mode_changed: { icon: Edit3, label: "Changed mode", color: "text-cyan-500" },
  text_edited: { icon: Edit3, label: "Edited text", color: "text-gray-500" },
  CLIENT_ANNOTATION_BATCH: { icon: MessageSquare, label: "Client annotations", color: "text-pink-500" },
  CLIENT_CHANGE_REQUEST: { icon: MessageSquare, label: "Change request", color: "text-red-500" },
  CHANGE_REQUEST_STATUS: { icon: Zap, label: "Resolved request", color: "text-green-500" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { icon: Activity, label: action.replace(/_/g, " "), color: "text-muted-foreground" };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────

type OpsTab = "pipeline" | "activity";

export default function OpsClient() {
  const [activeTab, setActiveTab] = useState<OpsTab>("pipeline");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (cursor?: string) => {
    try {
      const isMore = !!cursor;
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      const url = `/api/admin/ops/activity-feed?limit=50${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      if (isMore) {
        setFeed((prev) => [...prev, ...data.feed]);
      } else {
        setFeed(data.feed);
      }
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "activity" && feed.length === 0) fetchFeed();
  }, [activeTab, fetchFeed]);

  // Group feed by date
  const groupedFeed = feed.reduce<Record<string, FeedItem[]>>((groups, item) => {
    const date = new Date(item.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "Yesterday";
    } else {
      key = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-normal text-foreground serif-vault">
              Operations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pipeline analytics & activity — vendor eyes only.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-border pb-px">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "pipeline"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Pipeline
          </button>
          <button
            onClick={() => { setActiveTab("activity"); if (feed.length === 0) fetchFeed(); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "activity"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Activity className="w-4 h-4" />
            Activity
          </button>
        </div>

        {/* Pipeline Tab */}
        {activeTab === "pipeline" && <PipelineClient />}

        {/* Activity Tab */}
        {activeTab === "activity" && <>

        <div className="flex justify-end mb-4">
          <Button variant="outline" size="sm" onClick={() => fetchFeed()} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Feed */}
        {error && (
          <Card className="mb-6 border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">
              Failed to load activity feed: {error}
            </CardContent>
          </Card>
        )}

        {loading && feed.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && feed.length === 0 && !error && (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No activity recorded yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Activity will appear here as users create and edit proposals.</p>
            </CardContent>
          </Card>
        )}

        {Object.entries(groupedFeed).map(([dateLabel, items]) => (
          <div key={dateLabel} className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 px-1">
              {dateLabel}
            </h2>
            <div className="space-y-1">
              {items.map((item) => {
                const config = getActionConfig(item.action);
                const Icon = config.icon;

                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {/* Icon */}
                    <div className={cn("mt-0.5 shrink-0", config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{item.actor || item.ownerName || "System"}</span>
                        {" "}
                        <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
                        {" "}
                        <Link
                          href={`/projects/${item.proposalId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.clientName}
                          {item.venue ? ` — ${item.venue}` : ""}
                        </Link>
                      </p>
                      {item.description && item.description !== config.label && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Load More */}
        {nextCursor && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchFeed(nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-2" />
              )}
              Load More
            </Button>
          </div>
        )}

        </>}
      </div>
    </div>
  );
}
