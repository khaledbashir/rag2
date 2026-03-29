"use client";

import React, { useState, useEffect, useRef } from "react";
import { Package, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";

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
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [matches.length, expanded]);

  if (matches.length === 0 && !isMatching) return null;

  const matched = matches.filter(m => m.productName);
  const progress = total > 0 ? (matches.length / total) * 100 : 0;

  return (
    <div className="mb-4 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1b26] shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#0A52EF]/5 to-transparent hover:from-[#0A52EF]/10 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-[#0A52EF]" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            Product Catalog
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            {matched.length}/{total} matched
          </span>
          {isMatching && <Loader2 className="w-3 h-3 text-[#0A52EF] animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          {/* Mini progress bar */}
          <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0A52EF] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {/* Product cards */}
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto px-3 py-2 space-y-1.5"
        >
          {matches.map((m, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                m.productName
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30"
                  : "bg-gray-50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/30"
              }`}
            >
              {/* Match indicator */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                m.productName ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
              }`}>
                {m.productName
                  ? <Check className="w-3.5 h-3.5 text-white" />
                  : <span className="text-[9px] text-white font-bold">?</span>
                }
              </div>

              {/* Display info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">
                    {m.displayName}
                  </span>
                  {m.fitPercent && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      m.fitPercent >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : m.fitPercent >= 70 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {m.fitPercent}%
                    </span>
                  )}
                </div>
                {m.productName ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {m.productName}
                    </span>
                    {m.pitch && (
                      <span className="text-[9px] bg-[#0A52EF]/10 text-[#0A52EF] px-1 py-0.5 rounded font-mono">
                        {m.pitch}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-400 italic">No match found</span>
                )}
              </div>
            </div>
          ))}

          {/* Matching indicator for remaining */}
          {isMatching && matches.length < total && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0A52EF]/5 border border-[#0A52EF]/10">
              <Loader2 className="w-4 h-4 text-[#0A52EF] animate-spin shrink-0" />
              <span className="text-[10px] text-[#0A52EF] font-medium">
                Matching {matches.length + 1} of {total}...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
