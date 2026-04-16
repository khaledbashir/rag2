"use client";

/**
 * Admin — Submittal Compiler (prototype, hidden)
 *
 * Not linked in any nav. Accessible only to ADMIN role via direct URL
 * /admin/submittal-compiler. This is the v0 prototype for parsing a signed
 * contract's Exhibit A. Stitcher + transmittal cover come later.
 */

import React, { useState } from "react";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface Sku {
  modelNumber: string;
  manufacturer?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  category?: string | null;
}

interface ExtractionResult {
  project: {
    name: string | null;
    client: string | null;
    venue: string | null;
    contractor: string | null;
    effectiveDate: string | null;
    totalContractValue: number | null;
  };
  skus: Sku[];
  nonSkuLineItems: Array<{ description: string; amount: number | null }>;
  warnings: string[];
  extractionLog: {
    exhibitALocated: boolean;
    exhibitAStartPage: number | null;
    skuTableRowsCounted: number;
    reachedEndOfDocument: boolean;
    notes: string;
  };
}

export default function SubmittalCompilerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  async function handleParse() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/contracts/parse-exhibit-a", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data.result);
    } catch (e: any) {
      setError(e?.message || "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  const fmtUSD = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Submittal Compiler — Prototype</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hidden prototype. Upload a signed ANC contract PDF, Gemini extracts Exhibit A.
          Phase 0 only — no stitching / cover / datasheet append yet.
        </p>
      </div>

      {/* Upload */}
      <div className="border border-dashed border-border rounded-lg p-8 bg-muted/20">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
            <Upload className="w-4 h-4" />
            {file ? "Change file" : "Choose contract PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setResult(null);
                  setError(null);
                }
              }}
            />
          </label>
          {file && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            </div>
          )}
          <button
            onClick={handleParse}
            disabled={!file || loading}
            className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? "Extracting..." : "Parse Exhibit A"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">Extraction failed</div>
            <div className="text-sm mt-1 font-mono">{error}</div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-6">
          {/* Project */}
          <section className="border border-border rounded-lg p-4 bg-background">
            <h2 className="text-lg font-semibold mb-3">Project</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Name:</span> {result.project.name || "—"}</div>
              <div><span className="text-muted-foreground">Client:</span> {result.project.client || "—"}</div>
              <div><span className="text-muted-foreground">Venue:</span> {result.project.venue || "—"}</div>
              <div><span className="text-muted-foreground">Contractor:</span> {result.project.contractor || "—"}</div>
              <div><span className="text-muted-foreground">Effective:</span> {result.project.effectiveDate || "—"}</div>
              <div><span className="text-muted-foreground">Contract value:</span> {fmtUSD(result.project.totalContractValue)}</div>
            </div>
          </section>

          {/* SKUs */}
          <section className="border border-border rounded-lg bg-background overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">SKUs in Exhibit A ({result.skus.length})</h2>
              <span className="text-xs text-muted-foreground">
                Page {result.extractionLog.exhibitAStartPage ?? "?"} · {result.extractionLog.skuTableRowsCounted} rows counted
              </span>
            </div>
            {result.skus.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No SKUs extracted.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Model #</th>
                    <th className="text-left px-4 py-2">Mfr</th>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-left px-4 py-2">Category</th>
                    <th className="text-right px-4 py-2">Qty</th>
                    <th className="text-right px-4 py-2">Unit $</th>
                    <th className="text-right px-4 py-2">Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skus.map((s, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{s.modelNumber}</td>
                      <td className="px-4 py-2">{s.manufacturer || "—"}</td>
                      <td className="px-4 py-2">{s.description || "—"}</td>
                      <td className="px-4 py-2">{s.category || "—"}</td>
                      <td className="px-4 py-2 text-right">{s.quantity}</td>
                      <td className="px-4 py-2 text-right">{fmtUSD(s.unitPrice)}</td>
                      <td className="px-4 py-2 text-right">{fmtUSD(s.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Non-SKU items */}
          {result.nonSkuLineItems.length > 0 && (
            <section className="border border-border rounded-lg bg-background overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold">Non-SKU line items ({result.nonSkuLineItems.length})</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.nonSkuLineItems.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2">{item.description}</td>
                      <td className="px-4 py-2 text-right">{fmtUSD(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <section className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-2">Warnings</h3>
              <ul className="list-disc list-inside text-sm text-amber-300 space-y-1">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </section>
          )}

          {/* Extraction log */}
          <section className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-muted/20">
            <div className="font-mono">
              Exhibit A located: {String(result.extractionLog.exhibitALocated)} ·{" "}
              Reached end: {String(result.extractionLog.reachedEndOfDocument)}
            </div>
            {result.extractionLog.notes && (
              <div className="mt-1 italic">{result.extractionLog.notes}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
