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

const TIER_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string; eyebrow: string }> = {
  retainer: { label: "Covered Under Retainer", color: "#16a34a", bgColor: "#f0fdf4", borderColor: "#bbf7d0", eyebrow: "Platform Maintenance" },
  small: { label: "Quick Improvements", color: "#2f5cd9", bgColor: "#eaf1ff", borderColor: "#cfdcf8", eyebrow: "Fixed Price Per Item" },
  medium: { label: "Workflow Enhancements", color: "#d97706", bgColor: "#fffbeb", borderColor: "#fde68a", eyebrow: "Multi-Step Builds" },
  large: { label: "Major Capabilities", color: "#0a1a3a", bgColor: "#f0f3fa", borderColor: "#d1d5db", eyebrow: "Standalone Engagements" },
};

const STATUS_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  shipped: { label: "Shipped", bg: "#dcfce7", color: "#16a34a" },
  selected: { label: "Selected", bg: "#dbeafe", color: "#2563eb" },
  declined: { label: "Declined", bg: "#fee2e2", color: "#dc2626" },
  available: { label: "", bg: "", color: "" },
};

export default function CatalogPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const isAdmin = searchParams.get("admin") === "1";

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogItemData>>({});
  const [addingTier, setAddingTier] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ title: "", description: "", price: 0 });
  const [dragId, setDragId] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    const res = await fetch(`/api/catalog/${slug}`);
    if (res.ok) {
      const data = await res.json();
      setCatalog(data);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const updateItem = async (itemId: string, fields: Record<string, any>) => {
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateItem", itemId, ...fields }),
    });
    fetchCatalog();
  };

  const addItem = async (tier: string) => {
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addItem", tier, ...newItem }),
    });
    setNewItem({ title: "", description: "", price: 0 });
    setAddingTier(null);
    fetchCatalog();
  };

  const deleteItem = async (itemId: string) => {
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteItem", itemId }),
    });
    fetchCatalog();
  };

  const handleDragStart = (id: string) => setDragId(id);

  const handleDrop = async (targetId: string) => {
    if (!dragId || !catalog || dragId === targetId) return;
    const items = [...catalog.items];
    const dragIdx = items.findIndex((i) => i.id === dragId);
    const dropIdx = items.findIndex((i) => i.id === targetId);
    const [moved] = items.splice(dragIdx, 1);
    items.splice(dropIdx, 0, moved);
    const reordered = items.map((item, idx) => ({ id: item.id, position: idx + 1 }));
    setCatalog({ ...catalog, items: items.map((item, idx) => ({ ...item, position: idx + 1 })) });
    setDragId(null);
    await fetch(`/api/catalog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", items: reordered }),
    });
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f6f9ff" }}>
        <div style={{ fontSize: 16, color: "#5b6884" }}>Loading catalog...</div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f6f9ff" }}>
        <div style={{ fontSize: 16, color: "#dc2626" }}>Catalog not found</div>
      </div>
    );
  }

  const tiers = ["retainer", "small", "medium", "large"];
  const grouped = tiers.map((tier) => ({
    tier,
    items: catalog.items.filter((i) => i.tier === tier).sort((a, b) => a.position - b.position),
  })).filter((g) => g.items.length > 0 || isAdmin);

  const selectedItems = catalog.items.filter((i) => i.status === "selected");
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.price * (1 - i.discount / 100), 0);
  const shippedItems = catalog.items.filter((i) => i.status === "shipped");
  const shippedValue = shippedItems.reduce((sum, i) => sum + i.price, 0);
  const availableTotal = catalog.items
    .filter((i) => i.status === "available" && i.tier !== "retainer")
    .reduce((sum, i) => sum + i.price * (1 - i.discount / 100), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f6f9ff", fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", background: "#fff", boxShadow: "0 18px 48px rgba(15,32,80,0.10)", borderRadius: 4, overflow: "hidden" }}>

        {/* Hero */}
        <div style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #2f5cd9 100%)",
          color: "#fff",
          padding: "52px 64px 40px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: -120, top: -120, width: 360, height: 360, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ fontSize: 11, letterSpacing: "2.4px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.78)", fontWeight: 600, marginBottom: 14 }}>
            Improvement Catalog
          </div>
          <h1 style={{ margin: "0 0 14px", fontSize: 32, fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.4px" }}>
            {catalog.title}
          </h1>
          {catalog.subtitle && (
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.86)", maxWidth: 620, margin: 0 }}>
              {catalog.subtitle}
            </p>
          )}
          <div style={{ display: "flex", gap: 32, marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.16)", flexWrap: "wrap" as const }}>
            <div>
              <span style={{ color: "rgba(255,255,255,0.60)", fontSize: 10, letterSpacing: "1.6px", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Prepared for</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{catalog.clientName}</span>
            </div>
            <div>
              <span style={{ color: "rgba(255,255,255,0.60)", fontSize: 10, letterSpacing: "1.6px", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Items</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{catalog.items.length} improvements</span>
            </div>
            <div>
              <span style={{ color: "rgba(255,255,255,0.60)", fontSize: 10, letterSpacing: "1.6px", textTransform: "uppercase" as const, display: "block", marginBottom: 4 }}>Already shipped</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{shippedItems.length} items{shippedValue > 0 ? ` ($${shippedValue.toLocaleString()})` : ""}</span>
            </div>
            {isAdmin && (
              <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", padding: "6px 16px", borderRadius: 4, fontSize: 12, fontWeight: 600, letterSpacing: "1px" }}>
                ADMIN MODE
              </div>
            )}
          </div>
        </div>

        {/* Tier sections */}
        {grouped.map(({ tier, items }) => {
          const meta = TIER_META[tier];
          return (
            <div key={tier} style={{ padding: "40px 64px", borderBottom: "1px solid #cfdcf8", borderLeft: `4px solid ${meta.color}` }}>
              <div style={{ fontSize: 10, letterSpacing: "2.2px", textTransform: "uppercase" as const, fontWeight: 700, color: meta.color, marginBottom: 10 }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 13, color: "#5b6884", marginBottom: 24 }}>{meta.eyebrow}</div>

              {items.map((item) => {
                const isEditing = editingItem === item.id;
                const badge = STATUS_BADGES[item.status] || STATUS_BADGES.available;
                const effectivePrice = item.price * (1 - item.discount / 100);

                return (
                  <div
                    key={item.id}
                    draggable={isAdmin}
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(item.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 16,
                      padding: "20px 0",
                      borderBottom: "1px solid #f0f3fa",
                      alignItems: "start",
                      opacity: item.status === "declined" ? 0.5 : 1,
                      cursor: isAdmin ? "grab" : "default",
                    }}
                  >
                    <div>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <input
                            value={editForm.title || ""}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            style={{ fontSize: 15, fontWeight: 600, padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, width: "100%" }}
                          />
                          <textarea
                            value={editForm.description || ""}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            rows={3}
                            style={{ fontSize: 13, padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, width: "100%", resize: "vertical" }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              type="number"
                              value={editForm.price || 0}
                              onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                              style={{ width: 100, padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13 }}
                              placeholder="Price"
                            />
                            <input
                              type="number"
                              value={editForm.discount || 0}
                              onChange={(e) => setEditForm({ ...editForm, discount: Number(e.target.value) })}
                              style={{ width: 80, padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13 }}
                              placeholder="Discount %"
                            />
                            <select
                              value={editForm.tier || tier}
                              onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                              style={{ padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13 }}
                            >
                              {tiers.map((t) => <option key={t} value={t}>{TIER_META[t].label}</option>)}
                            </select>
                            <button
                              onClick={() => { updateItem(item.id, editForm); setEditingItem(null); }}
                              style={{ padding: "6px 16px", background: "#2f5cd9", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingItem(null)}
                              style={{ padding: "6px 12px", background: "#f0f3fa", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13, cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#0a1a3a", marginBottom: 6 }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 13, color: "#5b6884", lineHeight: 1.55 }}>
                            {item.description}
                          </div>
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                              <button onClick={() => { setEditingItem(item.id); setEditForm(item); }} style={adminBtnStyle}>Edit</button>
                              <button onClick={() => updateItem(item.id, { status: "shipped" })} style={adminBtnStyle}>Mark Shipped</button>
                              <button onClick={() => updateItem(item.id, { status: "selected" })} style={adminBtnStyle}>Mark Selected</button>
                              <button onClick={() => updateItem(item.id, { status: "available" })} style={adminBtnStyle}>Reset</button>
                              <button onClick={() => updateItem(item.id, { status: "declined" })} style={{ ...adminBtnStyle, color: "#dc2626" }}>Decline</button>
                              <button onClick={() => { if (confirm("Delete this item?")) deleteItem(item.id); }} style={{ ...adminBtnStyle, color: "#dc2626" }}>Delete</button>
                            </div>
                          )}
                          {!isAdmin && item.status === "available" && item.tier !== "retainer" && (
                            <button
                              onClick={() => updateItem(item.id, { status: "selected" })}
                              style={{ marginTop: 10, padding: "6px 20px", background: "#2f5cd9", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                              I want this
                            </button>
                          )}
                          {!isAdmin && item.status === "selected" && (
                            <button
                              onClick={() => updateItem(item.id, { status: "available" })}
                              style={{ marginTop: 10, padding: "6px 20px", background: "#f0f3fa", color: "#2f5cd9", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                              Remove selection
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div style={{ textAlign: "right" as const, minWidth: 100 }}>
                      {badge.label && (
                        <div style={{ fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, padding: "3px 10px", borderRadius: 4, display: "inline-block", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.8px" }}>
                          {badge.label}
                        </div>
                      )}
                      {item.tier === "retainer" ? (
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
                          {item.status === "shipped" ? "Done" : "Included"}
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#0a1a3a" }}>
                            <span style={{ fontSize: 14, color: "#5b6884" }}>$</span>
                            {effectivePrice.toLocaleString()}
                          </div>
                          {item.discount > 0 && (
                            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                              {item.discount}% off <span style={{ textDecoration: "line-through", color: "#5b6884" }}>${item.price.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add item button (admin only) */}
              {isAdmin && (
                <div style={{ marginTop: 16 }}>
                  {addingTier === tier ? (
                    <div style={{ padding: 16, background: "#f6f9ff", borderRadius: 6, border: "1px solid #cfdcf8" }}>
                      <input
                        value={newItem.title}
                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                        placeholder="Item title"
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #cfdcf8", borderRadius: 4, marginBottom: 8, fontSize: 14 }}
                      />
                      <textarea
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        placeholder="Why this matters..."
                        rows={2}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #cfdcf8", borderRadius: 4, marginBottom: 8, fontSize: 13, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                          placeholder="Price"
                          style={{ width: 120, padding: "6px 10px", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13 }}
                        />
                        <button onClick={() => addItem(tier)} style={{ padding: "6px 20px", background: "#2f5cd9", color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Add
                        </button>
                        <button onClick={() => setAddingTier(null)} style={{ padding: "6px 12px", background: "#f0f3fa", border: "1px solid #cfdcf8", borderRadius: 4, fontSize: 13, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTier(tier)}
                      style={{ padding: "8px 20px", background: "transparent", border: "1px dashed #cfdcf8", borderRadius: 4, fontSize: 13, color: "#5b6884", cursor: "pointer", width: "100%" }}
                    >
                      + Add item to {meta.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Summary band */}
        <div style={{
          background: "linear-gradient(135deg, #0a1a3a 0%, #1e3a8a 100%)",
          color: "#fff",
          padding: "44px 64px",
        }}>
          <div style={{ fontSize: 10, letterSpacing: "2.2px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.62)", fontWeight: 700, marginBottom: 10 }}>
            Summary
          </div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>At a glance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28, marginTop: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: 20, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.60)", marginBottom: 8 }}>
                Already shipped
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{shippedItems.length} items</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: 20, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.60)", marginBottom: 8 }}>
                {selectedItems.length > 0 ? "Selected" : "Available"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                ${selectedItems.length > 0 ? selectedTotal.toLocaleString() : availableTotal.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", marginTop: 4 }}>
                {selectedItems.length > 0
                  ? `${selectedItems.length} items selected`
                  : `${catalog.items.filter((i) => i.status === "available" && i.tier !== "retainer").length} items available`}
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: 20, border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 11, letterSpacing: "1.4px", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.60)", marginBottom: 8 }}>
                Full catalog
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                ${(availableTotal + selectedTotal).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", marginTop: 4 }}>
                All remaining items
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          background: "#eaf1ff",
          padding: "32px 64px",
        }}>
          <p style={{ margin: "0 0 8px", color: "#2d3f6a", fontSize: 14 }}>
            <strong style={{ color: "#0a1a3a" }}>How this works:</strong> Pick what matters most. Each item is independently quotable — you don't have to take the whole list. Select your priorities and we'll send a scope document for each within 24 hours.
          </p>
        </div>

        <div style={{ background: "#0a1a3a", color: "rgba(255,255,255,0.66)", padding: "22px 64px", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>ANC Sports · Improvement Catalog</span>
          <span>Prepared May 2026</span>
        </div>
      </div>
    </div>
  );
}

const adminBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "#f0f3fa",
  border: "1px solid #cfdcf8",
  borderRadius: 4,
  fontSize: 11,
  cursor: "pointer",
  color: "#2d3f6a",
};
