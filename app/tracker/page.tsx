"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  RefreshCw,
  Loader2,
  Check,
  X,
  MessageSquare,
  LayoutGrid,
  List,
  Send,
  Activity,
  Eye,
  Sparkles,
  BrainCircuit,
  Plus,
  ArrowRight,
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

const TEAM = [
  { name: "Natalia", initials: "NK", role: "Proposals" },
  { name: "Jeremy", initials: "JR", role: "Technical" },
  { name: "Matt", initials: "MM", role: "Sales" },
  { name: "Jireh", initials: "JH", role: "Operations" },
  { name: "Eric", initials: "EP", role: "Engineering" },
  { name: "Alison", initials: "AW", role: "Coordinator" },
];

const COLUMNS = [
  { id: "awaiting_review", label: "Awaiting Review" },
  { id: "in_review", label: "In Review" },
  { id: "verified", label: "Verified" },
  { id: "disputed", label: "Needs Work" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function getInitials(name: string): string {
  return TEAM.find((t) => t.name === name)?.initials || name.slice(0, 2).toUpperCase();
}

// ─── Small components ───────────────────────────────────────────────────────

function Av({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-neutral-700 flex items-center justify-center font-semibold text-neutral-300 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Kanban Card ────────────────────────────────────────────────────────────

function Card({
  item,
  me,
  onAction,
  onComment,
  saving,
}: {
  item: TrackerItem;
  me: string;
  onAction: (id: string, a: "verify" | "dispute") => void;
  onComment: (id: string, c: string) => void;
  saving: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const vf = (item.verifications || []) as Verification[];
  const cc = item._count?.comments || item.comments?.length || 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        open ? "bg-neutral-800/60 border-neutral-700" : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
      }`}
    >
      <div className="px-3 py-2.5 cursor-pointer" onClick={() => setOpen(!open)}>
        <p className={`text-[13px] leading-snug ${item.status === "verified" ? "text-neutral-500 line-through" : "text-neutral-200"}`}>
          {item.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-neutral-500 font-medium">{item.category}</span>
          {vf.length > 0 && (
            <div className="flex -space-x-1 ml-auto">
              {vf.map((v) => (
                <div key={v.name} className="relative">
                  <Av name={v.name} size={18} />
                  <div className={`absolute -bottom-px -right-px w-2 h-2 rounded-full border border-neutral-900 ${
                    v.status === "verified" ? "bg-green-500" : "bg-red-500"
                  }`} />
                </div>
              ))}
            </div>
          )}
          {cc > 0 && (
            <span className="flex items-center gap-0.5 text-neutral-600 ml-auto">
              <MessageSquare className="w-3 h-3" />
              <span className="text-[10px]">{cc}</span>
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-neutral-800 space-y-2.5">
              {/* Reviews */}
              {vf.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {vf.map((v) => (
                    <div key={v.name} className="flex items-center gap-2 text-xs">
                      <Av name={v.name} size={18} />
                      <span className="text-neutral-400">{v.name}</span>
                      {v.status === "verified" ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <X className="w-3 h-3 text-red-500" />
                      )}
                      {v.comment && <span className="text-neutral-600 truncate">{v.comment}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Comments */}
              {(item.comments || []).length > 0 && (
                <div className="space-y-1.5">
                  {(item.comments || []).map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      <Av name={c.author} size={18} />
                      <div>
                        <span className="text-neutral-400 font-medium">{c.author}</span>
                        <span className="text-neutral-600 ml-1.5">{c.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input + actions */}
              {me ? (
                <>
                  <div className="flex gap-1.5">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onComment(item.id, text); setText(""); } }}
                      placeholder="Comment..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); if (text.trim()) { onComment(item.id, text); setText(""); } }}
                      className="p-1.5 hover:bg-neutral-800 rounded-md text-neutral-600 hover:text-neutral-400"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAction(item.id, "verify"); }}
                      disabled={saving === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-md disabled:opacity-40 transition-colors"
                    >
                      {saving === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Verify
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAction(item.id, "dispute"); }}
                      disabled={saving === item.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-md disabled:opacity-40 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Flag
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-neutral-600">Select your name above to interact</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── AI Breakdown Panel ─────────────────────────────────────────────────────

function AIPanel({
  me,
  onDone,
}: {
  me: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<TrackerItem[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "thinking" | "revealing" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setTasks([]);
    setRevealed(0);
    setPhase("thinking");

    try {
      const res = await fetch("/api/tracker/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: me || "Team" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      const d = await res.json();
      const t = d.tasks as TrackerItem[];
      if (!t.length) throw new Error("Couldn't extract tasks — try adding more detail.");

      setTasks(t);
      setPhase("revealing");

      for (let i = 1; i <= t.length; i++) {
        await new Promise((r) => setTimeout(r, i === 1 ? 500 : 350));
        setRevealed(i);
      }

      setPhase("done");
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setText("");
    setTasks([]);
    setRevealed(0);
    setPhase("idle");
    setErr(null);
  };

  return (
    <div className="mb-4">
      <div className={`border rounded-lg transition-colors ${open ? "bg-neutral-900/80 border-neutral-700" : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"}`}>
        {/* Toggle */}
        <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <BrainCircuit className={`w-4 h-4 ${open ? "text-blue-400" : "text-neutral-600"}`} />
          <span className="text-sm font-medium text-neutral-300">AI Task Breakdown</span>
          <span className="text-xs text-neutral-600 hidden sm:inline">Type anything, AI structures it</span>
          <ChevronDown className={`w-3.5 h-3.5 text-neutral-600 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-neutral-800">
                {/* Prompt */}
                <p className="text-xs text-neutral-500 pt-3">
                  How do you imagine seeing Phase 2 completion? Or just dump any notes/requirements.
                </p>

                {/* Input */}
                {(phase === "idle" || phase === "thinking") && (
                  <div className="relative">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder='e.g. "upload an RFP, see all LEDs recognized, pricing matches quotes, generate vendor sheets, final PDF..."'
                      className={`w-full h-24 px-3 py-2.5 text-sm bg-neutral-800/50 border rounded-lg text-neutral-200 placeholder:text-neutral-700 focus:outline-none resize-none ${
                        phase === "thinking" ? "border-blue-500/30" : "border-neutral-700 focus:border-neutral-600"
                      }`}
                      disabled={busy}
                    />
                    {phase === "thinking" && (
                      <motion.div
                        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                )}

                {err && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> {err}
                  </p>
                )}

                {/* Submit */}
                {phase === "idle" && (
                  <button
                    onClick={go}
                    disabled={!text.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Break It Down
                  </button>
                )}

                {/* Thinking */}
                {phase === "thinking" && (
                  <div className="flex items-center gap-2 text-sm text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </div>
                )}

                {/* Tasks appearing */}
                {(phase === "revealing" || phase === "done") && tasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-500">
                      {phase === "revealing" ? `Structuring... ${revealed}/${tasks.length}` : `${tasks.length} tasks added`}
                      {phase === "done" && <Check className="w-3 h-3 text-green-500 inline ml-1" />}
                    </p>

                    {/* Fading original */}
                    {phase === "revealing" && (
                      <motion.p
                        animate={{ opacity: [0.4, 0.15] }}
                        transition={{ duration: 2 }}
                        className="text-[11px] text-neutral-700 italic truncate"
                      >
                        &ldquo;{text}&rdquo;
                      </motion.p>
                    )}

                    <div className="space-y-1.5">
                      {tasks.map((t, i) => {
                        if (i >= revealed) return null;
                        return (
                          <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                            className="flex items-center gap-2.5 px-3 py-2 bg-neutral-800/60 border border-neutral-800 rounded-md"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            <span className="text-[13px] text-neutral-300 flex-1">{t.description}</span>
                            <span className="text-[10px] text-neutral-600">{t.category}</span>
                          </motion.div>
                        );
                      })}
                    </div>

                    {phase === "done" && (
                      <button
                        onClick={reset}
                        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-400 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Break down more
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Activity Feed ──────────────────────────────────────────────────────────

function Feed({ items }: { items: ActivityEntry[] }) {
  if (!items.length) return <p className="text-xs text-neutral-700 py-4 text-center">No activity yet</p>;
  const labels: Record<string, string> = { verified: "verified", disputed: "flagged", commented: "commented", moved: "moved", breakdown: "AI created", created: "AI added" };
  return (
    <div className="space-y-0.5">
      {items.slice(0, 12).map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
          <Av name={a.actor} size={16} />
          <span className="text-neutral-500 truncate flex-1">
            <span className="text-neutral-400 font-medium">{a.actor}</span>
            {" "}{labels[a.action] || a.action}
            {a.details && <span className="text-neutral-600"> — {a.details.length > 50 ? a.details.slice(0, 50) + "..." : a.details}</span>}
          </span>
          <span className="text-neutral-700 shrink-0">{timeAgo(a.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const dragId = useRef<string | null>(null);
  const dragCol = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tracker");
      const d = await r.json();
      setItems(d.items || []);
      setActivity(d.activity || []);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: "verify" | "dispute") => {
    if (!me) return;
    setSaving(id);
    try {
      const r = await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: me }),
      });
      if (r.ok) load();
    } catch { /* */ } finally { setSaving(null); }
  };

  const handleComment = async (id: string, body: string) => {
    if (!me || !body.trim()) return;
    try {
      await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", name: me, comment: body }),
      });
      load();
    } catch { /* */ }
  };

  const handleMove = async (id: string, col: string) => {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, column: col } : i)));
    try {
      await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", column: col, name: me || "System" }),
      });
      load();
    } catch { load(); }
  };

  // Stats
  const total = items.length;
  const verified = items.filter((i) => i.status === "verified").length;
  const disputed = items.filter((i) => i.status === "disputed").length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;

  // Group for list view
  const cats = [...new Set(items.map((i) => i.category))];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      {/* ── Header ── */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Phase 2 Acceptance</h1>
            <p className="text-xs text-neutral-600 mt-0.5">ANC Proposal Engine</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-md p-0.5">
              <button
                onClick={() => setView("kanban")}
                className={`p-1.5 rounded ${view === "kanban" ? "bg-neutral-800 text-neutral-200" : "text-neutral-600 hover:text-neutral-400"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-1.5 rounded ${view === "list" ? "bg-neutral-800 text-neutral-200" : "text-neutral-600 hover:text-neutral-400"}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={() => { setLoading(true); load(); }} className="p-1.5 hover:bg-neutral-900 rounded-md text-neutral-600 hover:text-neutral-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-neutral-800 flex items-center justify-center relative">
              <svg className="w-10 h-10 -rotate-90 absolute" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-800" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={pct === 100 ? "#22c55e" : "#3b82f6"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${pct * 0.94} 100`}
                />
              </svg>
              <span className="text-[10px] font-bold text-neutral-300">{pct}%</span>
            </div>
            <div className="text-xs text-neutral-500">
              <span className="text-neutral-300 font-medium">{verified}</span> of {total} verified
            </div>
          </div>
          <div className="h-4 w-px bg-neutral-800" />
          {disputed > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-neutral-500">{disputed} disputed</span>
              </div>
              <div className="h-4 w-px bg-neutral-800" />
            </>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-neutral-500">{total - verified - disputed} awaiting</span>
          </div>
          {/* Progress bar */}
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden hidden md:block">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Team selector */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-neutral-600 mr-1">You:</span>
          {TEAM.map((t) => (
            <button
              key={t.name}
              onClick={() => setMe(me === t.name ? "" : t.name)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                me === t.name
                  ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30"
                  : "bg-neutral-900 text-neutral-500 hover:text-neutral-300 border border-neutral-800"
              }`}
            >
              <Av name={t.name} size={16} />
              {t.name}
            </button>
          ))}
        </div>

        {/* AI Panel */}
        <AIPanel me={me} onDone={load} />
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="flex gap-6">
          {/* Main */}
          <div className="flex-1 min-w-0">
            {view === "kanban" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {COLUMNS.map((col) => {
                  const colItems = items.filter((i) => i.column === col.id);
                  return (
                    <div
                      key={col.id}
                      className="min-h-[120px]"
                      onDragOver={(e) => { e.preventDefault(); dragCol.current = col.id; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId.current && dragCol.current) handleMove(dragId.current, dragCol.current);
                        dragId.current = null;
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2.5 px-0.5">
                        <span className="text-xs font-semibold text-neutral-400">{col.label}</span>
                        <span className="text-[10px] text-neutral-600 bg-neutral-900 px-1.5 py-0.5 rounded-full">{colItems.length}</span>
                      </div>
                      <div className="space-y-2">
                        {colItems.map((item) => (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={() => { dragId.current = item.id; }}
                            onDragEnd={() => { dragId.current = null; }}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <Card item={item} me={me} onAction={handleAction} onComment={handleComment} saving={saving} />
                          </div>
                        ))}
                        {colItems.length === 0 && (
                          <div className="py-6 text-center text-[11px] text-neutral-800 border border-dashed border-neutral-800 rounded-lg">
                            Drag items here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List view */
              <div className="space-y-5">
                {cats.map((cat) => {
                  const ci = items.filter((i) => i.category === cat);
                  const cv = ci.filter((i) => i.status === "verified").length;
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-neutral-400">{cat}</span>
                        <div className="flex-1 h-px bg-neutral-800" />
                        <span className="text-[10px] text-neutral-600">{cv}/{ci.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {ci.map((item) => (
                          <Card key={item.id} item={item} me={me} onAction={handleAction} onComment={handleComment} saving={saving} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-6 space-y-4">
              {/* Activity */}
              <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-neutral-600" />
                  <span className="text-xs font-semibold text-neutral-400">Activity</span>
                </div>
                <Feed items={activity} />
              </div>

              {/* Team progress */}
              <div className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <span className="text-xs font-semibold text-neutral-400">Team</span>
                <div className="mt-2.5 space-y-2">
                  {TEAM.map((t) => {
                    const c = items.reduce(
                      (n, it) => n + ((it.verifications || []) as Verification[]).filter((v) => v.name === t.name).length, 0,
                    );
                    const p = total > 0 ? Math.round((c / total) * 100) : 0;
                    return (
                      <div key={t.name} className="flex items-center gap-2">
                        <Av name={t.name} size={18} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[11px] text-neutral-500">{t.name}</span>
                            <span className="text-[10px] text-neutral-700">{c}</span>
                          </div>
                          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${p}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-900">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-[10px] text-neutral-800">
          <span>ANC Proposal Engine</span>
          <span>{items.reduce((s, i) => s + ((i.verifications as Verification[]) || []).length, 0)} total reviews</span>
        </div>
      </div>
    </div>
  );
}
