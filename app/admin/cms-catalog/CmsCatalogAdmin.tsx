"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Archive, RefreshCw, AlertTriangle } from "lucide-react";

type Category =
  | "SERVER_EQUIPMENT"
  | "SERVER_ADDON"
  | "USER_STATION"
  | "INTERCONNECT"
  | "TRIGGER_HARDWARE"
  | "SCALER"
  | "ROUTER"
  | "KVM"
  | "BROADCAST_DA"
  | "RACK"
  | "TRAINING"
  | "INTEGRATION"
  | "SHIPPING"
  | "LICENSE"
  | "SUPPORT_TIER";

interface CatalogItem {
  id: string;
  sku: string;
  displayName: string;
  category: Category;
  unitCost: string;
  unitPrice: string | null;
  unit: string;
  maxWatt: number | null;
  heatLoadBtu: number | null;
  internalNotes: string | null;
  customerNotes: string | null;
  sortOrder: number;
  isActive: boolean;
}

const CATEGORY_ORDER: Category[] = [
  "SERVER_EQUIPMENT",
  "SERVER_ADDON",
  "USER_STATION",
  "INTERCONNECT",
  "TRIGGER_HARDWARE",
  "SCALER",
  "ROUTER",
  "KVM",
  "BROADCAST_DA",
  "RACK",
  "TRAINING",
  "INTEGRATION",
  "SHIPPING",
  "LICENSE",
  "SUPPORT_TIER",
];

const CATEGORY_LABEL: Record<Category, string> = {
  SERVER_EQUIPMENT: "Server Equipment",
  SERVER_ADDON: "Server Addons",
  USER_STATION: "User Station",
  INTERCONNECT: "Interconnect Hardware",
  TRIGGER_HARDWARE: "Trigger Hardware",
  SCALER: "Scaler",
  ROUTER: "Router Hardware",
  KVM: "KVM Hardware",
  BROADCAST_DA: "Broadcast DA Equipment",
  RACK: "Rack Equipment",
  TRAINING: "Training",
  INTEGRATION: "Integration",
  SHIPPING: "Shipping",
  LICENSE: "License",
  SUPPORT_TIER: "Software Support",
};

export default function CmsCatalogAdmin() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "ALL">("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<CatalogItem>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<CatalogItem>>({
    category: "SERVER_EQUIPMENT",
    unit: "each",
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cms/catalog?active=${!showArchived ? "true" : "false"}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategory !== "ALL" && it.category !== activeCategory) return false;
      if (!q) return true;
      return (
        it.sku.toLowerCase().includes(q) ||
        it.displayName.toLowerCase().includes(q) ||
        (it.internalNotes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, activeCategory]);

  const byCategory = useMemo(() => {
    const out: Partial<Record<Category, CatalogItem[]>> = {};
    for (const it of filtered) {
      (out[it.category] ??= []).push(it);
    }
    return out;
  }, [filtered]);

  async function saveEdit(id: string) {
    const res = await fetch(`/api/cms/catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    if (res.ok) {
      setEditingId(null);
      setEditDraft({});
      fetchItems();
    }
  }

  async function archive(id: string) {
    const ok = window.confirm("Archive this SKU? Historical proposals keep their pinned price.");
    if (!ok) return;
    const res = await fetch(`/api/cms/catalog/${id}`, { method: "DELETE" });
    if (res.ok) fetchItems();
  }

  async function createItem() {
    const res = await fetch("/api/cms/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDraft),
    });
    if (res.ok) {
      setAddOpen(false);
      setNewDraft({ category: "SERVER_EQUIPMENT", unit: "each" });
      fetchItems();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to create SKU");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search SKU, name, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md border border-border bg-background text-sm min-w-[260px]"
        />
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value as Category | "ALL")}
          className="px-3 py-2 rounded-md border border-border bg-background text-sm"
        >
          <option value="ALL">All categories</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          onClick={fetchItems}
          className="px-3 py-2 rounded-md border border-border text-sm flex items-center gap-2 hover:bg-muted"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New SKU
        </button>
      </div>

      {addOpen && (
        <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="SKU" className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.sku ?? ""} onChange={(e) => setNewDraft({ ...newDraft, sku: e.target.value })} />
            <input placeholder="Display name" className="px-2 py-1.5 rounded border border-border bg-background text-sm col-span-2" value={newDraft.displayName ?? ""} onChange={(e) => setNewDraft({ ...newDraft, displayName: e.target.value })} />
            <select className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.category} onChange={(e) => setNewDraft({ ...newDraft, category: e.target.value as Category })}>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <input type="number" placeholder="Unit cost" className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.unitCost ?? ""} onChange={(e) => setNewDraft({ ...newDraft, unitCost: e.target.value })} />
            <input type="number" placeholder="Unit price (sell)" className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.unitPrice ?? ""} onChange={(e) => setNewDraft({ ...newDraft, unitPrice: e.target.value })} />
            <input type="number" placeholder="Max watt" className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.maxWatt ?? ""} onChange={(e) => setNewDraft({ ...newDraft, maxWatt: Number(e.target.value) })} />
            <input placeholder="Unit (each, per_week…)" className="px-2 py-1.5 rounded border border-border bg-background text-sm" value={newDraft.unit ?? "each"} onChange={(e) => setNewDraft({ ...newDraft, unit: e.target.value })} />
            <input placeholder="Internal notes" className="px-2 py-1.5 rounded border border-border bg-background text-sm col-span-3" value={newDraft.internalNotes ?? ""} onChange={(e) => setNewDraft({ ...newDraft, internalNotes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={createItem} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">Create</button>
            <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded border border-border text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading catalog…</div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.filter((c) => byCategory[c]?.length).map((cat) => (
            <section key={cat}>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                {CATEGORY_LABEL[cat]}
                <span className="text-xs font-normal text-muted-foreground">
                  ({byCategory[cat]?.length})
                </span>
              </h2>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Display Name</th>
                      <th className="px-3 py-2 text-right">Unit Cost</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2 text-right">Watt</th>
                      <th className="px-3 py-2 text-right">BTU</th>
                      <th className="px-3 py-2">Internal Notes</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory[cat]?.map((it) => {
                      const isEditing = editingId === it.id;
                      return (
                        <tr key={it.id} className={`border-t border-border ${!it.isActive ? "opacity-50" : ""}`}>
                          <td className="px-3 py-1.5 font-mono text-xs">{it.sku}</td>
                          <td className="px-3 py-1.5">
                            {isEditing ? (
                              <input className="w-full px-2 py-1 rounded border border-border bg-background text-sm" defaultValue={it.displayName} onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })} />
                            ) : it.displayName}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {isEditing ? (
                              <input type="number" defaultValue={it.unitCost} className="w-24 px-2 py-1 rounded border border-border bg-background text-sm text-right" onChange={(e) => setEditDraft({ ...editDraft, unitCost: e.target.value })} />
                            ) : `$${Number(it.unitCost).toLocaleString()}`}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {isEditing ? (
                              <input type="number" defaultValue={it.unitPrice ?? ""} placeholder="—" className="w-24 px-2 py-1 rounded border border-border bg-background text-sm text-right" onChange={(e) => setEditDraft({ ...editDraft, unitPrice: e.target.value })} />
                            ) : it.unitPrice ? `$${Number(it.unitPrice).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{it.unit}</td>
                          <td className="px-3 py-1.5 text-right">{it.maxWatt ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right">{it.heatLoadBtu != null ? Number(it.heatLoadBtu).toFixed(0) : "—"}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-xs truncate">{it.internalNotes ?? ""}</td>
                          <td className="px-3 py-1.5 text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => saveEdit(it.id)} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs">Save</button>
                                <button onClick={() => { setEditingId(null); setEditDraft({}); }} className="px-2 py-1 rounded border border-border text-xs">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => { setEditingId(it.id); setEditDraft({}); }} className="p-1 rounded hover:bg-muted" title="Edit">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {it.isActive && (
                                  <button onClick={() => archive(it.id)} className="p-1 rounded hover:bg-muted text-orange-500" title="Archive">
                                    <Archive className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4" /> No SKUs match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
