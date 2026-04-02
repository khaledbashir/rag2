"use client";

import { useState, useEffect, useRef } from "react";
import type { ProductSpec } from "@/app/components/estimator/EstimatorBridge";

/**
 * Fetches product specs for cabinet layout calculations.
 * Caches results to avoid refetching on every render.
 */
export function useProductSpecs(productIds: string[]) {
    const [specs, setSpecs] = useState<Record<string, ProductSpec>>({});
    const cacheRef = useRef<Record<string, ProductSpec>>({});

    useEffect(() => {
        if (productIds.length === 0) return;

        // Find IDs we haven't fetched yet
        const missing = productIds.filter((id) => !cacheRef.current[id]);
        if (missing.length === 0) return;

        let cancelled = false;

        const fetchSpecs = async () => {
            try {
                // Fetch each missing product
                const results = await Promise.all(
                    missing.map(async (id) => {
                        const res = await fetch(`/api/products/${id}`);
                        if (!res.ok) return null;
                        const data = await res.json();
                        const p = data.product;
                        if (!p) return null;
                        return {
                            id,
                            spec: {
                                cabinetWidthMm: p.cabinetWidthMm,
                                cabinetHeightMm: p.cabinetHeightMm,
                                weightKgPerCabinet: p.weightKgPerCabinet,
                                maxPowerWattsPerCab: p.maxPowerWattsPerCab,
                                typicalPowerWattsPerCab: p.typicalPowerWattsPerCab || undefined,
                                pixelPitch: p.pixelPitch,
                                maxNits: p.maxNits ?? 0,
                            } as ProductSpec,
                        };
                    })
                );

                if (cancelled) return;

                const newCache = { ...cacheRef.current };
                for (const r of results) {
                    if (r) newCache[r.id] = r.spec;
                }
                cacheRef.current = newCache;
                setSpecs(newCache);
            } catch (err) {
                console.error("[useProductSpecs] Fetch error:", err);
            }
        };

        fetchSpecs();
        return () => { cancelled = true; };
    }, [productIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    return { specs };
}
