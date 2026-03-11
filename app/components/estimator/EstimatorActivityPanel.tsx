"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Activity, User, Download, Copy, ArrowRightLeft, Monitor, Percent, FileSpreadsheet, Eye, Pencil, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  actor: string | null;
  createdAt: string;
  metadata?: any;
}

interface PresenceUser {
  userName: string;
  userImage: string | null;
}

interface EstimatorActivityPanelProps {
  projectId: string | undefined;
  onClose: () => void;
  activeUsers?: PresenceUser[];
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  created: Sparkles,
  excel_exported: Download,
  converted_to_proposal: ArrowRightLeft,
  duplicated: Copy,
  display_added: Monitor,
  display_removed: Monitor,
  margin_changed: Percent,
  client_name_updated: Pencil,
  excel_imported: FileSpreadsheet,
  viewed: Eye,
  text_edited: Pencil,
  status_changed: Activity,
};

const ACTION_COLORS: Record<string, string> = {
  created: "text-emerald-500",
  excel_exported: "text-blue-500",
  converted_to_proposal: "text-purple-500",
  duplicated: "text-amber-500",
  display_added: "text-emerald-500",
  display_removed: "text-red-500",
  margin_changed: "text-orange-500",
};

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function EstimatorActivityPanel({ projectId, onClose, activeUsers = [] }: EstimatorActivityPanelProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivities = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchActivities();
    pollRef.current = setInterval(fetchActivities, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchActivities]);

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#0A52EF]" />
          <h3 className="text-sm font-semibold">Activity</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Active Users Bar */}
      {activeUsers.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-emerald-50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {activeUsers.map(u => u.userName.split(" ")[0]).join(", ")} editing
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse bg-muted/50 rounded" />)}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-10">
            <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          activities.map((a, i) => {
            const Icon = ACTION_ICONS[a.action] || Activity;
            const colorClass = ACTION_COLORS[a.action] || "text-muted-foreground";
            return (
              <div key={a.id} className="flex gap-3 py-2 group">
                <div className="flex flex-col items-center">
                  <div className={cn("w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0", colorClass)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {i < activities.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <p className="text-xs text-foreground leading-snug">{a.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {a.actor && (
                      <>
                        <span className="text-[10px] font-medium text-muted-foreground">{a.actor}</span>
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                      </>
                    )}
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
