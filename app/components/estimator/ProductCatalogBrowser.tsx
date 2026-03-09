"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  Package,
  Check,
  Star,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Ruler,
  Monitor,
  Sun,
  Loader2,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ProductRecord {
  id: string;
  manufacturer: string;
  productFamily: string | null;
  modelNumber: string;
  displayName: string;
  productType: string; // "led" | "tv" | "cms" | "courtside" | "stanchion"
  pixelPitch: number;
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  cabinetDepthMm: number | null;
  weightKgPerCabinet: number | null;
  maxNits: number | null;
  typicalNits: number | null;
  refreshRate: number | null;
  maxPowerWattsPerCab: number | null;
  typicalPowerWattsPerCab: number | null;
  environment: string;
  ipRating: string | null;
  serviceType: string | null;
  supportsHalfModule: boolean;
  isCurved: boolean;
  costPerSqFt: number | null;
  msrpPerSqFt: number | null;
  extendedSpecs: any;
}

interface ProductCatalogBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (productId: string, productName: string) => void;
  currentPitch?: number;
  currentEnvironment?: string; // "indoor" | "outdoor"
  currentWidthFt?: number;
  currentHeightFt?: number;
  selectedProductId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MANUFACTURER_STYLES: Record<
  string,
  { bg: string; text: string; dot: string; isPartner: boolean }
> = {
  Yaham: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    isPartner: true,
  },
  LG: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-600",
    isPartner: true,
  },
  OES: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    dot: "bg-teal-600",
    isPartner: false,
  },
  Absen: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    isPartner: false,
  },
  Unilumin: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
    isPartner: false,
  },
  ANC: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    isPartner: true,
  },
};

const DEFAULT_STYLE = {
  bg: "bg-zinc-50",
  text: "text-zinc-700",
  dot: "bg-zinc-500",
  isPartner: false,
};

function getMfrStyle(mfr: string) {
  return MANUFACTURER_STYLES[mfr] || DEFAULT_STYLE;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductCatalogBrowser({
  open,
  onClose,
  onSelect,
  currentPitch,
  currentEnvironment,
  currentWidthFt,
  currentHeightFt,
  selectedProductId,
}: ProductCatalogBrowserProps) {
  // Data
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [selectedMfr, setSelectedMfr] = useState("all");
  const [selectedEnv, setSelectedEnv] = useState("all");
  const [selectedType, setSelectedType] = useState("all"); // "all" | "led" | "tv" | "cms"
  const [recommendedOnly, setRecommendedOnly] = useState(false);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch all products when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/products");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProducts(data.products || []);
          setManufacturers(data.manufacturers || []);
        }
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset filters when dialog opens
  useEffect(() => {
    if (open) {
      setSearchText("");
      setSelectedMfr("all");
      setSelectedEnv("all");
      setSelectedType("all");
      setRecommendedOnly(false);
      setExpandedId(null);
    }
  }, [open]);

  // Is a product "recommended" for the current display?
  const isRecommended = useCallback(
    (p: ProductRecord): boolean => {
      if (!currentPitch) return false;
      const pitchMatch = Math.abs(p.pixelPitch - currentPitch) <= 1;
      const envMatch =
        !currentEnvironment ||
        p.environment === currentEnvironment ||
        p.environment === "indoor_outdoor";
      return pitchMatch && envMatch;
    },
    [currentPitch, currentEnvironment]
  );

  // Filtered + grouped products
  const grouped = useMemo(() => {
    const searchLower = searchText.toLowerCase().trim();

    const filtered = products.filter((p) => {
      // Product type filter
      const pType = p.productType || "led";
      if (selectedType !== "all" && pType !== selectedType) return false;
      // Manufacturer filter
      if (selectedMfr !== "all" && p.manufacturer !== selectedMfr) return false;
      // Environment filter
      if (selectedEnv !== "all") {
        if (selectedEnv === "indoor") {
          if (p.environment !== "indoor" && p.environment !== "indoor_outdoor")
            return false;
        } else if (selectedEnv === "outdoor") {
          if (p.environment !== "outdoor" && p.environment !== "indoor_outdoor")
            return false;
        }
      }
      // Recommended filter
      if (recommendedOnly && !isRecommended(p)) return false;
      // Search filter
      if (searchLower) {
        const haystack =
          `${p.displayName} ${p.manufacturer} ${p.modelNumber} ${p.productFamily || ""}`.toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });

    // Sort: partners first, then by manufacturer name, then by pitch ascending
    filtered.sort((a, b) => {
      const aPartner = getMfrStyle(a.manufacturer).isPartner ? 0 : 1;
      const bPartner = getMfrStyle(b.manufacturer).isPartner ? 0 : 1;
      if (aPartner !== bPartner) return aPartner - bPartner;
      if (a.manufacturer !== b.manufacturer)
        return a.manufacturer.localeCompare(b.manufacturer);
      return a.pixelPitch - b.pixelPitch;
    });

    // Group by manufacturer
    const groups: { manufacturer: string; products: ProductRecord[] }[] = [];
    let currentMfr = "";
    for (const p of filtered) {
      if (p.manufacturer !== currentMfr) {
        currentMfr = p.manufacturer;
        groups.push({ manufacturer: currentMfr, products: [] });
      }
      groups[groups.length - 1].products.push(p);
    }

    return { groups, totalFiltered: filtered.length };
  }, [
    products,
    selectedMfr,
    selectedEnv,
    selectedType,
    recommendedOnly,
    searchText,
    isRecommended,
  ]);

  // Cabinet layout preview
  const getLayoutPreview = useCallback(
    (p: ProductRecord) => {
      if (!currentWidthFt || !currentHeightFt) return null;
      const targetWidthMm = currentWidthFt * 304.8;
      const targetHeightMm = currentHeightFt * 304.8;
      const cols = Math.floor(targetWidthMm / p.cabinetWidthMm);
      const rows = Math.floor(targetHeightMm / p.cabinetHeightMm);
      if (cols <= 0 || rows <= 0) return null;
      const actualWidthFt =
        ((cols * p.cabinetWidthMm) / 304.8).toFixed(1);
      const actualHeightFt =
        ((rows * p.cabinetHeightMm) / 304.8).toFixed(1);
      return {
        cols,
        rows,
        total: cols * rows,
        actualWidthFt,
        actualHeightFt,
      };
    },
    [currentWidthFt, currentHeightFt]
  );

  const handleSelect = useCallback(
    (p: ProductRecord) => {
      onSelect(p.id, p.displayName);
    },
    [onSelect]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[80vh] max-h-[80vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-0 shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1C1C1C]">
              <Package className="h-5 w-5 text-[#0A52EF]" />
              Product Catalog
            </DialogTitle>
            <DialogDescription className="text-xs text-[#878787]">
              {products.length} products available &middot; Select one for this
              display
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#878787]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name, model, or manufacturer..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-[#E8E8E8] rounded-lg focus:border-[#0A52EF] focus:ring-1 focus:ring-[#0A52EF]/20 outline-none bg-white text-[#1C1C1C] placeholder:text-[#B0B0B0]"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#F7F7F7]"
              >
                <X className="h-3.5 w-3.5 text-[#878787]" />
              </button>
            )}
          </div>

          {/* Filter Row */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pb-3 border-b border-[#E8E8E8]">
            {/* Manufacturer tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedMfr("all")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full transition-colors",
                  selectedMfr === "all"
                    ? "bg-[#1C1C1C] text-white"
                    : "bg-[#F7F7F7] text-[#616161] hover:bg-[#E8E8E8]"
                )}
              >
                All
              </button>
              {manufacturers.map((mfr) => {
                const style = getMfrStyle(mfr);
                return (
                  <button
                    key={mfr}
                    onClick={() =>
                      setSelectedMfr(selectedMfr === mfr ? "all" : mfr)
                    }
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors",
                      selectedMfr === mfr
                        ? "bg-[#1C1C1C] text-white"
                        : "bg-[#F7F7F7] text-[#616161] hover:bg-[#E8E8E8]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        selectedMfr === mfr ? "bg-white" : style.dot
                      )}
                    />
                    {mfr}
                    {style.isPartner && (
                      <Star className="h-3 w-3 fill-current opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[#E8E8E8]" />

            {/* Product type toggle */}
            <div className="flex items-center gap-1">
              {(["all", "led", "courtside", "stanchion", "tv", "cms"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full transition-colors uppercase",
                    selectedType === t
                      ? "bg-[#1C1C1C] text-white"
                      : "bg-[#F7F7F7] text-[#616161] hover:bg-[#E8E8E8]"
                  )}
                >
                  {t === "all" ? "All Types" : t === "cms" ? "CMS/Scoring" : t === "courtside" ? "Courtside" : t === "stanchion" ? "Stanchion" : t}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[#E8E8E8]" />

            {/* Environment toggle */}
            <div className="flex items-center gap-1">
              {(["all", "indoor", "outdoor"] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => setSelectedEnv(env)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full transition-colors capitalize",
                    selectedEnv === env
                      ? "bg-[#1C1C1C] text-white"
                      : "bg-[#F7F7F7] text-[#616161] hover:bg-[#E8E8E8]"
                  )}
                >
                  {env === "all" ? "All Env" : env}
                </button>
              ))}
            </div>

            {/* Recommended toggle */}
            {currentPitch && (
              <>
                <div className="w-px h-5 bg-[#E8E8E8]" />
                <button
                  onClick={() => setRecommendedOnly(!recommendedOnly)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors",
                    recommendedOnly
                      ? "bg-[#0A52EF] text-white"
                      : "bg-[#F7F7F7] text-[#616161] hover:bg-[#E8E8E8]"
                  )}
                >
                  {recommendedOnly && <Check className="h-3 w-3" />}
                  Recommended
                </button>
              </>
            )}
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <div className="flex items-center justify-center h-40 text-[#878787]">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading catalog...</span>
            </div>
          )}

          {!loading && grouped.totalFiltered === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-[#878787]">
              <Package className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm font-medium text-[#1C1C1C]">
                No products match
              </p>
              <p className="text-xs mt-1">
                Try adjusting your filters or search
              </p>
            </div>
          )}

          {!loading &&
            grouped.groups.map((group) => {
              const style = getMfrStyle(group.manufacturer);
              return (
                <div key={group.manufacturer} className="mb-5 last:mb-0">
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        style.dot
                      )}
                    />
                    <h3 className="text-sm font-semibold text-[#1C1C1C]">
                      {group.manufacturer}
                    </h3>
                    <span className="text-xs text-[#878787]">
                      {group.products.length} product
                      {group.products.length !== 1 ? "s" : ""}
                    </span>
                    {style.isPartner && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        Partner
                      </span>
                    )}
                  </div>

                  {/* Product cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.products.map((p) => {
                      const recommended = isRecommended(p);
                      const selected = p.id === selectedProductId;
                      const expanded = expandedId === p.id;
                      const pType = p.productType || "led";
                      const isTV = pType === "tv";
                      const isCMS = pType === "cms";
                      const layout = (isTV || isCMS) ? null : getLayoutPreview(p);
                      const envLabel =
                        p.environment === "indoor_outdoor"
                          ? "Indoor/Outdoor"
                          : p.environment === "indoor"
                            ? "Indoor"
                            : "Outdoor";

                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "border rounded-lg transition-all",
                            selected
                              ? "border-[#0A52EF] bg-[#0A52EF]/5 ring-1 ring-[#0A52EF]/20"
                              : recommended
                                ? "border-emerald-300 bg-emerald-50/30"
                                : "border-[#E8E8E8] hover:border-[#C0C0C0]"
                          )}
                        >
                          <div className="p-3">
                            {/* Card header */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-[#1C1C1C] truncate">
                                    {p.displayName}
                                  </p>
                                  {recommended && (
                                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#878787] mt-0.5">
                                  {p.modelNumber} &middot; {envLabel}
                                  {p.productFamily &&
                                    ` · ${p.productFamily}`}
                                </p>
                              </div>
                              {selected && (
                                <Check className="h-4 w-4 text-[#0A52EF] shrink-0 mt-0.5" />
                              )}
                            </div>

                            {/* Spec chips */}
                            <div className="flex flex-wrap gap-1.5 mb-2.5">
                              {isCMS ? (
                                <>
                                  <SpecChip
                                    label="Type"
                                    value={(p.extendedSpecs?.category || "equipment").replace(/_/g, " ")}
                                  />
                                  <SpecChip
                                    label="Unit Cost"
                                    value={`$${(p.extendedSpecs?.unitCost || 0).toLocaleString()}`}
                                  />
                                  {p.extendedSpecs?.unitSellPrice && (
                                    <SpecChip
                                      label="Sell"
                                      value={`$${p.extendedSpecs.unitSellPrice.toLocaleString()}`}
                                    />
                                  )}
                                  {p.extendedSpecs?.weightLbs && (
                                    <SpecChip
                                      label="Weight"
                                      value={`${p.extendedSpecs.weightLbs} lbs`}
                                    />
                                  )}
                                </>
                              ) : isTV ? (
                                <>
                                  <SpecChip
                                    icon={<Monitor className="h-3 w-3 text-[#0A52EF]" />}
                                    label="Size"
                                    value={`${p.extendedSpecs?.tvSizeInches || "?"}"`}
                                  />
                                  <SpecChip
                                    label="Unit Cost"
                                    value={`$${(p.extendedSpecs?.unitCost || 0).toLocaleString()}`}
                                  />
                                  <SpecChip
                                    label="Sell"
                                    value={`$${(p.extendedSpecs?.unitSellPrice || 0).toLocaleString()}`}
                                  />
                                  <SpecChip
                                    label="Margin"
                                    value={`${((p.extendedSpecs?.margin || 0) * 100).toFixed(0)}%`}
                                  />
                                </>
                              ) : (
                                <>
                                  <SpecChip
                                    label="Pitch"
                                    value={`${p.pixelPitch}mm`}
                                  />
                                  {p.maxNits && (
                                    <SpecChip
                                      icon={<Sun className="h-3 w-3 text-amber-500" />}
                                      label="Nits"
                                      value={p.maxNits.toLocaleString()}
                                    />
                                  )}
                                  <SpecChip
                                    icon={<Ruler className="h-3 w-3 text-[#878787]" />}
                                    label="Cabinet"
                                    value={`${p.cabinetWidthMm}×${p.cabinetHeightMm}mm`}
                                  />
                                  {p.maxPowerWattsPerCab && (
                                    <SpecChip
                                      icon={<Zap className="h-3 w-3 text-yellow-500" />}
                                      label="Power"
                                      value={`${p.maxPowerWattsPerCab}W`}
                                    />
                                  )}
                                  {p.costPerSqFt && (
                                    <SpecChip
                                      label="Cost"
                                      value={`$${p.costPerSqFt}/sqft`}
                                    />
                                  )}
                                </>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() =>
                                  setExpandedId(
                                    expanded ? null : p.id
                                  )
                                }
                                className="flex items-center gap-1 text-xs text-[#878787] hover:text-[#616161] transition-colors"
                              >
                                {expanded ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                                {expanded ? "Less" : "Details"}
                              </button>
                              <button
                                onClick={() => handleSelect(p)}
                                className={cn(
                                  "flex items-center gap-1 text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
                                  selected
                                    ? "bg-[#0A52EF] text-white"
                                    : "bg-[#1C1C1C] text-white hover:bg-[#333]"
                                )}
                              >
                                {selected ? (
                                  <>
                                    <Check className="h-3 w-3" />
                                    Selected
                                  </>
                                ) : (
                                  "Select"
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded details */}
                          {expanded && (
                            <div className="border-t border-[#E8E8E8] px-3 py-2.5 bg-[#FAFAFA]">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                {isCMS ? (
                                  <>
                                    {p.extendedSpecs?.specs && (
                                      <div className="col-span-2">
                                        <span className="text-[#878787]">Specs: </span>
                                        <span className="text-[#1C1C1C]">{p.extendedSpecs.specs}</span>
                                      </div>
                                    )}
                                    {p.cabinetWidthMm > 0 && (
                                      <DetailRow
                                        label="Dimensions"
                                        value={`${p.cabinetWidthMm} × ${p.cabinetHeightMm}${p.cabinetDepthMm ? ` × ${p.cabinetDepthMm}` : ""}mm`}
                                      />
                                    )}
                                    {p.extendedSpecs?.quoteRef && (
                                      <DetailRow
                                        label="Source"
                                        value={p.extendedSpecs.quoteRef}
                                      />
                                    )}
                                    {!p.extendedSpecs?.unitSellPrice && (
                                      <div className="col-span-2 mt-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700">
                                        Sell price & margin TBD — waiting on ANC markup rates
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                {p.weightKgPerCabinet && (
                                  <DetailRow
                                    label="Weight"
                                    value={`${p.weightKgPerCabinet} kg/cabinet (${(p.weightKgPerCabinet * 2.205).toFixed(1)} lbs)`}
                                  />
                                )}
                                {p.refreshRate && (
                                  <DetailRow
                                    label="Refresh"
                                    value={`${p.refreshRate} Hz`}
                                  />
                                )}
                                {p.cabinetDepthMm && (
                                  <DetailRow
                                    label="Depth"
                                    value={`${p.cabinetDepthMm}mm`}
                                  />
                                )}
                                {p.ipRating && (
                                  <DetailRow
                                    label="IP Rating"
                                    value={p.ipRating}
                                  />
                                )}
                                {p.serviceType && (
                                  <DetailRow
                                    label="Service"
                                    value={p.serviceType}
                                  />
                                )}
                                <DetailRow
                                  label="Half Module"
                                  value={p.supportsHalfModule ? "Yes" : "No"}
                                />
                                {p.isCurved && (
                                  <DetailRow label="Curved" value="Yes" />
                                )}
                                {p.typicalNits && (
                                  <DetailRow
                                    label="Typical Nits"
                                    value={p.typicalNits.toLocaleString()}
                                  />
                                )}
                                {p.typicalPowerWattsPerCab && (
                                  <DetailRow
                                    label="Typical Power"
                                    value={`${p.typicalPowerWattsPerCab}W`}
                                  />
                                )}
                                  </>
                                )}
                              </div>

                              {/* Cabinet layout preview */}
                              {layout && (
                                <div className="mt-2 pt-2 border-t border-[#E8E8E8]">
                                  <p className="text-xs font-medium text-[#616161] mb-1">
                                    Layout Preview ({currentWidthFt}&apos;
                                    &times; {currentHeightFt}&apos;)
                                  </p>
                                  <div className="flex gap-4 text-xs text-[#1C1C1C]">
                                    <span>
                                      {layout.cols} &times; {layout.rows} ={" "}
                                      <strong>
                                        {layout.total} cabinets
                                      </strong>
                                    </span>
                                    <span>
                                      Actual: {layout.actualWidthFt}&apos;
                                      &times; {layout.actualHeightFt}&apos;
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E8] bg-[#FAFAFA] shrink-0">
          <span className="text-xs text-[#878787]">
            Showing {grouped.totalFiltered} of {products.length} products
          </span>
          <button
            onClick={() => {
              onSelect("", "");
              onClose();
            }}
            className="text-xs text-[#878787] hover:text-[#616161] underline underline-offset-2 transition-colors"
          >
            Skip &mdash; use rate card pricing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SpecChip({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#F7F7F7] rounded text-[11px]">
      {icon}
      <span className="text-[#878787]">{label}:</span>
      <span className="font-medium text-[#1C1C1C]">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[#878787]">{label}: </span>
      <span className="text-[#1C1C1C]">{value}</span>
    </div>
  );
}
