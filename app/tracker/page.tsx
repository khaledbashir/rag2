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
  Sparkles,
  BrainCircuit,
  Plus,
  Trash2,
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

const BLUE = "#0A52EF"; // ANC French Blue

const TEAM = [
  { name: "Natalia", initials: "NK" },
  { name: "Jeremy", initials: "JR" },
  { name: "Matt", initials: "MM" },
  { name: "Jireh", initials: "JH" },
  { name: "Eric", initials: "EP" },
  { name: "Ahmad", initials: "AB" },
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

function initials(name: string): string {
  return TEAM.find((t) => t.name === name)?.initials || name.slice(0, 2).toUpperCase();
}

// ─── Tiny avatar ────────────────────────────────────────────────────────────

function Av({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-[#0A52EF] flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

// ─── Card (shared by kanban + list) ─────────────────────────────────────────

function Card({
  item,
  me,
  onAction,
  onComment,
  onDelete,
  saving,
}: {
  item: TrackerItem;
  me: string;
  onAction: (id: string, a: "verify" | "dispute") => void;
  onComment: (id: string, c: string) => void;
  onDelete: (id: string) => void;
  saving: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const vf = (item.verifications || []) as Verification[];
  const cc = item._count?.comments || item.comments?.length || 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        open ? "bg-white border-gray-200 shadow-sm" : "bg-white border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="px-3.5 py-2.5 cursor-pointer flex items-start gap-3" onClick={() => setOpen(!open)}>
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          {item.status === "verified" ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : item.status === "disputed" ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <Clock className="w-4 h-4 text-gray-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-[13px] leading-snug ${item.status === "verified" ? "text-gray-400 line-through" : "text-gray-800"}`}>
            {item.description}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400 font-medium">{item.category}</span>
            {item.status === "claimed" && item.claimedBy && (
              <span className="text-[10px] text-[#0A52EF]/70 bg-[#0A52EF]/5 px-1.5 py-0.5 rounded font-medium">
                {item.claimedBy} claims: done
              </span>
            )}
            {item.status === "verified" && (
              <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">Verified</span>
            )}
            {item.status === "disputed" && (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-medium">Needs work</span>
            )}
            {vf.length > 0 && (
              <div className="flex -space-x-1 ml-1">
                {vf.map((v) => (
                  <div key={v.name} className="relative">
                    <Av name={v.name} size={16} />
                    <div className={`absolute -bottom-px -right-px w-2 h-2 rounded-full border border-white ${
                      v.status === "verified" ? "bg-green-500" : "bg-red-500"
                    }`} />
                  </div>
                ))}
              </div>
            )}
            {cc > 0 && (
              <span className="flex items-center gap-0.5 text-gray-300 ml-auto">
                <MessageSquare className="w-3 h-3" />
                <span className="text-[10px]">{cc}</span>
              </span>
            )}
          </div>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-gray-300 mt-1 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
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
            <div className="px-3.5 pb-3 pt-1 border-t border-gray-100 space-y-2.5 ml-7">
              {/* Reviews */}
              {vf.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {vf.map((v) => (
                    <div key={v.name} className="flex items-center gap-2 text-xs">
                      <Av name={v.name} size={18} />
                      <span className="text-gray-600 font-medium">{v.name}</span>
                      {v.status === "verified" ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <X className="w-3 h-3 text-red-500" />
                      )}
                      {v.comment && <span className="text-gray-400 truncate">{v.comment}</span>}
                      <span className="text-gray-300 ml-auto text-[10px]">{timeAgo(v.date)}</span>
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
                        <span className="text-gray-600 font-medium">{c.author}</span>
                        <span className="text-gray-400 ml-1.5">{c.body}</span>
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
                      className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-[#0A52EF]/40 focus:ring-1 focus:ring-[#0A52EF]/10"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); if (text.trim()) { onComment(item.id, text); setText(""); } }}
                      className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAction(item.id, "verify"); }}
                      disabled={saving === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-md disabled:opacity-40 transition-colors"
                    >
                      {saving === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Verify
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAction(item.id, "dispute"); }}
                      disabled={saving === item.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md disabled:opacity-40 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Flag
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      className="flex items-center justify-center px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-400">Select your name above to interact</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── AI Panel ───────────────────────────────────────────────────────────────

function AIPanel({ me, onDone }: { me: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<TrackerItem[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "thinking" | "revealing" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null); setTasks([]); setRevealed(0); setPhase("thinking");
    try {
      const res = await fetch("/api/tracker/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: me || "Team" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const d = await res.json();
      const t = d.tasks as TrackerItem[];
      if (!t.length) throw new Error("Couldn't extract tasks. Try more detail.");
      setTasks(t); setPhase("revealing");
      for (let i = 1; i <= t.length; i++) {
        await new Promise((r) => setTimeout(r, i === 1 ? 500 : 300));
        setRevealed(i);
      }
      setPhase("done"); onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong"); setPhase("idle");
    } finally { setBusy(false); }
  };

  const reset = () => { setText(""); setTasks([]); setRevealed(0); setPhase("idle"); setErr(null); };

  return (
    <div className="mb-4">
      <div className={`border rounded-lg transition-colors ${open ? "bg-blue-50/30 border-[#0A52EF]/15" : "bg-white border-gray-100 hover:border-gray-200"}`}>
        <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
          <BrainCircuit className={`w-4 h-4 ${open ? "text-[#0A52EF]" : "text-gray-400"}`} />
          <span className="text-sm font-medium text-gray-700">AI Task Breakdown</span>
          <span className="text-xs text-gray-400 hidden sm:inline">Type anything, AI structures it</span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
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
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 pt-3">
                  How do you imagine seeing Phase 2 completion? Or just dump any notes.
                </p>

                {(phase === "idle" || phase === "thinking") && (
                  <div className="relative">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder='"upload an RFP, see all LEDs recognized, pricing matches quotes, generate vendor sheets, final PDF..."'
                      className={`w-full h-24 px-3 py-2.5 text-sm bg-white border rounded-lg text-gray-700 placeholder:text-gray-300 focus:outline-none resize-none ${
                        phase === "thinking" ? "border-[#0A52EF]/30 ring-1 ring-[#0A52EF]/10" : "border-gray-200 focus:border-[#0A52EF]/30 focus:ring-1 focus:ring-[#0A52EF]/10"
                      }`}
                      disabled={busy}
                    />
                    {phase === "thinking" && (
                      <motion.div
                        className="absolute inset-x-0 top-0 h-px bg-[#0A52EF]"
                        animate={{ opacity: [0.2, 0.8, 0.2] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                )}

                {err && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {err}</p>}

                {phase === "idle" && (
                  <button
                    onClick={go}
                    disabled={!text.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0A52EF] hover:bg-[#0847d0] text-white rounded-lg disabled:opacity-25 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Break It Down
                  </button>
                )}

                {phase === "thinking" && (
                  <div className="flex items-center gap-2 text-sm text-[#0A52EF]">
                    <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                  </div>
                )}

                {(phase === "revealing" || phase === "done") && tasks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">
                      {phase === "revealing" ? `Structuring... ${revealed}/${tasks.length}` : `${tasks.length} tasks added`}
                      {phase === "done" && <Check className="w-3 h-3 text-green-500 inline ml-1" />}
                    </p>

                    {phase === "revealing" && (
                      <motion.p animate={{ opacity: [0.4, 0.15] }} transition={{ duration: 2 }} className="text-[11px] text-gray-300 italic truncate">
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
                            className="flex items-center gap-2.5 px-3 py-2 bg-white border border-gray-100 rounded-md"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60 shrink-0" />
                            <span className="text-[13px] text-gray-700 flex-1">{t.description}</span>
                            <span className="text-[10px] text-gray-300">{t.category}</span>
                          </motion.div>
                        );
                      })}
                    </div>

                    {phase === "done" && (
                      <button onClick={reset} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mt-1">
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
  if (!items.length) return <p className="text-xs text-gray-300 py-4 text-center">No activity yet</p>;
  const labels: Record<string, string> = { verified: "verified", disputed: "flagged", commented: "commented", moved: "moved", breakdown: "AI created", created: "AI added", deleted: "deleted" };
  return (
    <div className="space-y-0.5">
      {items.slice(0, 12).map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
          <Av name={a.actor} size={16} />
          <span className="text-gray-400 truncate flex-1">
            <span className="text-gray-600 font-medium">{a.actor}</span>
            {" "}{labels[a.action] || a.action}
            {a.details && <span className="text-gray-300"> — {a.details.length > 50 ? a.details.slice(0, 50) + "..." : a.details}</span>}
          </span>
          <span className="text-gray-300 shrink-0">{timeAgo(a.createdAt)}</span>
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
  const [view, setView] = useState<"list" | "kanban">("list");
  const dragId = useRef<string | null>(null);
  const dragCol = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tracker");
      const d = await r.json();
      setItems(d.items || []);
      setActivity(d.activity || []);
    } catch { /* */ } finally { setLoading(false); }
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name: me || "System" }),
      });
      load();
    } catch { load(); }
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

  const [addText, setAddText] = useState("");
  const [addCat, setAddCat] = useState("Custom");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!addText.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", description: addText, category: addCat, author: me || "System" }),
      });
      setAddText("");
      load();
    } catch { /* */ } finally { setAdding(false); }
  };

  const total = items.length;
  const verified = items.filter((i) => i.status === "verified").length;
  const disputed = items.filter((i) => i.status === "disputed").length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
  const cats = [...new Set(items.map((i) => i.category))];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Phase 2 Acceptance</h1>
              <p className="text-xs text-gray-400 mt-0.5">Ahmad claims these are done. Your job: verify or flag.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-md p-0.5">
                <button
                  onClick={() => setView("list")}
                  className={`p-1.5 rounded ${view === "list" ? "bg-white text-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setView("kanban")}
                  className={`p-1.5 rounded ${view === "kanban" ? "bg-white text-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => { setLoading(true); load(); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-5 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9">
                <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#f3f4f6" strokeWidth="2.5" />
                  <circle
                    cx="18" cy="18" r="15" fill="none"
                    stroke={pct === 100 ? "#22c55e" : BLUE}
                    strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${pct * 0.94} 100`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600">{pct}%</span>
              </div>
              <span className="text-xs text-gray-500"><span className="font-semibold text-gray-700">{verified}</span>/{total} verified</span>
            </div>
            {disputed > 0 && (
              <>
                <div className="h-4 w-px bg-gray-200" />
                <span className="text-xs text-red-500">{disputed} disputed</span>
              </>
            )}
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden md:block">
              <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-green-500" : "bg-[#0A52EF]"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Team */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 mr-0.5">You:</span>
            {TEAM.map((t) => (
              <button
                key={t.name}
                onClick={() => setMe(me === t.name ? "" : t.name)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  me === t.name
                    ? "bg-[#0A52EF]/10 text-[#0A52EF] ring-1 ring-[#0A52EF]/20"
                    : "bg-gray-100 text-gray-500 hover:text-gray-700"
                }`}
              >
                <Av name={t.name} size={16} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pt-5 pb-12">
        {/* AI Panel */}
        <AIPanel me={me} onDone={load} />

        {/* Manual add */}
        <div className="flex gap-2 mb-4">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Add a task manually..."
            className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-[#0A52EF]/30 focus:ring-1 focus:ring-[#0A52EF]/10"
          />
          <select
            value={addCat}
            onChange={(e) => setAddCat(e.target.value)}
            className="px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-lg text-gray-500 focus:outline-none focus:border-[#0A52EF]/30"
          >
            <option value="Custom">Custom</option>
            <option value="Core Engine">Core Engine</option>
            <option value="Quote Workflow">Quote Workflow</option>
            <option value="Validation">Validation</option>
            <option value="Output">Output</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!addText.trim() || adding}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-[#0A52EF] hover:bg-[#0847d0] text-white rounded-lg disabled:opacity-25 transition-colors"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            {view === "list" ? (
              <div className="space-y-5">
                {cats.map((cat) => {
                  const ci = items.filter((i) => i.category === cat);
                  const cv = ci.filter((i) => i.status === "verified").length;
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cat}</span>
                        <div className="flex-1 h-px bg-gray-100" />
                        <span className="text-[10px] text-gray-300 font-medium">{cv}/{ci.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {ci.map((item) => (
                          <Card key={item.id} item={item} me={me} onAction={handleAction} onComment={handleComment} onDelete={handleDelete} saving={saving} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
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
                      <div className="flex items-center gap-2 mb-2 px-0.5">
                        <span className="text-xs font-semibold text-gray-500">{col.label}</span>
                        <span className="text-[10px] text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded-full">{colItems.length}</span>
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
                            <Card item={item} me={me} onAction={handleAction} onComment={handleComment} onDelete={handleDelete} saving={saving} />
                          </div>
                        ))}
                        {colItems.length === 0 && (
                          <div className="py-6 text-center text-[11px] text-gray-300 border border-dashed border-gray-200 rounded-lg">
                            Drag items here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-6 space-y-4">
              <div className="p-3 bg-white border border-gray-100 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500">Activity</span>
                </div>
                <Feed items={activity} />
              </div>
              <div className="p-3 bg-white border border-gray-100 rounded-lg">
                <span className="text-xs font-semibold text-gray-500">Team</span>
                <div className="mt-2.5 space-y-2">
                  {TEAM.map((t) => {
                    const c = items.reduce((n, it) => n + ((it.verifications || []) as Verification[]).filter((v) => v.name === t.name).length, 0);
                    const p = total > 0 ? Math.round((c / total) * 100) : 0;
                    return (
                      <div key={t.name} className="flex items-center gap-2">
                        <Av name={t.name} size={18} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[11px] text-gray-500">{t.name}</span>
                            <span className="text-[10px] text-gray-300">{c}</span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#0A52EF] rounded-full transition-all" style={{ width: `${p}%` }} />
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
    </div>
  );
}
