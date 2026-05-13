"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2, Zap, Thermometer, Download, Sparkles, History, ShieldCheck, ShieldAlert } from "lucide-react";
import { FEATURES } from "@/lib/featureFlags";

const STRATEGIC = FEATURES.CMS_PRICING_STRATEGIC;

type Category =
  | "SERVER_EQUIPMENT" | "SERVER_ADDON" | "USER_STATION" | "INTERCONNECT"
  | "TRIGGER_HARDWARE" | "SCALER" | "ROUTER" | "KVM" | "BROADCAST_DA"
  | "RACK" | "TRAINING" | "INTEGRATION" | "SHIPPING" | "LICENSE" | "SUPPORT_TIER";

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
}

interface BomLine {
  id?: string;
  catalogItemId: string;
  quantity: number;
  isAutoDefault?: boolean;
  catalogItem: CatalogItem;
  unitCostSnapshot?: string;
  unitPriceSnapshot?: string | null;
}

interface BomResponse {
  proposal: { id: string; clientName: string | null; venue: string | null };
  bom: {
    id: string;
    hardwareSubtotal: string;
    licenseSubtotal: string;
    softCostSubtotal: string;
    grandSubtotal: string;
    totalWatt: number;
    totalHeatBtu: number;
    estimatedAcTons: number;
    acCapacityFlag: boolean;
    smartDefaultsApplied: boolean;
    lineItems: BomLine[];
  };
  softCostWarnings: string[];
}

interface SanityCheck {
  verdict: "OK" | "BELOW_BAND" | "ABOVE_BAND" | "NO_DATA";
  message: string;
  comparableCount: number;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
}

const HARDWARE_CATS: Category[] = [
  "SERVER_EQUIPMENT", "SERVER_ADDON", "USER_STATION", "INTERCONNECT",
  "TRIGGER_HARDWARE", "SCALER", "ROUTER", "KVM", "BROADCAST_DA", "RACK",
];
const SOFT_COST_CATS: Category[] = ["TRAINING", "INTEGRATION", "SHIPPING"];
const LICENSE_CATS: Category[] = ["LICENSE", "SUPPORT_TIER"];

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

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function CmsBomStudio({ projectId }: { projectId: string }) {
  const [catalog, setCatalog] = useState<Record<Category, CatalogItem[]>>({} as Record<Category, CatalogItem[]>);
  const [bom, setBom] = useState<BomResponse | null>(null);
  const [draft, setDraft] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sanityCheck, setSanityCheck] = useState<SanityCheck | null>(null);
  const [priorProjects, setPriorProjects] = useState<{ priorProjects: Array<{ proposalId: string; venue: string | null; updatedAt: string; lineItems: Array<{ catalogItemId: string; sku: string; displayName: string; quantity: string }> }> } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, bomRes, priorRes] = await Promise.all([
        fetch(`/api/cms/catalog?groupBy=category`).then((r) => r.json()),
        fetch(`/api/cms/project/${projectId}/bom`).then((r) => r.json()),
        fetch(`/api/cms/project/${projectId}/bom/prior-projects`).then((r) => r.json()).catch(() => null),
      ]);
      setCatalog(catRes.grouped ?? {});
      setBom(bomRes);
      setPriorProjects(priorRes);
      const map = new Map<string, number>();
      for (const li of bomRes.bom.lineItems) {
        map.set(li.catalogItemId, Number(li.quantity));
      }
      setDraft(map);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const setQty = (catalogItemId: string, qty: number) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (qty > 0) next.set(catalogItemId, qty);
      else next.delete(catalogItemId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = Array.from(draft.entries()).map(([catalogItemId, quantity]) => ({ catalogItemId, quantity }));
      const res = await fetch(`/api/cms/project/${projectId}/bom`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        await refresh();
        await runSanityCheck();
      }
    } finally {
      setSaving(false);
    }
  };

  const applySmartDefaults = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cms/project/${projectId}/bom/apply-smart-defaults`, { method: "POST" });
      if (res.ok) await refresh();
    } finally {
      setSaving(false);
    }
  };

  const runSanityCheck = async () => {
    const res = await fetch(`/api/cms/project/${projectId}/bom/sanity-check`);
    if (res.ok) setSanityCheck(await res.json());
  };

  const loadFromPrior = (lineItems: Array<{ catalogItemId: string; quantity: string }>) => {
    if (!window.confirm("Replace current selections with the prior project's BOM? You can still edit before saving.")) return;
    const map = new Map<string, number>();
    for (const li of lineItems) {
      const qty = Number(li.quantity);
      if (qty > 0) map.set(li.catalogItemId, qty);
    }
    setDraft(map);
  };

  // Build flat list of selected line items grouped by category for rendering.
  const lineRowsByCategory = useMemo(() => {
    const result: Partial<Record<Category, Array<{ ci: CatalogItem; qty: number }>>> = {};
    for (const [catalogItemId, qty] of draft.entries()) {
      const ci = Object.values(catalog).flat().find((c) => c.id === catalogItemId);
      if (!ci) continue;
      (result[ci.category] ??= []).push({ ci, qty });
    }
    return result;
  }, [draft, catalog]);

  // Derived totals from draft (live, before save).
  const liveTotals = useMemo(() => {
    let hardware = 0, license = 0, softCost = 0, totalWatt = 0, totalBtu = 0;
    for (const [catalogItemId, qty] of draft.entries()) {
      if (qty <= 0) continue;
      const ci = Object.values(catalog).flat().find((c) => c.id === catalogItemId);
      if (!ci) continue;
      const unit = Number(ci.unitPrice ?? ci.unitCost);
      const lineTotal = qty * unit;
      if (LICENSE_CATS.includes(ci.category)) license += lineTotal;
      else if (SOFT_COST_CATS.includes(ci.category)) softCost += lineTotal;
      else hardware += lineTotal;
      totalWatt += (ci.maxWatt ?? 0) * qty;
      totalBtu += (ci.heatLoadBtu ?? (ci.maxWatt ?? 0) * 3.412) * qty;
    }
    const grand = hardware + license + softCost;
    return {
      hardware, license, softCost, grand, totalWatt, totalBtu,
      estimatedAcTons: totalBtu / 12000,
      acCapacityFlag: totalBtu > 24000,
    };
  }, [draft, catalog]);

  if (loading) return <div className="text-muted-foreground">Loading CMS catalog…</div>;
  if (!bom) return <div className="text-destructive">Failed to load BOM.</div>;

  const isDirty = (() => {
    const persistedMap = new Map(bom.bom.lineItems.map((li) => [li.catalogItemId, Number(li.quantity)]));
    if (draft.size !== persistedMap.size) return true;
    for (const [k, v] of draft.entries()) if (persistedMap.get(k) !== v) return true;
    return false;
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* ─── Main BOM area ─── */}
      <div className="space-y-6">

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b border-border">
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : isDirty ? "Save BOM" : "Saved"}
          </button>
          {STRATEGIC && (
            <button
              onClick={applySmartDefaults}
              className="px-3 py-1.5 rounded border border-border text-sm flex items-center gap-1.5 hover:bg-muted"
            >
              <Sparkles className="w-4 h-4" /> Apply smart defaults
            </button>
          )}
          {STRATEGIC && (
            <button
              onClick={runSanityCheck}
              className="px-3 py-1.5 rounded border border-border text-sm flex items-center gap-1.5 hover:bg-muted"
            >
              <ShieldCheck className="w-4 h-4" /> Sanity check
            </button>
          )}
          <a
            href={`/api/cms/project/${projectId}/bom/export.xlsx`}
            className="px-3 py-1.5 rounded border border-border text-sm flex items-center gap-1.5 hover:bg-muted"
          >
            <Download className="w-4 h-4" /> Export Excel
          </a>
        </div>

        {/* Warnings — strategic only */}
        {STRATEGIC && bom.softCostWarnings.length > 0 && (
          <div className="border border-orange-500/40 bg-orange-500/5 rounded-lg p-3 space-y-1">
            {bom.softCostWarnings.map((w, i) => (
              <div key={i} className="text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Hardware + Soft costs */}
        <Section title="Hardware" categories={HARDWARE_CATS.concat(SOFT_COST_CATS)} catalog={catalog} lineRowsByCategory={lineRowsByCategory} setQty={setQty} draft={draft} />

        {/* License + Support */}
        <Section title="License & Support" categories={LICENSE_CATS} catalog={catalog} lineRowsByCategory={lineRowsByCategory} setQty={setQty} draft={draft} />
      </div>

      {/* ─── Side panel ─── */}
      <aside className="space-y-4">
        <div className="border border-border rounded-lg p-4 bg-muted/20">
          <h3 className="text-sm font-semibold mb-3">Quote Summary</h3>
          <Row label="Hardware" value={`$${fmt(liveTotals.hardware)}`} />
          <Row label="License + Support" value={`$${fmt(liveTotals.license)}`} />
          <Row label="Soft costs (Integ/Train/Ship)" value={`$${fmt(liveTotals.softCost)}`} />
          <div className="border-t border-border my-2" />
          <Row label="Control System Total" value={`$${fmt(liveTotals.grand)}`} bold />
          {isDirty && <p className="text-xs text-orange-500 mt-2">Unsaved changes — totals will sync on Save.</p>}
        </div>

        {STRATEGIC && (
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Thermometer className="w-4 h-4" /> Heat + Power</h3>
            <Row label="Total continuous draw" value={`${fmt(liveTotals.totalWatt)} W`} />
            <Row label="Heat load" value={`${fmt(liveTotals.totalBtu)} BTU/hr`} />
            <Row label="Estimated AC need" value={`${liveTotals.estimatedAcTons.toFixed(2)} tons`} />
            {liveTotals.acCapacityFlag && (
              <div className="mt-3 text-xs flex items-start gap-2 text-orange-500">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Exceeds standard rack cooling (~24,000 BTU/hr). Spec additional AC capacity in the install scope.</span>
              </div>
            )}
          </div>
        )}

        {STRATEGIC && sanityCheck && (
          <div className={`border rounded-lg p-4 ${sanityCheck.verdict === "OK" ? "border-emerald-500/40 bg-emerald-500/5" : sanityCheck.verdict === "NO_DATA" ? "border-border" : "border-orange-500/40 bg-orange-500/5"}`}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {sanityCheck.verdict === "OK" ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <ShieldAlert className="w-4 h-4 text-orange-500" />}
              CRM Sanity Check
            </h3>
            <p className="text-xs text-muted-foreground">{sanityCheck.message}</p>
            {sanityCheck.comparableCount > 0 && (
              <p className="text-xs mt-2 text-muted-foreground">n={sanityCheck.comparableCount} comparable CMS deals · median ${fmt(sanityCheck.median ?? 0)}</p>
            )}
          </div>
        )}

        {STRATEGIC && priorProjects && priorProjects.priorProjects.length > 0 && (
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Prior {bom.proposal.clientName} CMS projects</h3>
            <div className="space-y-2">
              {priorProjects.priorProjects.map((p) => (
                <div key={p.proposalId} className="text-xs">
                  <button onClick={() => loadFromPrior(p.lineItems)} className="text-left hover:underline text-blue-500">
                    {p.venue ?? "(no venue)"} — {new Date(p.updatedAt).toLocaleDateString()}
                  </button>
                  <p className="text-muted-foreground">{p.lineItems.length} line items</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({
  title, categories, catalog, lineRowsByCategory, setQty, draft,
}: {
  title: string;
  categories: Category[];
  catalog: Record<Category, CatalogItem[]>;
  lineRowsByCategory: Partial<Record<Category, Array<{ ci: CatalogItem; qty: number }>>>;
  setQty: (id: string, qty: number) => void;
  draft: Map<string, number>;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-4">
        {categories.map((cat) => {
          const available = catalog[cat] ?? [];
          if (available.length === 0) return null;
          const selected = lineRowsByCategory[cat] ?? [];
          return (
            <div key={cat} className="border border-border rounded-lg">
              <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                <h3 className="text-sm font-medium">{CATEGORY_LABEL[cat]}</h3>
                <AddPicker
                  available={available.filter((a) => !draft.has(a.id))}
                  onAdd={(id) => setQty(id, 1)}
                />
              </div>
              {selected.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No items selected</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-normal">SKU</th>
                      <th className="text-left px-3 py-1.5 font-normal">Item</th>
                      <th className="text-right px-3 py-1.5 font-normal">Unit Cost</th>
                      {STRATEGIC && <th className="text-right px-3 py-1.5 font-normal">Sell Price</th>}
                      {STRATEGIC && <th className="text-right px-3 py-1.5 font-normal">Margin</th>}
                      <th className="text-right px-3 py-1.5 font-normal">Qty</th>
                      <th className="text-right px-3 py-1.5 font-normal">Line Total</th>
                      <th className="px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map(({ ci, qty }) => {
                      const cost = Number(ci.unitCost);
                      const sell = ci.unitPrice ? Number(ci.unitPrice) : cost;
                      const lineTotal = qty * sell;
                      const margin = sell - cost;
                      const marginPct = cost > 0 ? (margin / sell) * 100 : 0;
                      return (
                        <tr key={ci.id} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono text-xs">{ci.sku}</td>
                          <td className="px-3 py-1.5">{ci.displayName}</td>
                          <td className="px-3 py-1.5 text-right">${fmt(cost)}</td>
                          {STRATEGIC && (
                            <td className="px-3 py-1.5 text-right">{ci.unitPrice ? `$${fmt(sell)}` : <span className="text-muted-foreground">—</span>}</td>
                          )}
                          {STRATEGIC && (
                            <td className={`px-3 py-1.5 text-right text-xs ${margin >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {ci.unitPrice ? `$${fmt(margin)} (${marginPct.toFixed(0)}%)` : "—"}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={qty}
                              onChange={(e) => setQty(ci.id, Number(e.target.value))}
                              className="w-20 px-2 py-1 rounded border border-border bg-background text-sm text-right"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">${fmt(lineTotal)}</td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setQty(ci.id, 0)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Remove">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddPicker({ available, onAdd }: { available: CatalogItem[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return available.slice(0, 50);
    return available.filter((a) => a.sku.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q));
  }, [available, search]);
  if (available.length === 0) {
    return <span className="text-xs text-muted-foreground">All added</span>;
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted">
        <Plus className="w-3 h-3" /> Add
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-80 max-h-80 overflow-y-auto bg-background border border-border rounded-lg shadow-lg">
          <input
            autoFocus
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border-b border-border bg-background"
          />
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => { onAdd(a.id); setOpen(false); setSearch(""); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
            >
              <span>
                <span className="font-mono text-xs text-muted-foreground mr-2">{a.sku}</span>
                {a.displayName}
              </span>
              <span className="text-xs text-muted-foreground">${fmt(Number(a.unitPrice ?? a.unitCost))}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
