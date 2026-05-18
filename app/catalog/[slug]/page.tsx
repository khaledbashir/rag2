"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";

/* ─────────────────── Types ─────────────────── */

interface Comment { id: string; author: string; body: string; createdAt: string }

interface Item {
  id: string; title: string; description: string; tier: string;
  price: number; discount: number; position: number; status: string;
  aiReasoning: string | null; dataEvidence: string | null;
  impactLevel: string | null; estimatedWeeks: number | null;
  category: string | null; persona: string | null;
  department: string | null; endGoal: string | null;
  aiScore: number; likes: number; dislikes: number;
  comments: Comment[];
}

interface Catalog {
  id: string; slug: string; clientName: string;
  title: string; subtitle: string | null; items: Item[];
}

/* ─────────────────── Constants ─────────────────── */

const PERSONA_COLORS: Record<string, { bg: string; text: string; border: string; badge: string; ring: string; gradient: string }> = {
  Natalia: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", badge: "bg-blue-100", ring: "ring-blue-300", gradient: "from-blue-600 to-blue-800" },
  Joe: { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200", badge: "bg-orange-100", ring: "ring-orange-300", gradient: "from-orange-600 to-orange-800" },
  Jireh: { bg: "bg-violet-50", text: "text-violet-800", border: "border-violet-200", badge: "bg-violet-100", ring: "ring-violet-300", gradient: "from-violet-600 to-violet-800" },
  Alexis: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", badge: "bg-rose-100", ring: "ring-rose-300", gradient: "from-rose-600 to-rose-800" },
  Chris: { bg: "bg-teal-50", text: "text-teal-800", border: "border-teal-200", badge: "bg-teal-100", ring: "ring-teal-300", gradient: "from-teal-600 to-teal-800" },
  Everyone: { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-200", badge: "bg-slate-100", ring: "ring-slate-300", gradient: "from-slate-700 to-slate-900" },
};

const PERSONA_ROLES: Record<string, string> = {
  Natalia: "Estimation & Proposals Lead",
  Joe: "VP, Service Operations",
  Jireh: "President, Venue Partnerships",
  Alexis: "Enterprise Solutions & Design",
  Chris: "Support & Ticketing",
  Everyone: "Cross-Team Automation",
};

const PERSONA_ICONS: Record<string, string> = {
  Natalia: "📊", Joe: "⚙️", Jireh: "📈", Alexis: "🎨", Chris: "🎫", Everyone: "🔗",
};

/* ─────────────────── Main Page ─────────────────── */

export default function CatalogPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const isAdmin = searchParams.get("admin") === "1";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchCatalog = useCallback(async () => {
    const res = await fetch(`/api/catalog/${slug}`);
    if (res.ok) setCatalog(await res.json());
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const api = async (body: Record<string, unknown>) => {
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await fetchCatalog();
  };

  const react = (itemId: string, reaction: string) => api({ action: "react", itemId, reaction });
  const comment = async (itemId: string) => {
    if (!commentText.trim()) return;
    await api({ action: "comment", itemId, author: commentAuthor || "Anonymous", text: commentText });
    setCommentText(""); setCommentingOn(null);
  };
  const updateStatus = (id: string, status: string) => api({ action: "updateItem", itemId: id, status });

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        <p className="text-sm text-white/30 tracking-widest uppercase">Loading intelligence...</p>
      </div>
    </div>
  );

  if (!catalog) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <p className="text-white/40 text-sm">Not found</p>
    </div>
  );

  const shipped = catalog.items.filter(i => i.status === "shipped");
  const selected = catalog.items.filter(i => i.status === "selected");
  const selectedTotal = selected.reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);
  const personas = [...new Set(catalog.items.map(i => i.persona).filter(Boolean))] as string[];
  const departments = [...new Set(catalog.items.map(i => i.department).filter(Boolean))] as string[];
  const endGoals = [...new Set(catalog.items.map(i => i.endGoal).filter(Boolean))] as string[];

  const filteredItems = activeTab === "all" ? catalog.items :
    activeTab.startsWith("p:") ? catalog.items.filter(i => i.persona === activeTab.slice(2)) :
    activeTab.startsWith("d:") ? catalog.items.filter(i => i.department === activeTab.slice(2)) :
    activeTab.startsWith("g:") ? catalog.items.filter(i => i.endGoal === activeTab.slice(2)) :
    activeTab === "shipped" ? shipped :
    activeTab === "high" ? catalog.items.filter(i => i.impactLevel === "high" && i.status !== "shipped") :
    catalog.items;

  const groupedByPersona = personas.map(p => ({
    persona: p,
    items: filteredItems.filter(i => i.persona === p).sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)),
  })).filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {isAdmin && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-500 text-white text-[10px] font-bold tracking-[2px] uppercase px-4 py-2 rounded-full shadow-2xl">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> Admin
        </div>
      )}

      {/* ─── HERO ─── */}
      <header className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-blue-600/[0.03] rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-violet-600/[0.03] rounded-full blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <div className="text-[10px] font-bold tracking-[4px] uppercase text-white/30 mb-6">ANC Sports · Platform Strategy</div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-6 max-w-4xl">
            What&apos;s Next for{" "}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-rose-400 bg-clip-text text-transparent">
              Your Platform
            </span>
          </h1>

          <p className="text-base sm:text-lg text-white/40 max-w-2xl leading-relaxed mb-14">
            {catalog.subtitle || "Every recommendation below is grounded in your data — real usage patterns, real pain points, real outcomes."}
          </p>

          {/* Key numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <HeroStat value={catalog.items.length.toString()} label="Recommendations" />
            <HeroStat value={shipped.length.toString()} label="Already Delivered" accent="emerald" />
            <HeroStat value={catalog.items.filter(i => i.impactLevel === "high" && i.status !== "shipped").length.toString()} label="High Impact" accent="rose" />
            <HeroStat value={personas.length.toString()} label="People Impacted" accent="violet" />
            <HeroStat value={departments.length.toString()} label="Systems Covered" accent="blue" />
          </div>
        </div>
      </header>

      {/* ─── FILTER TABS ─── */}
      <nav className="sticky top-0 z-30 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-3 overflow-x-auto scrollbar-none">
          <div className="flex gap-1.5 min-w-max">
            <FilterChip active={activeTab === "all"} onClick={() => setActiveTab("all")} label="All" count={catalog.items.length} />
            <FilterChip active={activeTab === "high"} onClick={() => setActiveTab("high")} label="High Impact" accent="rose" />
            <FilterChip active={activeTab === "shipped"} onClick={() => setActiveTab("shipped")} label="Delivered" accent="emerald" />
            <div className="w-px bg-white/10 mx-1" />
            {personas.map(p => (
              <FilterChip key={p} active={activeTab === `p:${p}`} onClick={() => setActiveTab(`p:${p}`)} label={p} icon={PERSONA_ICONS[p]} />
            ))}
            <div className="w-px bg-white/10 mx-1" />
            {endGoals.map(g => (
              <FilterChip key={g} active={activeTab === `g:${g}`} onClick={() => setActiveTab(`g:${g}`)} label={g} />
            ))}
          </div>
        </div>
      </nav>

      {/* ─── PERSONA JOURNEY LANES ─── */}
      <main className="max-w-7xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {groupedByPersona.map(({ persona, items }) => {
          const pc = PERSONA_COLORS[persona] || PERSONA_COLORS.Everyone;
          const role = PERSONA_ROLES[persona] || "";
          const icon = PERSONA_ICONS[persona] || "👤";
          const shippedCount = items.filter(i => i.status === "shipped").length;
          const readyCount = items.filter(i => i.status !== "shipped").length;

          return (
            <section
              key={persona}
              ref={(el) => { sectionRefs.current[persona] = el; }}
              className="mb-20 scroll-mt-20"
            >
              {/* Persona header */}
              <div className="flex items-start gap-4 mb-8">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${pc.gradient} flex items-center justify-center text-xl flex-shrink-0 shadow-lg`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl font-bold text-white">{persona}&apos;s Journey</h2>
                    <span className={`text-[10px] font-bold tracking-[1.5px] uppercase ${pc.text} ${pc.badge} px-2.5 py-1 rounded-full`}>
                      {role}
                    </span>
                  </div>
                  <p className="text-sm text-white/40 mt-1">
                    {shippedCount > 0 && <span className="text-emerald-400">{shippedCount} delivered</span>}
                    {shippedCount > 0 && readyCount > 0 && <span> · </span>}
                    {readyCount > 0 && <span>{readyCount} ready to build</span>}
                  </p>
                </div>
              </div>

              {/* Journey timeline */}
              <div className="relative ml-6 pl-8 border-l-2 border-white/[0.06] space-y-4">
                {items.map((item, idx) => (
                  <JourneyNode
                    key={item.id}
                    item={item}
                    pc={pc}
                    isFirst={idx === 0}
                    isLast={idx === items.length - 1}
                    isExpanded={expandedItem === item.id}
                    isAdmin={isAdmin}
                    commentingOn={commentingOn}
                    commentText={commentText}
                    commentAuthor={commentAuthor}
                    onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    onReact={(r) => react(item.id, r)}
                    onSelect={() => updateStatus(item.id, "selected")}
                    onDeselect={() => updateStatus(item.id, "available")}
                    onSetStatus={(s) => updateStatus(item.id, s)}
                    onStartComment={() => setCommentingOn(item.id)}
                    onCancelComment={() => { setCommentingOn(null); setCommentText(""); }}
                    onSubmitComment={() => comment(item.id)}
                    setCommentText={setCommentText}
                    setCommentAuthor={setCommentAuthor}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {/* ─── SELECTION BAR ─── */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 animate-slideUp">
          <div className="bg-white text-slate-900 shadow-[0_-16px_64px_rgba(0,0,0,0.5)]">
            <div className="max-w-7xl mx-auto px-6 sm:px-10 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg">{selected.length}</div>
                <div>
                  <div className="text-sm text-slate-500">{selected.length} improvement{selected.length > 1 ? "s" : ""} selected</div>
                  <div className="text-2xl font-bold">${selectedTotal.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button onClick={() => selected.forEach(i => updateStatus(i.id, "available"))} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700">Clear</button>
                <button className="flex-1 sm:flex-initial px-8 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 shadow-lg">
                  Request Scope Documents
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/20">
          <span>ANC Sports · Platform Strategy Report</span>
          <span>Prepared May 2026 · Pricing valid 30 days · {catalog.items.length} recommendations</span>
        </div>
      </footer>

      {selected.length > 0 && <div className="h-24" />}

      <style jsx global>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}


/* ─────────────────── Components ─────────────────── */

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400", rose: "text-rose-400", violet: "text-violet-400", blue: "text-blue-400",
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <div className={`text-2xl sm:text-3xl font-bold tracking-tight ${accent ? colors[accent] : "text-white"}`}>{value}</div>
      <div className="text-[11px] text-white/30 mt-1 tracking-wide">{label}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, icon, accent }: {
  active: boolean; onClick: () => void; label: string; count?: number; icon?: string; accent?: string;
}) {
  const accentColors: Record<string, string> = {
    rose: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border whitespace-nowrap ${
        active
          ? accent && accentColors[accent]
            ? accentColors[accent]
            : "bg-white text-slate-900 border-white/20"
          : "bg-transparent text-white/40 border-white/[0.06] hover:border-white/10 hover:text-white/60"
      }`}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
      {count !== undefined && <span className="ml-1.5 text-[10px] opacity-60">({count})</span>}
    </button>
  );
}

function JourneyNode({
  item, pc, isFirst, isLast, isExpanded, isAdmin,
  commentingOn, commentText, commentAuthor,
  onToggle, onReact, onSelect, onDeselect, onSetStatus,
  onStartComment, onCancelComment, onSubmitComment,
  setCommentText, setCommentAuthor,
}: {
  item: Item;
  pc: { bg: string; text: string; border: string; badge: string; ring: string; gradient: string };
  isFirst: boolean; isLast: boolean;
  isExpanded: boolean; isAdmin: boolean;
  commentingOn: string | null; commentText: string; commentAuthor: string;
  onToggle: () => void;
  onReact: (r: string) => void;
  onSelect: () => void; onDeselect: () => void;
  onSetStatus: (s: string) => void;
  onStartComment: () => void; onCancelComment: () => void; onSubmitComment: () => void;
  setCommentText: (t: string) => void; setCommentAuthor: (a: string) => void;
}) {
  const isShipped = item.status === "shipped";
  const isSelected = item.status === "selected";
  const effectivePrice = item.price * (1 - item.discount / 100);
  const evidence = item.dataEvidence?.split("·").map(s => s.trim()).filter(Boolean) || [];
  const scoreColor = item.aiScore >= 90 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
    item.aiScore >= 80 ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
    "text-white/40 bg-white/5 border-white/10";

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className={`absolute -left-[2.3rem] top-5 w-4 h-4 rounded-full border-2 ${
        isShipped ? "bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/30" :
        isSelected ? "bg-blue-500 border-blue-400 shadow-lg shadow-blue-500/30" :
        "bg-white/10 border-white/20"
      }`} />

      {/* Card */}
      <div
        className={`rounded-2xl border transition-all duration-200 ${
          isSelected ? "border-blue-500/30 bg-blue-500/[0.04] ring-1 ring-blue-500/20" :
          isShipped ? "border-emerald-500/20 bg-emerald-500/[0.03]" :
          "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
        }`}
      >
        {/* Header row */}
        <div className="flex items-start gap-3 p-5 cursor-pointer select-none" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {/* AI Score */}
              <span className={`text-[10px] font-bold tracking-wider border px-2 py-0.5 rounded-md ${scoreColor}`}>
                {item.aiScore}/100
              </span>

              {isShipped && (
                <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  Delivered
                </span>
              )}
              {isSelected && (
                <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                  Selected
                </span>
              )}
              {item.impactLevel === "high" && !isShipped && (
                <span className="text-[10px] font-bold tracking-[1px] uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                  High Impact
                </span>
              )}
              {item.category && (
                <span className="text-[10px] font-medium text-white/25 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">
                  {item.category}
                </span>
              )}
            </div>

            <h3 className={`text-[15px] font-semibold leading-snug ${isShipped ? "text-white/50" : "text-white/90"}`}>
              {item.title}
            </h3>

            {!isExpanded && (
              <p className="text-[13px] text-white/30 line-clamp-1 mt-1">{item.description}</p>
            )}
          </div>

          {/* Right side: price + reactions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {item.tier === "retainer" ? (
              <span className="text-sm font-semibold text-emerald-400">{isShipped ? "Done" : "Included"}</span>
            ) : (
              <div className="text-right">
                <div className="text-lg font-bold text-white/80">${effectivePrice.toLocaleString()}</div>
                {item.estimatedWeeks && item.estimatedWeeks > 0 && (
                  <div className="text-[10px] text-white/25">~{item.estimatedWeeks}w</div>
                )}
              </div>
            )}

            <svg className={`w-4 h-4 text-white/20 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* ─── EXPANDED PANEL ─── */}
        {isExpanded && (
          <div className="border-t border-white/[0.06] p-5 space-y-5">

            {/* Why */}
            <p className="text-sm text-white/50 leading-relaxed">{item.description}</p>

            {/* AI Analysis */}
            {item.aiReasoning && (
              <div className="rounded-xl bg-gradient-to-br from-violet-500/[0.06] to-blue-500/[0.04] border border-violet-500/10 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center">
                    <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  </div>
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-violet-400">Platform Analysis</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{item.aiReasoning}</p>
              </div>
            )}

            {/* Data chips */}
            {evidence.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evidence.map((point, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/40 bg-white/[0.04] border border-white/[0.06] px-3 py-1.5 rounded-lg">
                    <span className="w-1 h-1 bg-blue-400 rounded-full flex-shrink-0" />
                    {point}
                  </span>
                ))}
              </div>
            )}

            {/* Cause → Effect chain (if endGoal exists) */}
            {item.endGoal && item.department && (
              <div className="flex items-center gap-2 text-[11px] text-white/30 flex-wrap">
                <span className="bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-md">{item.department}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                <span className="bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-md">{item.title.length > 30 ? item.title.slice(0, 30) + "…" : item.title}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                <span className={`${pc.badge} ${pc.text} border ${pc.border} px-2.5 py-1 rounded-md font-semibold`}>{item.endGoal}</span>
              </div>
            )}

            {/* Reactions + comments */}
            <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04] flex-wrap">
              <button onClick={(e) => { e.stopPropagation(); onReact("like"); }} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-emerald-400 transition-colors bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 hover:border-emerald-500/20">
                <span>👍</span> <span>{item.likes}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onReact("dislike"); }} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-rose-400 transition-colors bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 hover:border-rose-500/20">
                <span>👎</span> <span>{item.dislikes}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onStartComment(); }} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-blue-400 transition-colors bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 hover:border-blue-500/20">
                <span>💬</span> <span>{item.comments.length || ""}</span>
                <span>Comment</span>
              </button>

              <div className="flex-1" />

              {!isAdmin && item.status === "available" && item.tier !== "retainer" && (
                <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="px-5 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-white/90 transition-all shadow-lg">
                  I want this
                </button>
              )}
              {!isAdmin && isSelected && (
                <button onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-4 py-2 border border-white/20 text-white/60 text-xs font-medium rounded-lg hover:bg-white/5">
                  Remove
                </button>
              )}

              {isAdmin && (
                <div className="flex gap-1.5">
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("shipped"); }} className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-md hover:bg-emerald-500/20">Ship</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("selected"); }} className="px-2.5 py-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 rounded-md hover:bg-blue-500/20">Select</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("available"); }} className="px-2.5 py-1.5 text-[10px] font-bold text-white/40 bg-white/5 rounded-md hover:bg-white/10">Reset</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("declined"); }} className="px-2.5 py-1.5 text-[10px] font-bold text-rose-400 bg-rose-500/10 rounded-md hover:bg-rose-500/20">Decline</button>
                </div>
              )}
            </div>

            {/* Comment form */}
            {commentingOn === item.id && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-3" onClick={e => e.stopPropagation()}>
                <input value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)} placeholder="Your name" className="w-full text-sm bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20" />
                <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Share your thoughts..." rows={2} className="w-full text-sm bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20" />
                <div className="flex gap-2">
                  <button onClick={onSubmitComment} className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-white/90">Post</button>
                  <button onClick={onCancelComment} className="px-3 py-2 text-xs text-white/40 hover:text-white/60">Cancel</button>
                </div>
              </div>
            )}

            {/* Existing comments */}
            {item.comments.length > 0 && (
              <div className="space-y-2">
                {item.comments.map(c => (
                  <div key={c.id} className="flex items-start gap-3 text-xs">
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 flex-shrink-0 mt-0.5">
                      {c.author[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <span className="font-semibold text-white/50">{c.author}</span>
                      <span className="text-white/20 ml-2">{new Date(c.createdAt).toLocaleDateString()}</span>
                      <p className="text-white/35 mt-0.5">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
