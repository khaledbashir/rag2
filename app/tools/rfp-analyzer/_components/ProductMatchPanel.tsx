"use client";

import React, { useState, useEffect, useRef } from "react";
import { Package, Check, Loader2, X } from "lucide-react";

export interface ProductMatchItem {
  displayIndex: number;
  displayName: string;
  productName: string | null;
  productModel: string | null;
  manufacturer: string | null;
  pitch: string | null;
  matchReason: string;
  fitPercent: number | null;
  total: number;
}

interface ProductMatchPanelProps {
  matches: ProductMatchItem[];
  isMatching: boolean;
  total: number;
}

export default function ProductMatchPanel({ matches, isMatching, total }: ProductMatchPanelProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Frontend stagger: reveal one card every 400ms
  useEffect(() => {
    if (matches.length > visibleCount) {
      timerRef.current = setTimeout(() => {
        setVisibleCount((prev) => Math.min(prev + 1, matches.length));
      }, 400);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [matches.length, visibleCount]);

  const visibleMatches = matches.slice(0, visibleCount);

  // Auto-scroll to newest card
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [visibleCount]);

  // Auto-dismiss 3s after all matches are revealed
  useEffect(() => {
    if (visibleCount === total && total > 0 && !isMatching) {
      const t = setTimeout(() => setDismissed(true), 4000);
      return () => clearTimeout(t);
    }
  }, [visibleCount, total, isMatching]);

  if (matches.length === 0 && !isMatching) return null;
  if (dismissed) return null;

  const matched = visibleMatches.filter(m => m.productName);
  const progress = total > 0 ? (visibleCount / total) * 100 : 0;
  const stillRevealing = visibleCount < matches.length;
  const active = isMatching || stillRevealing;
  const done = !active && visibleCount === total && visibleCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1b26] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0A52EF]/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-[#0A52EF]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Product Matching</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-gray-400 font-mono">
                  {matched.length}/{total}
                </span>
                {active && <Loader2 className="w-3 h-3 text-[#0A52EF] animate-spin" />}
                {done && <Check className="w-3 h-3 text-emerald-500" />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Progress bar */}
            <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: done
                    ? "linear-gradient(90deg, #10B981, #059669)"
                    : "linear-gradient(90deg, #0A52EF, #3B82F6)",
                }}
              />
            </div>
            {done && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Product cards */}
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-2"
        >
          {visibleMatches.map((m, i) => {
            const isLatest = i === visibleCount - 1 && active;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all duration-300 ${
                  isLatest ? "ring-2 ring-[#0A52EF]/30 shadow-sm" : ""
                } ${
                  m.productName
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30"
                    : "bg-gray-50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/30"
                }`}
                style={{
                  animation: isLatest ? "fadeSlideIn 0.3s ease-out" : undefined,
                }}
              >
                {/* Index + indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-gray-400 font-mono w-4 text-right">{i + 1}</span>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    m.productName ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}>
                    {m.productName
                      ? <Check className="w-3.5 h-3.5 text-white" />
                      : <span className="text-[9px] text-white font-bold">?</span>
                    }
                  </div>
                </div>

                {/* Display → Product */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">
                      {m.displayName}
                    </span>
                    {m.productName && (
                      <>
                        <span className="text-[9px] text-gray-400">→</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          {m.productName}
                        </span>
                      </>
                    )}
                  </div>
                  {!m.productName && (
                    <span className="text-[10px] text-gray-400 italic">No match found</span>
                  )}
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.pitch && (
                    <span className="text-[9px] bg-[#0A52EF]/10 text-[#0A52EF] px-1.5 py-0.5 rounded font-mono font-medium">
                      {m.pitch}
                    </span>
                  )}
                  {m.fitPercent != null && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      m.fitPercent >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : m.fitPercent >= 70 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {m.fitPercent}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active matching line */}
          {active && visibleCount < total && (
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[#0A52EF]/5 border border-[#0A52EF]/20 border-dashed">
              <span className="text-[9px] text-gray-400 font-mono w-4 text-right">{visibleCount + 1}</span>
              <Loader2 className="w-4 h-4 text-[#0A52EF] animate-spin shrink-0" />
              <span className="text-[10px] text-[#0A52EF] font-medium">
                Matching {visibleCount + 1} of {total}...
              </span>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="flex items-center justify-center gap-2 py-3">
              <Check className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                All {total} displays matched
              </span>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
