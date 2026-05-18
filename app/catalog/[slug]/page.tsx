"use client";

import { useEffect, useState, useCallback } from "react";
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
}

interface CatalogData {
  id: string;
  slug: string;
  clientName: string;
  title: string;
  subtitle: string | null;
  items: CatalogItemData[];
}

const TIER_CONFIG: Record<string, { label: string; tag: string; accent: string; accentBg: string; icon: string }> = {
  retainer: { label: "Included — No Additional Cost", tag: "RETAINER", accent: "text-emerald-600", accentBg: "bg-emerald-50 border-emerald-200", icon: "✓" },
  small: { label: "Quick Wins", tag: "$500 TIER", accent: "text-blue-600", accentBg: "bg-blue-50 border-blue-200", icon: "→" },
  medium: { label: "Workflow Upgrades", tag: "$1K–$3.5K", accent: "text-amber-600", accentBg: "bg-amber-50 border-amber-200", icon: "⚡" },
  large: { label: "New Capabilities", tag: "$2.5K–$3.5K", accent: "text-slate-800", accentBg: "bg-slate-50 border-slate-200", icon: "◆" },
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

  const fetchCatalog = useCallback(async () => {
    const res = await fetch(`/api/catalog/${slug}`);
    if (res.ok) setCatalog(await res.json());
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const api = async (body: Record<string, any>) => {
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchCatalog();
  };

  const updateItem = (id: string, fields: Record<string, any>) => api({ action: "updateItem", itemId: id, ...fields });
  const deleteItem = (id: string) => api({ action: "deleteItem", itemId: id });
  const addItem = async (tier: string) => {
    await api({ action: "addItem", tier, ...newItem });
    setNewItem({ title: "", description: "", price: 0 });
    setAddingTier(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#fafbfe] flex items-center justify-center">
      <div className="animate-pulse text-slate-400 text-sm tracking-wide">Loading roadmap...</div>
    </div>
  );

  if (!catalog) return (
    <div className="min-h-screen bg-[#fafbfe] flex items-center justify-center">
      <div className="text-red-500 text-sm">Catalog not found</div>
    </div>
  );

  const tiers = ["retainer", "small", "medium", "large"];
  const grouped = tiers.map(t => ({ tier: t, items: catalog.items.filter(i => i.tier === t).sort((a, b) => a.position - b.position) })).filter(g => g.items.length > 0 || isAdmin);

  const shipped = catalog.items.filter(i => i.status === "shipped");
  const selected = catalog.items.filter(i => i.status === "selected");
  const available = catalog.items.filter(i => i.status === "available" && i.tier !== "retainer");
  const selectedTotal = selected.reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);
  const availableTotal = available.reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);
  const allPaidTotal = catalog.items.filter(i => i.tier !== "retainer").reduce((s, i) => s + i.price * (1 - i.discount / 100), 0);

  return (
    <div className="min-h-screen bg-[#fafbfe]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Floating admin badge */}
      {isAdmin && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-[10px] font-bold tracking-[2px] uppercase px-4 py-2 rounded-full shadow-lg">
          Admin Mode
        </div>
      )}

      {/* Hero — full bleed */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/8 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-8 pt-16 pb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <span className="text-[10px] font-semibold tracking-[3px] uppercase text-blue-300/80">Platform Roadmap</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-6 max-w-2xl">
            {catalog.title}
          </h1>
          {catalog.subtitle && (
            <p className="text-lg text-slate-300 max-w-xl leading-relaxed mb-12">
              {catalog.subtitle}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Shipped" value={`${shipped.length}`} sub="already live" accent="emerald" />
            <StatCard label="Available" value={`${available.length + selected.length}`} sub="improvements" accent="blue" />
            <StatCard label="Selected" value={selected.length > 0 ? `$${selectedTotal.toLocaleString()}` : "—"} sub={selected.length > 0 ? `${selected.length} items` : "none yet"} accent="amber" />
            <StatCard label="Full Catalog" value={`$${allPaidTotal.toLocaleString()}`} sub="if built together" accent="slate" />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-8 py-16">

        {/* Tier sections */}
        {grouped.map(({ tier, items }) => {
          const cfg = TIER_CONFIG[tier];
          return (
            <div key={tier} className="mb-16">
              {/* Tier header */}
              <div className="flex items-center gap-4 mb-8">
                <span className={`text-[10px] font-bold tracking-[2.5px] uppercase ${cfg.accent}`}>{cfg.tag}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{cfg.label}</h2>

              {/* Items */}
              <div className="space-y-3 mt-6">
                {items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    tier={tier}
                    cfg={cfg}
                    isAdmin={isAdmin}
                    isExpanded={expandedItem === item.id}
                    isEditing={editingItem === item.id}
                    editForm={editForm}
                    onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                    onSelect={() => updateItem(item.id, { status: "selected" })}
                    onDeselect={() => updateItem(item.id, { status: "available" })}
                    onStartEdit={() => { setEditingItem(item.id); setEditForm(item); }}
                    onCancelEdit={() => setEditingItem(null)}
                    onSaveEdit={(f) => { updateItem(item.id, f); setEditingItem(null); }}
                    onSetStatus={(s) => updateItem(item.id, { status: s })}
                    onDelete={() => { if (confirm("Delete?")) deleteItem(item.id); }}
                    setEditForm={setEditForm}
                  />
                ))}
              </div>

              {/* Admin: add item */}
              {isAdmin && (
                <div className="mt-4">
                  {addingTier === tier ? (
                    <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-white">
                      <input value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} placeholder="Item title" className="w-full text-sm font-semibold border border-slate-200 rounded-lg px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      <textarea value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} placeholder="Why this matters..." rows={2} className="w-full text-sm border border-slate-200 rounded-lg px-4 py-2.5 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      <div className="flex gap-2">
                        <input type="number" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: +e.target.value })} placeholder="Price" className="w-28 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                        <button onClick={() => addItem(tier)} className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">Add</button>
                        <button onClick={() => setAddingTier(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTier(tier)} className="w-full py-3 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">
                      + Add item
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom CTA */}
        {selected.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] z-40">
            <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-500">{selected.length} item{selected.length > 1 ? "s" : ""} selected</span>
                <span className="text-2xl font-bold text-slate-900 ml-4">${selectedTotal.toLocaleString()}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => selected.forEach(i => updateItem(i.id, { status: "available" }))} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                  Clear all
                </button>
                <button className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                  Request scope docs →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-8 py-8 flex items-center justify-between text-xs text-slate-400">
          <span>ANC Sports · Platform Roadmap</span>
          <span>Prepared May 2026</span>
        </div>
      </div>

      {selected.length > 0 && <div className="h-20" />}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-500/20 bg-emerald-500/5",
    blue: "border-blue-500/20 bg-blue-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
    slate: "border-slate-500/20 bg-white/5",
  };
  return (
    <div className={`rounded-xl border ${colors[accent] || colors.slate} p-5`}>
      <div className="text-[10px] font-semibold tracking-[2px] uppercase text-slate-400 mb-2">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

function ItemCard({
  item, tier, cfg, isAdmin, isExpanded, isEditing, editForm,
  onToggle, onSelect, onDeselect, onStartEdit, onCancelEdit, onSaveEdit, onSetStatus, onDelete, setEditForm,
}: {
  item: CatalogItemData;
  tier: string;
  cfg: { label: string; tag: string; accent: string; accentBg: string; icon: string };
  isAdmin: boolean;
  isExpanded: boolean;
  isEditing: boolean;
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

  if (isEditing) {
    return (
      <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
        <input value={editForm.title || ""} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full text-sm font-semibold border border-slate-200 rounded-lg px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        <textarea value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="w-full text-sm border border-slate-200 rounded-lg px-4 py-2.5 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1 text-sm text-slate-500">$</div>
          <input type="number" value={editForm.price || 0} onChange={e => setEditForm({ ...editForm, price: +e.target.value })} className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <input type="number" value={editForm.discount || 0} onChange={e => setEditForm({ ...editForm, discount: +e.target.value })} placeholder="% off" className="w-20 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <select value={editForm.tier || tier} onChange={e => setEditForm({ ...editForm, tier: e.target.value })} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none">
            <option value="retainer">Retainer</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <div className="flex-1" />
          <button onClick={() => onSaveEdit(editForm)} className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">Save</button>
          <button onClick={onCancelEdit} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group bg-white border rounded-xl transition-all duration-200 hover:shadow-md ${
      isSelected ? "border-blue-300 shadow-md shadow-blue-500/10 ring-1 ring-blue-200" :
      isShipped ? "border-emerald-200 bg-emerald-50/30" :
      isDeclined ? "border-slate-200 opacity-50" :
      "border-slate-200 hover:border-slate-300"
    }`}>
      <div className="flex items-start gap-4 p-5 cursor-pointer" onClick={onToggle}>
        {/* Status indicator */}
        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${
          isShipped ? "bg-emerald-100 text-emerald-600" :
          isSelected ? "bg-blue-100 text-blue-600" :
          "bg-slate-100 text-slate-400"
        }`}>
          {isShipped ? "✓" : isSelected ? "★" : cfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{item.title}</h3>
            {isShipped && <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">Live</span>}
            {isSelected && <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-blue-600 bg-blue-100 px-2 py-0.5 rounded">Selected</span>}
          </div>
          {!isExpanded && (
            <p className="text-sm text-slate-500 line-clamp-1">{item.description}</p>
          )}
        </div>

        {/* Price */}
        <div className="text-right flex-shrink-0 ml-4">
          {tier === "retainer" ? (
            <span className="text-sm font-semibold text-emerald-600">{isShipped ? "Done" : "Included"}</span>
          ) : (
            <>
              <div className="text-xl font-bold text-slate-900">${effectivePrice.toLocaleString()}</div>
              {item.discount > 0 && (
                <div className="text-xs text-emerald-600 font-medium">{item.discount}% off</div>
              )}
            </>
          )}
        </div>

        {/* Expand chevron */}
        <svg className={`w-4 h-4 text-slate-300 flex-shrink-0 mt-2 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <div className="pt-4">
            <div className="text-sm text-slate-600 leading-relaxed mb-4">
              <span className="font-semibold text-slate-800">Why: </span>{item.description}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isAdmin && item.status === "available" && tier !== "retainer" && (
                <button onClick={(e) => { e.stopPropagation(); onSelect(); }} className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm">
                  I want this
                </button>
              )}
              {!isAdmin && isSelected && (
                <button onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-5 py-2 border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                  Remove selection
                </button>
              )}

              {isAdmin && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onStartEdit(); }} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("shipped"); }} className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">Ship</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("selected"); }} className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">Select</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("available"); }} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">Reset</button>
                  <button onClick={(e) => { e.stopPropagation(); onSetStatus("declined"); }} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Decline</button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors">Delete</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
