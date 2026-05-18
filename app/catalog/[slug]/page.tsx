"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface CatalogItemData {
  id: string;
  title: string;
  description: string;
  tier: string;
  price: number;
  discount: number;
  position: number;
  status: string;
  aiReasoning: string | null;
  dataEvidence: string | null;
  impactLevel: string | null;
  estimatedWeeks: number | null;
  category: string | null;
}

interface CatalogData {
  id: string;
  slug: string;
  clientName: string;
  title: string;
  subtitle: string | null;
  items: CatalogItemData[];
}

const TIER_META: Record<string, { label: string; tag: string; color: string; bgGradient: string; border: string; ring: string; icon: React.ReactNode; desc: string }> = {
  retainer: {
    label: "Covered Under Retainer",
    tag: "INCLUDED",
    color: "text-emerald-700",
    bgGradient: "from-emerald-50 to-emerald-50/30",
    border: "border-emerald-200",
    ring: "ring-emerald-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>,
    desc: "These improvements are included in your current service agreement at no additional cost.",
  },
  small: {
    label: "Quick Wins",
    tag: "$500",
    color: "text-blue-700",
    bgGradient: "from-blue-50 to-blue-50/30",
    border: "border-blue-200",
    ring: "ring-blue-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>,
    desc: "Targeted fixes that ship within a week. High impact relative to investment.",
  },
  medium: {
    label: "Workflow Upgrades",
    tag: "$1K – $3.5K",
    color: "text-amber-800",
    bgGradient: "from-amber-50 to-amber-50/30",
    border: "border-amber-200",
    ring: "ring-amber-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    desc: "Process improvements that eliminate recurring manual work and reduce turnaround times.",
  },
  large: {
    label: "New Capabilities",
    tag: "$2.5K – $3.5K",
    color: "text-violet-800",
    bgGradient: "from-violet-50 to-violet-50/30",
    border: "border-violet-200",
    ring: "ring-violet-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    desc: "Platform-level features that transform how your team works — new modules, AI automation, analytics.",
  },
};

const IMPACT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "High Impact", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  medium: { label: "Medium Impact", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  low: { label: "Moderate", color: "text-slate-600", bg: "bg-slate-50 border-slate-200" },
};

export default function CatalogPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const isAdmin = searchParams.get("admin") === "1";

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogItemData>>({});
  const [addingTier, setAddingTier] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ title: "", description: "", price: 0 });
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchCatalog = useCallback(async () => {
    const res = await fetch(`/api/catalog/${slug}`);
    if (res.ok) setCatalog(await res.json());
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const api = async (body: Record<string, unknown>) => {
    setAnimatingId(body.itemId as string || null);
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await fetchCatalog();
    setTimeout(() => setAnimatingId(null), 300);
  };

  const updateItem = (id: string, fields: Record<string, unknown>) => api({ action: "updateItem", itemId: id, ...fields });
  const deleteItem = (id: string) => api({ action: "deleteItem", itemId: id });
  const addItem = async (tier: string) => {
    await api({ action: "addItem", tier, ...newItem });
    setNewItem({ title: "", description: "", price: 0 });
    setAddingTier(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        <p className="text-sm text-slate-400 tracking-wide">Loading platform intelligence...</p>
      </div>
    </div>
  );

  if (!catalog) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 opacity-20">∅</div>
        <p className="text-slate-500 text-sm">This catalog doesn&apos;t exist yet.</p>
      </div>
    </div>
  );

  const tiers = ["retainer", "small", "medium", "large"];
  const grouped = tiers.map(t => ({
    tier: t,
    items: catalog.items.filter(i => i.tier === t).sort((a, b) => a.position - b.position),
  })).filter(g => g.items.length > 0 || isAdmin);

  const shipped = catalog.items.filter(i => i.status === "shipped");
  const selected = catalog.items.filter(i => i.status === "selected");
  const available = catalog.items.filter(i => i.status === "available" && i.tier !== "retainer");
  const selectedTotal = selected.reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);
  const allPaidItems = catalog.items.filter(i => i.tier !== "retainer");
  const allPaidTotal = allPaidItems.reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);
  const categories = [...new Set(catalog.items.map(i => i.category).filter(Boolean))];
  const highImpactCount = catalog.items.filter(i => i.impactLevel === "high" && i.status !== "shipped").length;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {isAdmin && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-slate-900 text-white text-[10px] font-bold tracking-[2px] uppercase px-4 py-2 rounded-full shadow-2xl">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          Admin
        </div>
      )}

      {/* ─── HERO ─── */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-500/[0.04] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-violet-500/[0.04] rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4" />

        <div className="relative max-w-6xl mx-auto px-6 sm:px-10 pt-12 sm:pt-20 pb-12 sm:pb-16">
          {/* Top badge */}
          <div className="flex items-center gap-3 mb-10">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[3px] uppercase text-blue-400/80">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <span>ANC Sports · Platform Intelligence</span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold text-white tracking-tight leading-[1.15] mb-4 max-w-3xl">
            {catalog.title}
          </h1>
          {catalog.subtitle && (
            <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed mb-12">
              {catalog.subtitle}
            </p>
          )}

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              value={shipped.length.toString()}
              label="Delivered"
              detail="already live on your platform"
              accent="emerald"
            />
            <MetricCard
              value={highImpactCount.toString()}
              label="High-Impact Ready"
              detail="recommendations awaiting approval"
              accent="rose"
            />
            <MetricCard
              value={categories.length.toString()}
              label="Categories"
              detail={categories.slice(0, 2).join(", ")}
              accent="blue"
            />
            <MetricCard
              value={`$${Math.round(allPaidTotal / 1000)}K`}
              label="Full Investment"
              detail={`${allPaidItems.length} improvements if all built`}
              accent="violet"
            />
          </div>
        </div>
      </header>

      {/* ─── NAV BAR (jump to tier) ─── */}
      <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur-lg border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 flex items-center gap-1 overflow-x-auto py-3 scrollbar-none">
          {grouped.map(({ tier, items }) => {
            const cfg = TIER_META[tier];
            return (
              <button
                key={tier}
                onClick={() => sectionRefs.current[tier]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors hover:bg-slate-100 text-slate-600"
              >
                <span className={cfg.color}>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span className="text-[10px] text-slate-400 font-normal">({items.length})</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-6xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
        {grouped.map(({ tier, items }) => {
          const cfg = TIER_META[tier];
          return (
            <section
              key={tier}
              ref={(el) => { sectionRefs.current[tier] = el; }}
              className="mb-20 scroll-mt-16"
            >
              {/* Tier header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color} bg-gradient-to-br ${cfg.bgGradient} border ${cfg.border}`}>
                    {cfg.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-slate-900">{cfg.label}</h2>
                      <span className={`text-[10px] font-bold tracking-[1.5px] uppercase ${cfg.color} bg-gradient-to-r ${cfg.bgGradient} border ${cfg.border} px-2.5 py-0.5 rounded-full`}>
                        {cfg.tag}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-500 max-w-2xl ml-11">{cfg.desc}</p>
              </div>

              {/* Items */}
              <div className="space-y-4 ml-0 sm:ml-11">
                {items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    tier={tier}
                    cfg={cfg}
                    isAdmin={isAdmin}
                    isExpanded={expandedItem === item.id}
                    isEditing={editingItem === item.id}
                    isAnimating={animatingId === item.id}
                    editForm={editForm}
                    onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    onSelect={() => updateItem(item.id, { status: "selected" })}
                    onDeselect={() => updateItem(item.id, { status: "available" })}
                    onStartEdit={() => { setEditingItem(item.id); setEditForm(item); }}
                    onCancelEdit={() => setEditingItem(null)}
                    onSaveEdit={(f) => { updateItem(item.id, f); setEditingItem(null); }}
                    onSetStatus={(s) => updateItem(item.id, { status: s })}
                    onDelete={() => { if (confirm("Delete this item?")) deleteItem(item.id); }}
                    setEditForm={setEditForm}
                  />
                ))}
              </div>

              {/* Admin: add item */}
              {isAdmin && (
                <div className="mt-4 ml-0 sm:ml-11">
                  {addingTier === tier ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                      <input value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} placeholder="Item title" className="w-full text-sm font-semibold bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
                      <textarea value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} placeholder="Why this matters for the team..." rows={2} className="w-full text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
                      <div className="flex gap-2 items-center">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                          <input type="number" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: +e.target.value })} className="w-28 text-sm bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                        </div>
                        <button onClick={() => addItem(tier)} className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-sm">Add Item</button>
                        <button onClick={() => setAddingTier(null)} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTier(tier)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-slate-50/50 transition-all">
                      + Add improvement
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {/* ─── FLOATING SELECTION BAR ─── */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 animate-slideUp">
          <div className="bg-slate-900 text-white shadow-[0_-16px_48px_rgba(0,0,0,0.2)]">
            <div className="max-w-6xl mx-auto px-6 sm:px-10 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 text-white font-bold text-lg">
                  {selected.length}
                </div>
                <div>
                  <div className="text-sm text-slate-300">Selected improvements</div>
                  <div className="text-2xl font-bold tracking-tight">${selectedTotal.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => selected.forEach(i => updateItem(i.id, { status: "available" }))}
                  className="px-4 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
                <button className="flex-1 sm:flex-initial px-8 py-3 bg-white text-slate-900 text-sm font-bold rounded-xl hover:bg-slate-100 transition-all shadow-lg">
                  Request Scope Documents
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <span>ANC Sports · Platform Intelligence Report</span>
          </div>
          <span>Prepared May 2026 · Pricing valid 30 days</span>
        </div>
      </footer>

      {selected.length > 0 && <div className="h-24" />}

      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}


function MetricCard({ value, label, detail, accent }: { value: string; label: string; detail: string; accent: string }) {
  const accents: Record<string, { border: string; value: string }> = {
    emerald: { border: "border-emerald-500/20", value: "text-emerald-400" },
    rose: { border: "border-rose-500/20", value: "text-rose-400" },
    blue: { border: "border-blue-500/20", value: "text-blue-400" },
    violet: { border: "border-violet-500/20", value: "text-violet-400" },
  };
  const a = accents[accent] || accents.blue;

  return (
    <div className={`rounded-2xl border ${a.border} bg-white/[0.04] backdrop-blur-sm p-5 sm:p-6`}>
      <div className={`text-2xl sm:text-3xl font-bold ${a.value} mb-1 tracking-tight`}>{value}</div>
      <div className="text-xs font-semibold text-white/80 tracking-wide uppercase mb-1">{label}</div>
      <div className="text-[11px] text-slate-500 leading-snug">{detail}</div>
    </div>
  );
}


function ItemCard({
  item, tier, cfg, isAdmin, isExpanded, isEditing, isAnimating, editForm,
  onToggle, onSelect, onDeselect, onStartEdit, onCancelEdit, onSaveEdit, onSetStatus, onDelete, setEditForm,
}: {
  item: CatalogItemData;
  tier: string;
  cfg: typeof TIER_META[string];
  isAdmin: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isAnimating: boolean;
  editForm: Partial<CatalogItemData>;
  onToggle: () => void;
  onSelect: () => void;
  onDeselect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (f: Partial<CatalogItemData>) => void;
  onSetStatus: (s: string) => void;
  onDelete: () => void;
  setEditForm: (f: Partial<CatalogItemData>) => void;
}) {
  const isShipped = item.status === "shipped";
  const isSelected = item.status === "selected";
  const isDeclined = item.status === "declined";
  const effectivePrice = item.price * (1 - item.discount / 100);
  const impact = IMPACT_CONFIG[item.impactLevel || "medium"];
  const evidence = item.dataEvidence?.split("·").map(s => s.trim()).filter(Boolean) || [];

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-lg shadow-blue-500/5">
        <input value={editForm.title || ""} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        <textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        <textarea value={editForm.aiReasoning || ""} onChange={e => setEditForm({ ...editForm, aiReasoning: e.target.value })} rows={3} placeholder="AI reasoning / analysis..." className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        <input value={editForm.dataEvidence || ""} onChange={e => setEditForm({ ...editForm, dataEvidence: e.target.value })} placeholder="Data points separated by ·" className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input type="number" value={editForm.price || 0} onChange={e => setEditForm({ ...editForm, price: +e.target.value })} className="w-28 text-sm bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <input type="number" value={editForm.discount || 0} onChange={e => setEditForm({ ...editForm, discount: +e.target.value })} placeholder="% off" className="w-20 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <select value={editForm.tier || tier} onChange={e => setEditForm({ ...editForm, tier: e.target.value })} className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none">
            <option value="retainer">Retainer</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
          </select>
          <select value={editForm.impactLevel || "medium"} onChange={e => setEditForm({ ...editForm, impactLevel: e.target.value })} className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none">
            <option value="high">High Impact</option><option value="medium">Medium Impact</option><option value="low">Moderate</option>
          </select>
          <input type="number" value={editForm.estimatedWeeks || 2} onChange={e => setEditForm({ ...editForm, estimatedWeeks: +e.target.value })} placeholder="Weeks" className="w-20 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none" />
          <div className="flex-1" />
          <button onClick={() => onSaveEdit(editForm)} className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all">Save</button>
          <button onClick={onCancelEdit} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group rounded-2xl border transition-all duration-300 ${
      isAnimating ? "scale-[0.99] opacity-80" :
      isSelected ? `border-blue-300 bg-blue-50/30 shadow-lg shadow-blue-500/10 ring-1 ${cfg.ring}` :
      isShipped ? "border-emerald-200 bg-emerald-50/20" :
      isDeclined ? "border-slate-200 opacity-40 bg-slate-50/50" :
      "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
    }`}>

      {/* Main row */}
      <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 cursor-pointer select-none" onClick={onToggle}>
        {/* Status icon */}
        <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          isShipped ? "bg-emerald-100 text-emerald-600" :
          isSelected ? "bg-blue-100 text-blue-600" :
          `bg-gradient-to-br ${cfg.bgGradient} ${cfg.color} border ${cfg.border}`
        }`}>
          {isShipped ? (
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          ) : isSelected ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          ) : cfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className={`text-[15px] font-semibold leading-snug ${isDeclined ? "text-slate-400 line-through" : "text-slate-900"}`}>
              {item.title}
            </h3>
            {isShipped && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Live
              </span>
            )}
            {isSelected && (
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                Selected
              </span>
            )}
            {item.impactLevel === "high" && !isShipped && (
              <span className={`text-[10px] font-bold tracking-[1px] uppercase ${impact.color} ${impact.bg} border px-2 py-0.5 rounded-full`}>
                {impact.label}
              </span>
            )}
          </div>
          {!isExpanded && (
            <p className="text-[13px] text-slate-500 line-clamp-1 leading-relaxed">{item.description}</p>
          )}
          {!isExpanded && item.category && (
            <span className="inline-block mt-1.5 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{item.category}</span>
          )}
        </div>

        {/* Price + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            {tier === "retainer" ? (
              <span className={`text-sm font-semibold ${isShipped ? "text-emerald-600" : "text-emerald-600"}`}>
                {isShipped ? "Delivered" : "Included"}
              </span>
            ) : (
              <>
                <div className="text-lg sm:text-xl font-bold text-slate-900">${effectivePrice.toLocaleString()}</div>
                {item.discount > 0 && (
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-xs text-slate-400 line-through">${item.price.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{item.discount}% off</span>
                  </div>
                )}
              </>
            )}
          </div>
          <svg className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ─── EXPANDED INTELLIGENCE PANEL ─── */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          <div className="p-5 sm:p-6 space-y-5">

            {/* Description */}
            <div>
              <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-slate-400 mb-2">What &amp; Why</div>
              <p className="text-sm text-slate-700 leading-relaxed">{item.description}</p>
            </div>

            {/* AI Reasoning */}
            {item.aiReasoning && (
              <div className="bg-gradient-to-br from-slate-50 to-slate-50/50 rounded-xl p-4 sm:p-5 border border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-md bg-violet-100 flex items-center justify-center">
                    <svg className="w-3 h-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  </div>
                  <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-violet-700">Platform Analysis</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{item.aiReasoning}</p>
              </div>
            )}

            {/* Data Evidence chips */}
            {evidence.length > 0 && (
              <div>
                <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-slate-400 mb-2.5">Key Metrics</div>
                <div className="flex flex-wrap gap-2">
                  {evidence.map((point, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />
                      {point}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Meta row: timeline, impact, category */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {item.estimatedWeeks !== null && item.estimatedWeeks > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>~{item.estimatedWeeks} {item.estimatedWeeks === 1 ? "week" : "weeks"} to deliver</span>
                </div>
              )}
              {item.category && (
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">{item.category}</span>
              )}
              {item.impactLevel && (
                <span className={`text-[10px] font-bold tracking-[1px] uppercase ${impact.color} ${impact.bg} border px-2.5 py-1 rounded-md`}>
                  {impact.label}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
              {!isAdmin && item.status === "available" && tier !== "retainer" && (
                <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-sm hover:shadow-md">
                  Add to Selection
                </button>
              )}
              {!isAdmin && isSelected && (
                <button onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all">
                  Remove
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onStartEdit(); }} className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("shipped"); }} className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">Ship</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("selected"); }} className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">Select</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("available"); }} className="px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">Reset</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("declined"); }} className="px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Decline</button>
                  <div className="flex-1" />
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="px-3 py-2 text-xs font-medium text-red-400 hover:text-red-600 transition-colors">Delete</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
