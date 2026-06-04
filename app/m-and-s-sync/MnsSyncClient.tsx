"use client";

import { useState } from "react";

type ImportResult = {
  ok: boolean;
  updated: number;
  skipped: number;
  badId: number;
  errors: string[];
};

export default function MnsSyncClient() {
  const [season, setSeason] = useState("2026");
  const [league, setLeague] = useState("MLB");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportUrl = `/api/render/m-and-s-inventory-xlsx?season=${encodeURIComponent(
    season,
  )}&league=${encodeURIComponent(league)}`;

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/render/m-and-s-inventory-import", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `Upload failed (${res.status})`);
      } else {
        setResult(body as ImportResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px", fontFamily: "system-ui, sans-serif", color: "#1A1A18" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>Media &amp; Sponsorship — Inventory Sync</h1>
      <p style={{ color: "#5F5F5A", marginBottom: 28, lineHeight: 1.6 }}>
        Download the live inventory workbook, fill in <strong>Slot Rate</strong> and{" "}
        <strong>ANC Margin</strong> on the <em>Deal Value</em> sheet, then upload it back here.
        Margin&nbsp;% and the value rollups update automatically.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "flex-end" }}>
        <label style={{ fontSize: 13 }}>
          Season
          <input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", border: "1px solid #D4D4D0", borderRadius: 8, width: 100 }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          League
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "6px 10px", border: "1px solid #D4D4D0", borderRadius: 8 }}
          >
            <option>MLB</option>
            <option>NBA</option>
            <option>NHL</option>
            <option>MLS</option>
            <option>NFL</option>
          </select>
        </label>
        <a
          href={exportUrl}
          style={{ padding: "9px 16px", background: "#185FA5", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 500 }}
        >
          ↓ Download inventory
        </a>
      </div>

      <div style={{ border: "1px solid #EBEBEB", borderRadius: 12, padding: 24, background: "#F7F7F5" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Upload edited workbook</h2>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ fontSize: 14, marginBottom: 16, display: "block" }}
        />
        <button
          onClick={handleUpload}
          disabled={!file || busy}
          style={{
            padding: "9px 18px",
            background: !file || busy ? "#9A9A96" : "#3B6D11",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: !file || busy ? "default" : "pointer",
          }}
        >
          {busy ? "Uploading…" : "Upload & sync values"}
        </button>

        {error && (
          <div style={{ marginTop: 16, padding: 12, background: "#FADBD8", color: "#922B21", borderRadius: 8, fontSize: 14 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16, padding: 12, background: result.ok ? "#D4F4DD" : "#FAEEDA", borderRadius: 8, fontSize: 14, lineHeight: 1.7 }}>
            <strong>{result.ok ? "Sync complete." : "Synced with warnings."}</strong>
            <br />
            Updated: {result.updated} · Skipped (blank): {result.skipped}
            {result.badId > 0 ? ` · Bad ID rows: ${result.badId}` : ""}
            {result.errors.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary>{result.errors.length} error(s)</summary>
                <ul>
                  {result.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#922B21" }}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
