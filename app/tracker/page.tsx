"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  ChevronDown,
  Zap,
  Cpu,
  FileText,
  RefreshCw,
  Loader2,
  User,
  Check,
  X,
  MessageSquare,
  LayoutGrid,
  List,
  ArrowRight,
  Send,
  Activity,
  Eye,
  GripVertical,
  Sparkles,
  BrainCircuit,
  Plus,
  ChevronUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Verification {
  name: string;
  status: "verified" | "disputed";
  comment: string;
  date: string;
}

interface TrackerComment {
  id: string;
  author: string;
  body: string;
  type: string;
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  itemId: string | null;
  actor: string;
  action: string;
  details: string | null;
  createdAt: string;
}

interface TrackerItem {
  id: string;
  category: string;
  description: string;
  sortOrder: number;
  column: string;
  status: string;
  claimedBy: string | null;
  claimedAt: string | null;
  verifications: Verification[];
  notes: string | null;
  priority: string;
  comments: TrackerComment[];
  _count?: { comments: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Natalia", role: "Proposal Lead", initials: "NK", color: "from-violet-500 to-purple-600" },
  { name: "Jeremy", role: "Technical Director", initials: "JR", color: "from-blue-500 to-cyan-600" },
  { name: "Matt", role: "Sales", initials: "MM", color: "from-emerald-500 to-teal-600" },
  { name: "Jireh", role: "Operations", initials: "JH", color: "from-amber-500 to-orange-600" },
  { name: "Eric", role: "Engineering", initials: "EP", color: "from-rose-500 to-pink-600" },
  { name: "Alison", role: "Coordinator", initials: "AW", color: "from-sky-500 to-indigo-600" },
];

const KANBAN_COLUMNS = [
  { id: "awaiting_review", label: "Awaiting Review", icon: Clock, accent: "blue" },
  { id: "in_review", label: "In Review", icon: Eye, accent: "amber" },
  { id: "verified", label: "Verified", icon: CheckCircle2, accent: "emerald" },
  { id: "disputed", label: "Disputed", icon: AlertTriangle, accent: "red" },
] as const;

const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; accent: string; bg: string }
> = {
  "Core Engine": { icon: Cpu, accent: "text-blue-400", bg: "bg-blue-500/10" },
  "Quote Workflow": { icon: Zap, accent: "text-amber-400", bg: "bg-amber-500/10" },
  Validation: { icon: Shield, accent: "text-purple-400", bg: "bg-purple-500/10" },
  Output: { icon: FileText, accent: "text-emerald-400", bg: "bg-emerald-500/10" },
};

const ACCENT_MAP: Record<string, { text: string; bg: string; border: string; ring: string }> = {
  blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", ring: "ring-blue-500/30" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", ring: "ring-amber-500/30" },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", ring: "ring-emerald-500/30" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", ring: "ring-red-500/30" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getMemberColor(name: string): string {
  return TEAM_MEMBERS.find((m) => m.name === name)?.color || "from-gray-500 to-gray-600";
}

function getMemberInitials(name: string): string {
  return TEAM_MEMBERS.find((m) => m.name === name)?.initials || name[0];
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "w-10 h-10 text-sm" : size === "md" ? "w-7 h-7 text-[10px]" : "w-5 h-5 text-[8px]";
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${getMemberColor(name)} flex items-center justify-center font-bold text-white shadow-sm`}
      title={name}
    >
      {getMemberInitials(name)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    claimed: { label: "Ready for Review", cls: "bg-blue-500/15 text-blue-300 border-blue-500/20" },
    verified: { label: "Verified", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" },
    disputed: { label: "Needs Work", cls: "bg-red-500/15 text-red-300 border-red-500/20" },
    pending: { label: "Pending", cls: "bg-white/5 text-white/40 border-white/10" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ─── Kanban Card ────────────────────────────────────────────────────────────

function KanbanCard({
  item,
  selectedName,
  onAction,
  onComment,
  saving,
}: {
  item: TrackerItem;
  selectedName: string;
  onAction: (id: string, action: "verify" | "dispute") => void;
  onComment: (id: string, comment: string) => void;
  saving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const catConfig = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG["Core Engine"];
  const CatIcon = catConfig.icon;
  const verifications = (item.verifications || []) as Verification[];
  const commentCount = item._count?.comments || item.comments?.length || 0;

  return (
    <motion.div
      layout
      layoutId={item.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-[#111827]/80 border border-white/[0.06] rounded-xl hover:border-white/10 transition-all group"
    >
      {/* Card header */}
      <div
        className="p-3.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2.5 mb-2">
          <div className={`w-6 h-6 rounded-md ${catConfig.bg} flex items-center justify-center shrink-0 mt-0.5`}>
            <CatIcon className={`w-3 h-3 ${catConfig.accent}`} />
          </div>
          <p className="text-[13px] font-medium text-white/90 leading-snug flex-1">
            {item.description}
          </p>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 ml-8.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${catConfig.bg} ${catConfig.accent} font-medium`}>
            {item.category}
          </span>

          {verifications.length > 0 && (
            <div className="flex -space-x-1.5 ml-auto">
              {verifications.map((v) => (
                <div key={v.name} className="relative">
                  <Avatar name={v.name} size="sm" />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#111827] ${
                    v.status === "verified" ? "bg-emerald-500" : "bg-red-500"
                  }`} />
                </div>
              ))}
            </div>
          )}

          {commentCount > 0 && (
            <div className="flex items-center gap-1 text-white/30">
              <MessageSquare className="w-3 h-3" />
              <span className="text-[10px]">{commentCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.04] pt-3">
              {/* Verifications */}
              {verifications.length > 0 && (
                <div className="space-y-1.5">
                  {verifications.map((v) => (
                    <div key={v.name} className="flex items-center gap-2 text-xs">
                      <Avatar name={v.name} />
                      <span className="text-white/70 font-medium">{v.name}</span>
                      {v.status === "verified" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <X className="w-3 h-3 text-red-400" />
                      )}
                      {v.comment && (
                        <span className="text-white/40 truncate">&ldquo;{v.comment}&rdquo;</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Comments */}
              {(item.comments || []).length > 0 && (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {(item.comments || []).map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      <Avatar name={c.author} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white/70 font-medium">{c.author}</span>
                          <span className="text-white/20">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="text-white/50 mt-0.5">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment input */}
              {selectedName && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commentText.trim()) {
                        onComment(item.id, commentText);
                        setCommentText("");
                      }
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A52EF]/40"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (commentText.trim()) {
                        onComment(item.id, commentText);
                        setCommentText("");
                      }
                    }}
                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white/60 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {selectedName && item.status !== "verified" && (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(item.id, "verify"); }}
                    disabled={saving === item.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {saving === item.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Verify
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(item.id, "dispute"); }}
                    disabled={saving === item.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white/5 border border-red-500/20 hover:bg-red-500/10 text-red-400 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Flag
                  </button>
                </div>
              )}

              {!selectedName && (
                <p className="text-[10px] text-amber-400/60 flex items-center gap-1.5">
                  <ArrowRight className="w-3 h-3" />
                  Select your name above to interact
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── List View Item ─────────────────────────────────────────────────────────

function ListItem({
  item,
  selectedName,
  onAction,
  onComment,
  saving,
}: {
  item: TrackerItem;
  selectedName: string;
  onAction: (id: string, action: "verify" | "dispute") => void;
  onComment: (id: string, comment: string) => void;
  saving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const catConfig = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG["Core Engine"];
  const CatIcon = catConfig.icon;
  const verifications = (item.verifications || []) as Verification[];
  const commentCount = item._count?.comments || item.comments?.length || 0;

  let statusIcon = <Clock className="w-5 h-5 text-blue-400" />;
  if (item.status === "verified") statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  if (item.status === "disputed") statusIcon = <AlertTriangle className="w-5 h-5 text-red-400" />;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`rounded-xl border transition-all ${
        expanded
          ? "bg-white/[0.04] border-white/15"
          : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.03] hover:border-white/10"
      }`}
    >
      {/* Row */}
      <div
        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${item.status === "verified" ? "text-white/60 line-through" : "text-white/90"}`}>
              {item.description}
            </p>
          </div>
          <div className="flex items-center gap-2.5 mt-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${catConfig.bg} ${catConfig.accent} font-medium`}>
              {item.category}
            </span>
            <StatusBadge status={item.status} />
          </div>
        </div>

        {/* Avatars */}
        {verifications.length > 0 && (
          <div className="flex -space-x-1.5">
            {verifications.map((v) => (
              <div key={v.name} className="relative">
                <Avatar name={v.name} size="md" />
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0f1e] ${
                  v.status === "verified" ? "bg-emerald-500" : "bg-red-500"
                }`} />
              </div>
            ))}
          </div>
        )}

        {commentCount > 0 && (
          <div className="flex items-center gap-1 text-white/30">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-xs">{commentCount}</span>
          </div>
        )}

        <ChevronDown className={`w-4 h-4 text-white/20 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 ml-9 space-y-4 border-t border-white/[0.04]">
              <div className="pt-3" />

              {/* Verification list */}
              {verifications.length > 0 && (
                <div className="space-y-2 p-3 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Reviews</p>
                  {verifications.map((v) => (
                    <div key={v.name} className="flex items-center gap-3">
                      <Avatar name={v.name} size="md" />
                      <span className="text-sm font-medium text-white/80">{v.name}</span>
                      {v.status === "verified" ? (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium">Verified</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full font-medium">Disputed</span>
                      )}
                      {v.comment && (
                        <span className="text-xs text-white/40 flex-1 truncate">&ldquo;{v.comment}&rdquo;</span>
                      )}
                      <span className="text-[10px] text-white/20 ml-auto shrink-0">
                        {timeAgo(v.date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment thread */}
              {(item.comments || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Discussion</p>
                  {(item.comments || []).map((c) => (
                    <div key={c.id} className="flex items-start gap-3 p-2.5 bg-white/[0.02] rounded-lg">
                      <Avatar name={c.author} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/70 font-medium">{c.author}</span>
                          <span className="text-[10px] text-white/20">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-white/50 mt-0.5">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment input */}
              {selectedName && (
                <div className="flex gap-2">
                  <Avatar name={selectedName} size="md" />
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && commentText.trim()) {
                          onComment(item.id, commentText);
                          setCommentText("");
                        }
                      }}
                      placeholder="Write a comment..."
                      className="flex-1 px-3.5 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A52EF]/40 focus:ring-1 focus:ring-[#0A52EF]/20"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (commentText.trim()) {
                          onComment(item.id, commentText);
                          setCommentText("");
                        }
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white/60 transition-colors border border-white/10"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {selectedName ? (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(item.id, "verify"); }}
                    disabled={saving === item.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-all"
                  >
                    {saving === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Looks Good
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(item.id, "dispute"); }}
                    disabled={saving === item.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-red-500/30 hover:bg-red-500/10 text-red-400 text-sm font-medium rounded-xl disabled:opacity-50 transition-all"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Not Right
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                  <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-amber-300/70">Select your name above to verify or flag issues</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

function ActivityTimeline({ activities }: { activities: ActivityEntry[] }) {
  if (activities.length === 0) return null;

  const actionLabels: Record<string, string> = {
    verified: "verified",
    disputed: "flagged",
    commented: "commented on",
    moved: "moved",
    reset: "reset",
  };

  return (
    <div className="space-y-1">
      {activities.slice(0, 10).map((act) => (
        <div key={act.id} className="flex items-center gap-2.5 py-1.5 text-xs">
          <Avatar name={act.actor} />
          <span className="text-white/60">
            <span className="text-white/80 font-medium">{act.actor}</span>
            {" "}{actionLabels[act.action] || act.action}
            {act.details && (
              <span className="text-white/40"> &mdash; {act.details.length > 60 ? act.details.substring(0, 60) + "..." : act.details}</span>
            )}
          </span>
          <span className="text-white/20 ml-auto shrink-0">{timeAgo(act.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AI Breakdown Panel ─────────────────────────────────────────────────────

function AIBreakdownPanel({
  selectedName,
  onTasksCreated,
}: {
  selectedName: string;
  onTasksCreated: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<TrackerItem[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "scanning" | "revealing" | "done">("input");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!inputText.trim() || processing) return;
    setProcessing(true);
    setError(null);
    setGeneratedTasks([]);
    setRevealedCount(0);
    setPhase("scanning");

    try {
      const res = await fetch("/api/tracker/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          author: selectedName || "Team",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process");
      }

      const data = await res.json();
      const tasks = data.tasks as TrackerItem[];

      if (tasks.length === 0) {
        throw new Error("No tasks could be extracted. Try adding more detail.");
      }

      setGeneratedTasks(tasks);
      setPhase("revealing");

      // Staggered reveal — one task at a time
      for (let i = 0; i <= tasks.length; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 600 : 400));
        setRevealedCount(i);
      }

      setPhase("done");
      onTasksCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setPhase("input");
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setInputText("");
    setGeneratedTasks([]);
    setRevealedCount(0);
    setPhase("input");
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 mb-4">
      <motion.div
        layout
        className={`border rounded-2xl overflow-hidden transition-all ${
          isOpen
            ? "bg-gradient-to-br from-[#0A52EF]/[0.04] via-[#0a0f1e] to-purple-900/[0.04] border-[#0A52EF]/20"
            : "bg-white/[0.02] border-white/[0.06] hover:border-[#0A52EF]/15"
        }`}
      >
        {/* Toggle bar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0A52EF] to-purple-600 flex items-center justify-center shadow-sm shadow-[#0A52EF]/20">
            <BrainCircuit className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-white/90">AI Task Breakdown</span>
            <span className="text-xs text-white/30 ml-2">
              Type anything &mdash; AI structures it into tasks
            </span>
          </div>
          <Sparkles className={`w-4 h-4 transition-colors ${isOpen ? "text-[#0A52EF]" : "text-white/20"}`} />
          <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Expanded panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-4">
                {/* Guiding question */}
                <div className="flex items-start gap-3 p-3.5 bg-[#0A52EF]/[0.06] border border-[#0A52EF]/10 rounded-xl">
                  <Sparkles className="w-4 h-4 text-[#0A52EF] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-white/80 font-medium">
                      How do you imagine seeing the completion of Phase 2?
                    </p>
                    <p className="text-xs text-white/35 mt-1">
                      Describe what &ldquo;done&rdquo; looks like in your own words, or dump any requirements &mdash; AI will break it down into trackable tasks.
                    </p>
                  </div>
                </div>

                {/* Input area */}
                {(phase === "input" || phase === "scanning") && (
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="e.g. &quot;I want to upload an RFP PDF, see all LEDs recognized, get pricing that matches our quotes, generate vendor sheets, and produce a final proposal PDF...&quot;"
                      className={`w-full h-32 px-4 py-3 text-sm bg-white/[0.03] border rounded-xl text-white placeholder:text-white/20 focus:outline-none resize-none transition-all ${
                        phase === "scanning"
                          ? "border-[#0A52EF]/40 ring-1 ring-[#0A52EF]/20"
                          : "border-white/10 focus:border-[#0A52EF]/30 focus:ring-1 focus:ring-[#0A52EF]/15"
                      }`}
                      disabled={processing}
                    />

                    {/* Scanning overlay */}
                    {phase === "scanning" && (
                      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                        <motion.div
                          className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#0A52EF] to-transparent"
                          initial={{ top: 0 }}
                          animate={{ top: ["0%", "100%", "0%"] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        />
                        <div className="absolute inset-0 bg-[#0A52EF]/[0.02]" />
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Submit button */}
                {phase === "input" && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSubmit}
                      disabled={!inputText.trim() || processing}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0A52EF] to-[#7c3aed] hover:from-[#0847d0] hover:to-[#6d31d4] text-white text-sm font-semibold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm shadow-[#0A52EF]/20"
                    >
                      <BrainCircuit className="w-4 h-4" />
                      Break It Down
                    </button>
                    <span className="text-xs text-white/20">
                      AI will analyze your text and create structured tasks
                    </span>
                  </div>
                )}

                {/* Scanning state */}
                {phase === "scanning" && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex items-center gap-2 text-[#0A52EF]">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <BrainCircuit className="w-5 h-5" />
                      </motion.div>
                      <span className="text-sm font-medium">Analyzing your input...</span>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 bg-[#0A52EF] rounded-full"
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Generated tasks — revealed one at a time */}
                {(phase === "revealing" || phase === "done") && generatedTasks.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#0A52EF]" />
                      <span className="text-sm font-semibold text-white/80">
                        {phase === "revealing"
                          ? `Structuring... (${revealedCount}/${generatedTasks.length})`
                          : `${generatedTasks.length} tasks created`}
                      </span>
                      {phase === "done" && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-1" />
                      )}
                    </div>

                    {/* Original text fading out */}
                    {phase === "revealing" && (
                      <motion.div
                        animate={{ opacity: [0.5, 0.2] }}
                        transition={{ duration: 2 }}
                        className="px-4 py-3 bg-white/[0.02] rounded-lg border border-white/[0.04] text-xs text-white/25 line-clamp-2 italic"
                      >
                        &ldquo;{inputText}&rdquo;
                      </motion.div>
                    )}

                    {/* Tasks appearing */}
                    <div className="space-y-2">
                      {generatedTasks.map((task, i) => {
                        const isRevealed = i < revealedCount;
                        const catConfig = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG["Core Engine"];
                        const CatIcon = catConfig.icon;

                        if (!isRevealed) return null;

                        return (
                          <motion.div
                            key={task.id}
                            initial={{ opacity: 0, x: -20, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="flex items-center gap-3 p-3 bg-[#111827]/80 border border-white/[0.08] rounded-xl"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
                              className={`w-7 h-7 rounded-lg ${catConfig.bg} flex items-center justify-center shrink-0`}
                            >
                              <CatIcon className={`w-3.5 h-3.5 ${catConfig.accent}`} />
                            </motion.div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white/85 font-medium">{task.description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${catConfig.bg} ${catConfig.accent} font-medium`}>
                                  {task.category}
                                </span>
                                {task.priority !== "normal" && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    task.priority === "critical"
                                      ? "bg-red-500/15 text-red-400"
                                      : "bg-amber-500/15 text-amber-400"
                                  }`}>
                                    {task.priority}
                                  </span>
                                )}
                              </div>
                            </div>

                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.2 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-500/50" />
                            </motion.div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Done state */}
                    {phase === "done" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center gap-3 pt-2"
                      >
                        <button
                          onClick={handleReset}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 text-white/60 text-sm font-medium rounded-xl transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Break Down More
                        </button>
                        <span className="text-xs text-emerald-400/60">
                          Tasks added to Awaiting Review
                        </span>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Drag state for kanban
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOverColumn = useRef<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/tracker");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setItems(data.items || []);
      setActivities(data.activity || []);
    } catch (err) {
      console.error("Failed to load tracker:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (itemId: string, action: "verify" | "dispute") => {
    if (!selectedName) return;
    setSaving(itemId);
    try {
      const res = await fetch(`/api/tracker/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: selectedName, comment: commentInputs[itemId] || "" }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems((prev) => prev.map((i) => (i.id === itemId ? data.item : i)));
      setCommentInputs((p) => ({ ...p, [itemId]: "" }));
      // Refresh activity
      fetchItems();
    } catch (err) {
      console.error("Failed:", err);
    } finally {
      setSaving(null);
    }
  };

  const handleComment = async (itemId: string, commentText: string) => {
    if (!selectedName || !commentText.trim()) return;
    try {
      await fetch(`/api/tracker/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", name: selectedName, comment: commentText }),
      });
      fetchItems();
    } catch (err) {
      console.error("Failed to comment:", err);
    }
  };

  const handleColumnMove = async (itemId: string, newColumn: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, column: newColumn } : i)),
    );
    try {
      await fetch(`/api/tracker/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", column: newColumn, name: selectedName || "System" }),
      });
      fetchItems();
    } catch (err) {
      console.error("Failed to move:", err);
      fetchItems(); // revert
    }
  };

  // ─── Stats ──────────────────────────────────────────────────────────────

  const total = items.length;
  const verified = items.filter((i) => i.status === "verified").length;
  const disputed = items.filter((i) => i.status === "disputed").length;
  const awaiting = items.filter((i) => i.status === "claimed" || i.status === "pending").length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;

  // Unique verifiers
  const allVerifiers = new Set<string>();
  items.forEach((i) => {
    ((i.verifications || []) as Verification[]).forEach((v) => allVerifiers.add(v.name));
  });
  const totalReviews = items.reduce((s, i) => s + ((i.verifications as Verification[]) || []).length, 0);

  // Categories for list view
  const categories = [...new Set(items.map((i) => i.category))];
  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat),
  }));

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#0A52EF]/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#0A52EF]" />
          </div>
          <p className="text-white/50 text-sm">Loading Phase 2 Tracker...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      {/* ━━━ Hero Header ━━━ */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A52EF]/15 via-[#0a0f1e] to-purple-900/10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0A52EF]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-600/5 rounded-full blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-6 pt-10 pb-8">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0A52EF] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#0A52EF]/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Phase 2 Acceptance Tracker</h1>
                <p className="text-white/35 text-xs mt-0.5">ANC Proposal Engine &middot; Team Verification Board</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
                <button
                  onClick={() => setView("kanban")}
                  className={`p-2 rounded-lg transition-all ${
                    view === "kanban" ? "bg-[#0A52EF] text-white shadow-sm" : "text-white/40 hover:text-white/60"
                  }`}
                  title="Kanban view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`p-2 rounded-lg transition-all ${
                    view === "list" ? "bg-[#0A52EF] text-white shadow-sm" : "text-white/40 hover:text-white/60"
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => { setLoading(true); fetchItems(); }}
                className="p-2.5 hover:bg-white/5 rounded-xl transition-colors border border-white/10"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Progress ring */}
            <div className="col-span-2 md:col-span-1 flex items-center justify-center">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={pct === 100 ? "#10b981" : "#0A52EF"}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${pct * 2.51} ${251 - pct * 2.51}`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{pct}%</span>
                </div>
              </div>
            </div>

            <StatCard icon={CheckCircle2} label="Verified" value={verified} accent="emerald" />
            <StatCard icon={Clock} label="Awaiting" value={awaiting} accent="blue" />
            <StatCard icon={AlertTriangle} label="Disputed" value={disputed} accent="red" />
            <StatCard icon={User} label="Reviewers" value={allVerifiers.size} accent="purple" />
          </div>
        </div>
      </div>

      {/* ━━━ Team Selector ━━━ */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
          <span className="text-xs text-white/30 font-medium shrink-0 ml-1">Reviewing as:</span>
          <div className="flex gap-1.5 flex-wrap">
            {TEAM_MEMBERS.map((member) => (
              <button
                key={member.name}
                onClick={() => setSelectedName(selectedName === member.name ? "" : member.name)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-medium ${
                  selectedName === member.name
                    ? "bg-[#0A52EF] text-white shadow-sm shadow-[#0A52EF]/20"
                    : "bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/70"
                }`}
              >
                <Avatar name={member.name} />
                {member.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ━━━ AI Breakdown Panel ━━━ */}
      <AIBreakdownPanel selectedName={selectedName} onTasksCreated={fetchItems} />

      {/* ━━━ Main Content ━━━ */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="flex gap-6">
          {/* Main area */}
          <div className="flex-1 min-w-0">
            {view === "kanban" ? (
              /* ─── Kanban View ─── */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {KANBAN_COLUMNS.map((col) => {
                  const colItems = items.filter((i) => i.column === col.id);
                  const accent = ACCENT_MAP[col.accent];
                  const ColIcon = col.icon;

                  return (
                    <div
                      key={col.id}
                      className="min-h-[200px]"
                      onDragOver={(e) => {
                        e.preventDefault();
                        dragOverColumn.current = col.id;
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingId && dragOverColumn.current) {
                          handleColumnMove(draggingId, dragOverColumn.current);
                        }
                        setDraggingId(null);
                        dragOverColumn.current = null;
                      }}
                    >
                      {/* Column header */}
                      <div className={`flex items-center gap-2 mb-3 px-1`}>
                        <ColIcon className={`w-4 h-4 ${accent.text}`} />
                        <span className="text-sm font-semibold text-white/80">{col.label}</span>
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.bg} ${accent.text}`}>
                          {colItems.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="space-y-2.5">
                        <AnimatePresence mode="popLayout">
                          {colItems.map((item) => (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={() => setDraggingId(item.id)}
                              onDragEnd={() => setDraggingId(null)}
                              className={`cursor-grab active:cursor-grabbing ${
                                draggingId === item.id ? "opacity-50" : ""
                              }`}
                            >
                              <KanbanCard
                                item={item}
                                selectedName={selectedName}
                                onAction={handleAction}
                                onComment={handleComment}
                                saving={saving}
                              />
                            </div>
                          ))}
                        </AnimatePresence>

                        {colItems.length === 0 && (
                          <div className={`py-8 text-center text-xs text-white/15 border border-dashed ${accent.border} rounded-xl`}>
                            Drop items here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ─── List View ─── */
              <div className="space-y-6">
                {grouped.map(({ category, items: catItems }, catIdx) => {
                  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG["Core Engine"];
                  const CatIcon = config.icon;
                  const catVerified = catItems.filter((i) => i.status === "verified").length;
                  const catPct = catItems.length > 0 ? Math.round((catVerified / catItems.length) * 100) : 0;

                  return (
                    <motion.div
                      key={category}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: catIdx * 0.08 }}
                    >
                      {/* Category header */}
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center`}>
                          <CatIcon className={`w-3.5 h-3.5 ${config.accent}`} />
                        </div>
                        <h2 className="font-semibold text-base text-white/90">{category}</h2>
                        <div className="flex-1 h-px bg-white/[0.06] mx-2" />
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#0A52EF] to-[#7c3aed] transition-all duration-500"
                              style={{ width: `${catPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/30 font-medium">{catVerified}/{catItems.length}</span>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-1.5">
                        {catItems.map((item) => (
                          <ListItem
                            key={item.id}
                            item={item}
                            selectedName={selectedName}
                            onAction={handleAction}
                            onComment={handleComment}
                            saving={saving}
                          />
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Activity Sidebar ─── */}
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-6 space-y-4">
              {/* Activity feed */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-[#0A52EF]" />
                  <span className="text-sm font-semibold text-white/80">Activity</span>
                </div>
                {activities.length > 0 ? (
                  <ActivityTimeline activities={activities} />
                ) : (
                  <p className="text-xs text-white/20 text-center py-4">No activity yet. Be the first to review.</p>
                )}
              </div>

              {/* Team progress */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-white/80">Team Progress</span>
                </div>
                <div className="space-y-2.5">
                  {TEAM_MEMBERS.map((member) => {
                    const memberVerifications = items.reduce(
                      (count, item) =>
                        count +
                        ((item.verifications || []) as Verification[]).filter(
                          (v) => v.name === member.name,
                        ).length,
                      0,
                    );
                    const memberPct = total > 0 ? Math.round((memberVerifications / total) * 100) : 0;

                    return (
                      <div key={member.name} className="flex items-center gap-2.5">
                        <Avatar name={member.name} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-white/60 font-medium">{member.name}</span>
                            <span className="text-[10px] text-white/30">{memberVerifications}/{total}</span>
                          </div>
                          <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${member.color} transition-all duration-500`}
                              style={{ width: `${memberPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick stats */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
                <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-3">Summary</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/40">Total Items</span>
                    <span className="text-white/70 font-medium">{total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Reviews Filed</span>
                    <span className="text-white/70 font-medium">{totalReviews}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Completion</span>
                    <span className={`font-bold ${pct === 100 ? "text-emerald-400" : "text-[#0A52EF]"}`}>{pct}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ Footer ━━━ */}
      <div className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-[10px] text-white/15">ANC Proposal Engine v2.0 &middot; Phase 2 Acceptance</p>
          <div className="flex items-center gap-3 text-[10px] text-white/15">
            <span>{allVerifiers.size} reviewers</span>
            <span>&middot;</span>
            <span>{totalReviews} reviews</span>
            <span>&middot;</span>
            <span>{activities.length} activities</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
}) {
  const colors: Record<string, { text: string; bg: string }> = {
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
    blue: { text: "text-blue-400", bg: "bg-blue-500/10" },
    red: { text: "text-red-400", bg: "bg-red-500/10" },
    purple: { text: "text-purple-400", bg: "bg-purple-500/10" },
  };
  const c = colors[accent] || colors.blue;

  return (
    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-6 h-6 rounded-md ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        </div>
        <span className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
}
