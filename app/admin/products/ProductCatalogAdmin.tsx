"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import {
    Search,
    Upload,
    Download,
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    X,
    Check,
    Edit3,
    Package,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface Product {
    id: string;
    manufacturer: string;
    productFamily: string;
    modelNumber: string;
    displayName: string;
    productType: string; // "led", "tv", "cms"
    pixelPitch: number;
    cabinetWidthMm: number;
    cabinetHeightMm: number;
    cabinetDepthMm: number | null;
    weightKgPerCabinet: number;
    maxNits: number;
    typicalNits: number | null;
    refreshRate: number | null;
    maxPowerWattsPerCab: number;
    typicalPowerWattsPerCab: number | null;
    environment: string;
    ipRating: string | null;
    serviceType: string;
    supportsHalfModule: boolean;
    isCurved: boolean;
    moduleWidthMm: number | null;
    moduleHeightMm: number | null;
    costPerSqFt: number | null;
    msrpPerSqFt: number | null;
    extendedSpecs: Record<string, any> | null;
    isActive: boolean;
    sourceSpreadsheet: string | null;
    importedAt: string;
    updatedAt: string;
}

function getUnitCost(p: Product): number | null {
    // Unit-priced products (TV, courtside, stanchion, CMS, OES): cost from extendedSpecs
    if (p.extendedSpecs?.unitCost != null) {
        return Number(p.extendedSpecs.unitCost);
    }
    return null;
}

function isPreferred(p: Product): boolean {
    return p.extendedSpecs?.preferred === true;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductCatalogAdmin() {
    const [products, setProducts] = useState<Product[]>([]);
    const [manufacturers, setManufacturers] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const { confirm, alert: showAlert } = useConfirm();
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);
    const [rateCardBusy, setRateCardBusy] = useState(false);
    const [rateCard, setRateCard] = useState<{ report?: any; file?: File; error?: string } | null>(null);

    // Filters
    const [searchText, setSearchText] = useState("");
    const [filterManufacturer, setFilterManufacturer] = useState("");
    const [filterEnvironment, setFilterEnvironment] = useState("");
    const [filterPitchMin, setFilterPitchMin] = useState("");
    const [filterPitchMax, setFilterPitchMax] = useState("");

    // Inline editing
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<Partial<Product>>({});

    // Sort
    const [sortField, setSortField] = useState<string>("manufacturer");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

    // Add product form
    const [showAddForm, setShowAddForm] = useState(false);

    // ========================================================================
    // FETCH
    // ========================================================================

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchText) params.set("search", searchText);
            if (filterManufacturer) params.set("manufacturer", filterManufacturer);
            if (filterEnvironment) params.set("environment", filterEnvironment);
            if (filterPitchMin) params.set("pitchMin", filterPitchMin);
            if (filterPitchMax) params.set("pitchMax", filterPitchMax);

            const res = await fetch(`/api/products?${params.toString()}`);
            const data = await res.json();
            setProducts(data.products || []);
            setManufacturers(data.manufacturers || []);
        } catch (err) {
            console.error("Failed to fetch products:", err);
        } finally {
            setLoading(false);
        }
    }, [searchText, filterManufacturer, filterEnvironment, filterPitchMin, filterPitchMax]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // ========================================================================
    // IMPORT
    // ========================================================================

    const handleImport = async (file: File, manufacturer?: string) => {
        setImporting(true);
        setImportResult(null);
        try {
            const formData = new FormData();
            formData.append("file", file);
            if (manufacturer) formData.append("manufacturer", manufacturer);

            const res = await fetch("/api/products/import", { method: "POST", body: formData });
            const data = await res.json();
            setImportResult(data);
            fetchProducts();
        } catch (err) {
            setImportResult({ error: "Import failed" });
        } finally {
            setImporting(false);
        }
    };

    // ========================================================================
    // NX RATE CARD IMPORT
    //
    // Two steps on purpose. A rate card moves what the estimator charges per
    // sqft, so the diff is shown first and nothing is written until it is
    // accepted.
    // ========================================================================

    const runRateCard = async (file: File, dryRun: boolean) => {
        setRateCardBusy(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("dryRun", String(dryRun));

            const res = await fetch("/api/products/import-rate-card", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) {
                setRateCard({ error: data.error ?? "Rate card import failed" });
                return;
            }
            setRateCard({ report: data.report, file });
            if (!dryRun) fetchProducts();
        } catch {
            setRateCard({ error: "Rate card import failed" });
        } finally {
            setRateCardBusy(false);
        }
    };

    // ========================================================================
    // DELETE
    // ========================================================================

    const handleDelete = async (id: string) => {
        const ok = await confirm({ title: "Deactivate Product", description: "Deactivate this product? It will no longer appear in the catalog.", confirmLabel: "Deactivate", variant: "destructive" });
        if (!ok) return;
        try {
            await fetch(`/api/products/${id}`, { method: "DELETE" });
            fetchProducts();
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    // ========================================================================
    // INLINE EDIT
    // ========================================================================

    const startEdit = (product: Product) => {
        setEditingId(product.id);
        setEditData({ ...product });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditData({});
    };

    const saveEdit = async () => {
        if (!editingId) return;
        try {
            await fetch(`/api/products/${editingId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editData),
            });
            setEditingId(null);
            setEditData({});
            fetchProducts();
        } catch (err) {
            console.error("Save failed:", err);
        }
    };

    // ========================================================================
    // ADD PRODUCT
    // ========================================================================

    const [newProduct, setNewProduct] = useState({
        manufacturer: "",
        productFamily: "",
        modelNumber: "",
        displayName: "",
        pixelPitch: "",
        cabinetWidthMm: "",
        cabinetHeightMm: "",
        maxPowerWattsPerCab: "",
        maxNits: "1000",
        weightKgPerCabinet: "10",
        environment: "indoor",
    });

    const handleAddProduct = async () => {
        try {
            const res = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newProduct),
            });
            if (res.ok) {
                setShowAddForm(false);
                setNewProduct({
                    manufacturer: "", productFamily: "", modelNumber: "", displayName: "",
                    pixelPitch: "", cabinetWidthMm: "", cabinetHeightMm: "",
                    maxPowerWattsPerCab: "", maxNits: "1000", weightKgPerCabinet: "10", environment: "indoor",
                });
                fetchProducts();
            } else {
                const data = await res.json();
                void showAlert({ title: "Add Failed", description: data.error || "Failed to add product" });
            }
        } catch (err) {
            void showAlert({ title: "Add Failed", description: "Failed to add product" });
        }
    };

    // ========================================================================
    // SORT
    // ========================================================================

    const toggleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    };

    const togglePreferred = async (product: Product) => {
        const newPref = !isPreferred(product);
        try {
            await fetch(`/api/products/${product.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    extendedSpecs: { ...(product.extendedSpecs || {}), preferred: newPref },
                }),
            });
            fetchProducts();
        } catch (err) {
            console.error("Toggle preferred failed:", err);
        }
    };

    const sorted = [...products].sort((a: any, b: any) => {
        // Preferred products always first
        const aPref = isPreferred(a) ? 0 : 1;
        const bPref = isPreferred(b) ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
        return sortDir === "asc" ? cmp : -cmp;
    });

    // ========================================================================
    // RENDER
    // ========================================================================

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return null;
        return sortDir === "asc"
            ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
            : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
    };

    const thClass = "px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";
    const tdClass = "px-3 py-2 text-xs text-foreground whitespace-nowrap";

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                    />
                </div>

                {/* Manufacturer filter */}
                <select
                    value={filterManufacturer}
                    onChange={(e) => setFilterManufacturer(e.target.value)}
                    className="px-3 py-2 text-sm bg-card border border-border rounded-lg"
                >
                    <option value="">All Manufacturers</option>
                    {manufacturers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                {/* Environment filter */}
                <select
                    value={filterEnvironment}
                    onChange={(e) => setFilterEnvironment(e.target.value)}
                    className="px-3 py-2 text-sm bg-card border border-border rounded-lg"
                >
                    <option value="">All Environments</option>
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="indoor_outdoor">Indoor/Outdoor</option>
                </select>

                {/* Pitch range */}
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        placeholder="Min mm"
                        value={filterPitchMin}
                        onChange={(e) => setFilterPitchMin(e.target.value)}
                        className="w-20 px-2 py-2 text-sm bg-card border border-border rounded-lg"
                        step="0.1"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input
                        type="number"
                        placeholder="Max mm"
                        value={filterPitchMax}
                        onChange={(e) => setFilterPitchMax(e.target.value)}
                        className="w-20 px-2 py-2 text-sm bg-card border border-border rounded-lg"
                        step="0.1"
                    />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    {/* Refresh */}
                    <button
                        onClick={fetchProducts}
                        className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>

                    {/* Add Product */}
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Product
                    </button>

                    {/* Export catalog */}
                    <a
                        href="/api/products/export"
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
                        title="Download every product in the catalog as .xlsx"
                    >
                        <Download className="w-4 h-4" />
                        Export catalog
                    </a>

                    {/* Download Template */}
                    <a
                        href="/api/products/template?type=all"
                        download
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Template
                    </a>

                    {/* NX rate card */}
                    <label
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
                        title="Upload an NX Yaham rate card (ANC or LGEUS) — shows the price changes before anything is saved"
                    >
                        <Upload className={`w-4 h-4 ${rateCardBusy ? "animate-pulse" : ""}`} />
                        Import rate card
                        <input
                            type="file"
                            className="hidden"
                            accept=".xlsx"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) runRateCard(file, true);
                                e.target.value = "";
                            }}
                        />
                    </label>

                    {/* Import */}
                    <label className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer">
                        <Upload className={`w-4 h-4 ${importing ? "animate-pulse" : ""}`} />
                        Import Excel
                        <input
                            type="file"
                            className="hidden"
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImport(file);
                                e.target.value = "";
                            }}
                        />
                    </label>
                </div>
            </div>

            {/* Import Result */}
            {importResult && (
                <div className={`p-4 rounded-lg border text-sm ${importResult.error ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
                    {importResult.error ? (
                        <span>{importResult.error}</span>
                    ) : (
                        <span>
                            Import complete: {importResult.summary?.created} created, {importResult.summary?.updated} updated, {importResult.summary?.skipped} skipped
                            {importResult.summary?.errors > 0 && `, ${importResult.summary.errors} errors`}
                        </span>
                    )}
                    <button onClick={() => setImportResult(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">
                        <X className="w-3 h-3 inline" />
                    </button>
                </div>
            )}

            {/* NX rate card — diff, then apply */}
            {rateCard && (
                <div className="p-4 bg-card border border-border rounded-lg space-y-3 text-sm">
                    {rateCard.error ? (
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-red-400">{rateCard.error}</span>
                            <button onClick={() => setRateCard(null)} className="text-xs opacity-60 hover:opacity-100">
                                <X className="w-3 h-3 inline" />
                            </button>
                        </div>
                    ) : (
                        (() => {
                            const r = rateCard.report;
                            const p = r.products;
                            const moved = r.estimatorRates.changes.filter((c: any) => c.action !== "unchanged");
                            return (
                                <>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                                <Package className="w-4 h-4" />
                                                {r.variant === "LGEUS" ? "LG USA rate card" : "Yaham direct rate card"}
                                                {r.dryRun && (
                                                    <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-400 rounded">
                                                        Preview
                                                    </span>
                                                )}
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {r.sourceFile} · priced {r.pricedOn ?? "—"} · {r.basis}
                                                {r.markupPct !== null && ` ${(r.markupPct * 100).toFixed(0)}%`}
                                            </p>
                                        </div>
                                        <button onClick={() => setRateCard(null)} className="text-xs opacity-60 hover:opacity-100">
                                            <X className="w-3 h-3 inline" />
                                        </button>
                                    </div>

                                    <div className="text-foreground">
                                        Catalog: {p.created} new, {p.updated} repriced, {p.unchanged} unchanged, {p.retired} retired
                                    </div>

                                    <div>
                                        <div className="text-xs text-muted-foreground mb-1">
                                            Estimator pricing: {r.estimatorRates.reason}
                                        </div>
                                        {moved.length > 0 && (
                                            <div className="max-h-56 overflow-y-auto border border-border rounded">
                                                <table className="w-full text-xs">
                                                    <tbody>
                                                        {moved.map((c: any) => {
                                                            const pct =
                                                                c.oldValue && c.newValue
                                                                    ? ((c.newValue / c.oldValue - 1) * 100)
                                                                    : null;
                                                            return (
                                                                <tr key={c.key} className="border-b border-border/50 last:border-0">
                                                                    <td className="px-2 py-1 font-mono text-muted-foreground">{c.key}</td>
                                                                    <td className="px-2 py-1 text-right tabular-nums">
                                                                        {c.oldValue !== null ? c.oldValue.toFixed(2) : "—"}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-right tabular-nums text-foreground">
                                                                        → {c.newValue.toFixed(2)}
                                                                    </td>
                                                                    <td className={`px-2 py-1 text-right tabular-nums ${pct && pct > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                                                                        {pct !== null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "new"}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {r.warnings?.length > 0 && (
                                        <ul className="text-xs text-amber-400 space-y-0.5">
                                            {r.warnings.map((w: string, i: number) => (
                                                <li key={i}>· {w}</li>
                                            ))}
                                        </ul>
                                    )}

                                    {r.dryRun ? (
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={() => rateCard.file && runRateCard(rateCard.file, false)}
                                                disabled={rateCardBusy}
                                                className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                            >
                                                Apply this rate card
                                            </button>
                                            <button
                                                onClick={() => setRateCard(null)}
                                                className="px-3 py-2 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-emerald-400">Applied. New estimates use these prices.</div>
                                    )}
                                </>
                            );
                        })()
                    )}
                </div>
            )}

            {/* Add Product Form */}
            {showAddForm && (
                <div className="p-4 bg-card border border-border rounded-lg space-y-3 animate-in slide-in-from-top-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Add New Product
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries({
                            manufacturer: "Manufacturer *",
                            productFamily: "Product Family",
                            modelNumber: "Model Number *",
                            displayName: "Display Name",
                            pixelPitch: "Pixel Pitch (mm) *",
                            cabinetWidthMm: "Width (mm) *",
                            cabinetHeightMm: "Height (mm) *",
                            maxPowerWattsPerCab: "Max Power (W) *",
                            maxNits: "Max Nits",
                            weightKgPerCabinet: "Weight (kg)",
                        }).map(([key, label]) => (
                            <div key={key}>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
                                <input
                                    type="text"
                                    value={(newProduct as any)[key]}
                                    onChange={(e) => setNewProduct({ ...newProduct, [key]: e.target.value })}
                                    className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-md"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Environment</label>
                            <select
                                value={newProduct.environment}
                                onChange={(e) => setNewProduct({ ...newProduct, environment: e.target.value })}
                                className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-md"
                            >
                                <option value="indoor">Indoor</option>
                                <option value="outdoor">Outdoor</option>
                                <option value="indoor_outdoor">Indoor/Outdoor</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddProduct}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            Create Product
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{products.length} product{products.length !== 1 ? "s" : ""}</span>
                <span>{manufacturers.length} manufacturer{manufacturers.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-x-auto bg-card">
                <table className="w-full text-left">
                    <thead className="border-b border-border bg-muted/30">
                        <tr>
                            <th className={thClass} style={{ width: 30 }} title="Preferred — click star to toggle">★</th>
                            <th className={thClass} onClick={() => toggleSort("manufacturer")}>Mfg<SortIcon field="manufacturer" /></th>
                            <th className={thClass} onClick={() => toggleSort("productFamily")}>Family<SortIcon field="productFamily" /></th>
                            <th className={thClass} onClick={() => toggleSort("modelNumber")}>Model<SortIcon field="modelNumber" /></th>
                            <th className={thClass} onClick={() => toggleSort("pixelPitch")}>Pitch<SortIcon field="pixelPitch" /></th>
                            <th className={thClass} onClick={() => toggleSort("cabinetWidthMm")}>W×H (mm)<SortIcon field="cabinetWidthMm" /></th>
                            <th className={thClass} onClick={() => toggleSort("moduleWidthMm")}>Module<SortIcon field="moduleWidthMm" /></th>
                            <th className={thClass} onClick={() => toggleSort("maxNits")}>Nits<SortIcon field="maxNits" /></th>
                            <th className={thClass} onClick={() => toggleSort("maxPowerWattsPerCab")}>Power<SortIcon field="maxPowerWattsPerCab" /></th>
                            <th className={thClass} onClick={() => toggleSort("environment")}>Env<SortIcon field="environment" /></th>
                            <th className={thClass} onClick={() => toggleSort("costPerSqFt")}>Cost<SortIcon field="costPerSqFt" /></th>
                            <th className={thClass}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr>
                                <td colSpan={12} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                                    Loading products...
                                </td>
                            </tr>
                        ) : sorted.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                    No products found. Import a spreadsheet or add one manually.
                                </td>
                            </tr>
                        ) : sorted.map((p) => (
                            <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                                {editingId === p.id ? (
                                    <>
                                        <td className={tdClass}>
                                            <button onClick={() => togglePreferred(p)} className="text-base leading-none" title="Toggle preferred">
                                                {isPreferred(p) ? "⭐" : "☆"}
                                            </button>
                                        </td>
                                        <td className={tdClass}>
                                            <input value={editData.manufacturer || ""} onChange={(e) => setEditData({ ...editData, manufacturer: e.target.value })} className="w-20 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <input value={editData.productFamily || ""} onChange={(e) => setEditData({ ...editData, productFamily: e.target.value })} className="w-20 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <input value={editData.modelNumber || ""} onChange={(e) => setEditData({ ...editData, modelNumber: e.target.value })} className="w-24 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <input type="number" step="0.1" value={editData.pixelPitch || ""} onChange={(e) => setEditData({ ...editData, pixelPitch: parseFloat(e.target.value) })} className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <div className="flex gap-1">
                                                <input type="number" value={editData.cabinetWidthMm || ""} onChange={(e) => setEditData({ ...editData, cabinetWidthMm: parseFloat(e.target.value) })} className="w-14 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                                <input type="number" value={editData.cabinetHeightMm || ""} onChange={(e) => setEditData({ ...editData, cabinetHeightMm: parseFloat(e.target.value) })} className="w-14 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                            </div>
                                        </td>
                                        <td className={tdClass}>
                                            <div className="flex gap-1">
                                                <input type="number" placeholder="W" value={editData.moduleWidthMm ?? ""} onChange={(e) => setEditData({ ...editData, moduleWidthMm: e.target.value ? parseFloat(e.target.value) : null })} className="w-14 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                                <input type="number" placeholder="H" value={editData.moduleHeightMm ?? ""} onChange={(e) => setEditData({ ...editData, moduleHeightMm: e.target.value ? parseFloat(e.target.value) : null })} className="w-14 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                            </div>
                                        </td>
                                        <td className={tdClass}>
                                            <input type="number" value={editData.maxNits || ""} onChange={(e) => setEditData({ ...editData, maxNits: parseFloat(e.target.value) })} className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <input type="number" value={editData.maxPowerWattsPerCab || ""} onChange={(e) => setEditData({ ...editData, maxPowerWattsPerCab: parseFloat(e.target.value) })} className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                        </td>
                                        <td className={tdClass}>
                                            <select value={editData.environment || "indoor"} onChange={(e) => setEditData({ ...editData, environment: e.target.value })} className="px-1 py-0.5 text-xs bg-background border border-border rounded">
                                                <option value="indoor">Indoor</option>
                                                <option value="outdoor">Outdoor</option>
                                                <option value="indoor_outdoor">Both</option>
                                            </select>
                                        </td>
                                        <td className={tdClass}>
                                            {p.productType === "led" ? (
                                                <input type="number" step="0.01" placeholder="$/ft²" value={editData.costPerSqFt ?? ""} onChange={(e) => setEditData({ ...editData, costPerSqFt: e.target.value ? parseFloat(e.target.value) : null })} className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                            ) : (
                                                <input type="number" step="1" placeholder="Unit $" value={editData.extendedSpecs?.unitCost ?? ""} onChange={(e) => setEditData({ ...editData, extendedSpecs: { ...(editData.extendedSpecs || {}), unitCost: e.target.value ? parseFloat(e.target.value) : null } })} className="w-16 px-1 py-0.5 text-xs bg-background border border-border rounded" />
                                            )}
                                        </td>
                                        <td className={tdClass}>
                                            <div className="flex gap-1">
                                                <button onClick={saveEdit} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded" title="Save">
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={cancelEdit} className="p-1 text-muted-foreground hover:bg-muted rounded" title="Cancel">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className={tdClass}>
                                            <button onClick={() => togglePreferred(p)} className="text-base leading-none opacity-60 hover:opacity-100 transition-opacity" title="Toggle preferred">
                                                {isPreferred(p) ? "⭐" : "☆"}
                                            </button>
                                        </td>
                                        <td className={tdClass}><span className="font-medium">{p.manufacturer}</span></td>
                                        <td className={tdClass}>{p.productFamily}</td>
                                        <td className={`${tdClass} font-mono text-[11px]`}>{p.modelNumber}</td>
                                        <td className={tdClass}>{p.pixelPitch}mm</td>
                                        <td className={tdClass}>{p.cabinetWidthMm}×{p.cabinetHeightMm}</td>
                                        <td className={`${tdClass} font-mono text-[10px]`}>{p.moduleWidthMm && p.moduleHeightMm ? `${p.moduleWidthMm}×${p.moduleHeightMm}` : <span className="text-muted-foreground">—</span>}</td>
                                        <td className={tdClass}>{p.maxNits.toLocaleString()}</td>
                                        <td className={tdClass}>{p.maxPowerWattsPerCab}W</td>
                                        <td className={tdClass}>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                p.environment === "outdoor"
                                                    ? "bg-amber-500/10 text-amber-400"
                                                    : p.environment === "indoor_outdoor"
                                                    ? "bg-blue-500/10 text-blue-400"
                                                    : "bg-emerald-500/10 text-emerald-400"
                                            }`}>
                                                {p.environment === "indoor_outdoor" ? "Both" : p.environment}
                                            </span>
                                        </td>
                                        <td className={tdClass}>{
                                            (() => {
                                                const unitCost = getUnitCost(p);
                                                const isUnitPriced = p.productType !== "led" || p.pixelPitch === 0 || unitCost != null;
                                                if (isUnitPriced && unitCost != null) {
                                                    return `$${unitCost.toLocaleString()}/unit`;
                                                }
                                                if (isUnitPriced && p.costPerSqFt) {
                                                    return `$${Number(p.costPerSqFt).toLocaleString()}/unit`;
                                                }
                                                return p.costPerSqFt ? `$${Number(p.costPerSqFt).toFixed(2)}/ft²` : "—";
                                            })()
                                        }</td>
                                        <td className={tdClass}>
                                            <div className="flex gap-1">
                                                <button onClick={() => startEdit(p)} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded" title="Edit">
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleDelete(p.id)} className="p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded" title="Deactivate">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
