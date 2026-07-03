"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2, Calculator, AlertTriangle, Info, Loader2, BrainCircuit, FileSpreadsheet, Sparkles } from "lucide-react";

type ScreenRow = {
  name: string;
  pixelWidth: string;
  pixelHeight: string;
  liveVideo: boolean;
  outdoor: boolean;
  physicalWidthFt: string;
};

type BomLine = {
  sku: string;
  displayName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  rationale: string;
  flags: string[];
};

type ProcessorAdvisory = {
  name: string;
  totalPixels: number;
  portsNeeded: number;
  recommendedClass: string;
  closets: number;
  fiberConverterPairs: number;
  outdoorRacks: number;
  flags: string[];
};

type ScreenPlan = {
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  outputs: number;
  renderPrimaries: number;
  renderServersTotal: number;
  serverSku: string | null;
  storageTier: string;
  dualVideoCard: boolean;
  liveVideo: boolean;
  sharedServer: boolean;
};

type ReasoningStep = { phase: string; text: string };

type AutoBomResponse = {
  lines: BomLine[];
  reasoning: ReasoningStep[];
  screenPlans: ScreenPlan[];
  processorAdvisories: ProcessorAdvisory[];
  totals: { hardware: number; softCost: number; license: number; grand: number };
  counts: {
    uiServers: number;
    renderServers: number;
    totalServers: number;
    workstations: number;
    racks: number;
    matrixSize: number | null;
    matrixInputsNeeded: number;
  };
  reviewFlags: string[];
  assumptions: string[];
  catalog: { itemCount: number; lastPriceUpdate: string | null };
};

const CATEGORY_LABEL: Record<string, string> = {
  SERVER_EQUIPMENT: "Server Equipment",
  SERVER_ADDON: "Server Add-ons",
  USER_STATION: "User Stations",
  INTERCONNECT: "Interconnect",
  TRIGGER_HARDWARE: "Trigger Hardware",
  ROUTER: "Matrix / Router",
  KVM: "KVM",
  RACK: "Racks",
  INTEGRATION: "Install Labor",
  LICENSE: "Licensing",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/**
 * Animated decision-trail panel — reveals the engine's reasoning step by step
 * like a live train of thought, one phase at a time.
 */
function ReasoningPanel({ steps }: { steps: ReasoningStep[] }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    if (steps.length === 0) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setVisibleCount(i);
      if (i >= steps.length) clearInterval(timer);
    }, 420);
    return () => clearInterval(timer);
  }, [steps]);

  const thinking = visibleCount < steps.length;

  return (
    <section className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <BrainCircuit className={`w-4 h-4 ${thinking ? "animate-pulse text-primary" : "text-primary"}`} />
        <h2 className="text-lg font-semibold">How it thought through this job</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {thinking ? `reasoning… ${visibleCount}/${steps.length}` : `${steps.length} decisions`}
        </span>
      </div>
      <ol className="p-4 space-y-3">
        {steps.slice(0, visibleCount).map((step, i) => (
          <li
            key={`${step.phase}-${i}`}
            className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1 duration-500"
          >
            <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">{step.phase}</span>
              <p className="text-sm text-foreground/90 leading-relaxed">{step.text}</p>
            </div>
          </li>
        ))}
        {thinking && (
          <li className="flex gap-3 items-center text-sm text-muted-foreground pl-9">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> working through the next rule…
          </li>
        )}
      </ol>
    </section>
  );
}

/**
 * Live LLM expert review — streams the model's actual reasoning tokens
 * (visible thinking) followed by its verdict over the generated BOM.
 */
function AiReviewPanel({ getPayload }: { getPayload: () => Record<string, unknown> }) {
  const [running, setRunning] = useState(false);
  // Reasoning tokens are consumed but never rendered — they only advance a
  // progress indicator (Ahmad 2026-07-03: raw model reasoning reads as noise).
  const [thoughtChars, setThoughtChars] = useState(0);
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setThoughtChars(0);
    setAnswer("");
    setError(null);
    try {
      const res = await fetch("/api/cms/livesync-auto-bom/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok || !res.body) {
        setError("AI review is unavailable right now.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const { type, text } = JSON.parse(line.slice(5).trim());
            if (type === "meta") setModel(text);
            else if (type === "thinking") setThoughtChars((prev) => prev + text.length);
            else if (type === "answer") setAnswer((prev) => prev + text);
            else if (type === "error") setError(text);
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch {
      setError("AI review is unavailable right now.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className={`w-4 h-4 text-primary ${running ? "animate-pulse" : ""}`} />
        <h2 className="text-lg font-semibold">AI expert review</h2>
        {model && <span className="text-xs text-muted-foreground">model: {model}</span>}
        <button
          className="ml-auto px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm flex items-center gap-2 disabled:opacity-60"
          onClick={run}
          disabled={running}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {answer || thoughtChars ? "Review again" : "Run AI review"}
        </button>
      </div>
      {(running || answer || error) && (
        <div className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
          {running && !answer && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 animate-pulse text-primary" />
              {thoughtChars
                ? `Reviewing the package — checking quantities, redundancy, gaps… (${Math.round(thoughtChars / 5).toLocaleString()} checks)`
                : "Reading the package…"}
            </p>
          )}
          {answer && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">expert verdict</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{answer}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const emptyScreen = (): ScreenRow => ({
  name: "",
  pixelWidth: "",
  pixelHeight: "",
  liveVideo: false,
  outdoor: false,
  physicalWidthFt: "",
});

export default function LivesyncCalculatorClient() {
  const [screens, setScreens] = useState<ScreenRow[]>([
    { name: "Main Video Board", pixelWidth: "7680", pixelHeight: "1000", liveVideo: false, outdoor: false, physicalWidthFt: "" },
  ]);
  const [sportsVenue, setSportsVenue] = useState(true);
  const [includeLicense, setIncludeLicense] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoBomResponse | null>(null);

  const buildPayload = () => ({
    sportsVenue,
    includeLicense,
    screens: screens
      .filter((s) => s.pixelWidth && s.pixelHeight)
      .map((s, i) => ({
        name: s.name || `Screen ${i + 1}`,
        pixelWidth: Number(s.pixelWidth),
        pixelHeight: Number(s.pixelHeight),
        liveVideo: s.liveVideo,
        outdoor: s.outdoor,
        physicalWidthFt: s.physicalWidthFt ? Number(s.physicalWidthFt) : null,
      })),
  });

  const exportExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/cms/livesync-auto-bom/export.xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), jobName: screens[0]?.name ? `Control System — ${screens[0].name}` : "Control System Estimate" }),
      });
      if (!res.ok) {
        setError("Failed to generate the Excel export.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "Control_System_BOM.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate the Excel export.");
    } finally {
      setExporting(false);
    }
  };

  const updateScreen = (index: number, patch: Partial<ScreenRow>) => {
    setScreens((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (payload.screens.length === 0) {
        setError("Add at least one screen with pixel width and height.");
        return;
      }
      const res = await fetch("/api/cms/livesync-auto-bom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to generate the bill of materials.");
        return;
      }
      setResult(data as AutoBomResponse);
    } catch {
      setError("Failed to generate the bill of materials.");
    } finally {
      setLoading(false);
    }
  };

  const grouped = result
    ? CATEGORY_ORDER.map((cat) => ({
        category: cat,
        lines: result.lines.filter((l) => l.category === cat),
      })).filter((g) => g.lines.length > 0)
    : [];
  const ungrouped = result
    ? result.lines.filter((l) => !CATEGORY_ORDER.includes(l.category))
    : [];

  return (
    <div className="space-y-8">
      {/* ── Inputs ── */}
      <section className="border border-border rounded-lg p-4 bg-muted/30 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator className="w-4 h-4" /> Screens on this job
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-left">
                <th className="px-3 py-2">Screen name</th>
                <th className="px-3 py-2">Pixel width</th>
                <th className="px-3 py-2">Pixel height</th>
                <th className="px-3 py-2">Physical width (ft)</th>
                <th className="px-3 py-2 text-center">Live video</th>
                <th className="px-3 py-2 text-center">Outdoor</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {screens.map((screen, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <input
                      className="w-full px-2 py-1 rounded border border-border bg-background text-sm"
                      placeholder={`Screen ${i + 1}`}
                      value={screen.name}
                      onChange={(e) => updateScreen(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      className="w-28 px-2 py-1 rounded border border-border bg-background text-sm text-right"
                      placeholder="7680"
                      value={screen.pixelWidth}
                      onChange={(e) => updateScreen(i, { pixelWidth: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      className="w-28 px-2 py-1 rounded border border-border bg-background text-sm text-right"
                      placeholder="1000"
                      value={screen.pixelHeight}
                      onChange={(e) => updateScreen(i, { pixelHeight: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      className="w-28 px-2 py-1 rounded border border-border bg-background text-sm text-right"
                      placeholder="optional"
                      value={screen.physicalWidthFt}
                      onChange={(e) => updateScreen(i, { physicalWidthFt: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={screen.liveVideo}
                      onChange={(e) => updateScreen(i, { liveVideo: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={screen.outdoor}
                      onChange={(e) => updateScreen(i, { outdoor: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      className="p-1 rounded hover:bg-muted text-orange-500"
                      onClick={() => setScreens((prev) => prev.filter((_, j) => j !== i))}
                      disabled={screens.length === 1}
                      title="Remove screen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="px-3 py-2 rounded-md border border-border text-sm flex items-center gap-2 hover:bg-muted"
            onClick={() => setScreens((prev) => [...prev, emptyScreen()])}
          >
            <Plus className="w-4 h-4" /> Add screen
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={sportsVenue}
              onChange={(e) => setSportsVenue(e.target.checked)}
            />
            Sports venue (adds scoring-data intake)
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={includeLicense}
              onChange={(e) => setIncludeLicense(e.target.checked)}
            />
            Include software license
          </label>
          <button
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm flex items-center gap-2 ml-auto"
            onClick={generate}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Build the BOM
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
      </section>

      {result && (
        <>
          {/* ── Reasoning trail ── */}
          {result.reasoning?.length > 0 && <ReasoningPanel steps={result.reasoning} />}

          {/* ── Live model review ── */}
          <AiReviewPanel getPayload={buildPayload} />

          {/* ── Summary ── */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Total servers", `${result.counts.totalServers}`, `${result.counts.renderServers} render + ${result.counts.uiServers} UI`],
              ["Matrix", result.counts.matrixSize ? `${result.counts.matrixSize}×${result.counts.matrixSize}` : "Needs design", `${result.counts.matrixInputsNeeded} inputs needed`],
              ["Racks / labor", `${result.counts.racks}`, `${result.counts.racks} week(s) install`],
              ["System total", money(result.totals.grand), "hardware + labor" + (result.totals.license > 0 ? " + license" : "")],
            ].map(([label, value, sub]) => (
              <div key={label as string} className="border border-border rounded-lg p-4 bg-muted/30">
                <p className="text-xs font-normal text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </section>

          {/* ── Per-screen plan ── */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Per-screen server plan</h2>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-3 py-2">Screen</th>
                    <th className="px-3 py-2 text-right">Pixels</th>
                    <th className="px-3 py-2 text-right">Outputs</th>
                    <th className="px-3 py-2 text-right">Render servers</th>
                    <th className="px-3 py-2">Storage</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {result.screenPlans.map((plan) => (
                    <tr key={plan.name} className="border-t border-border">
                      <td className="px-3 py-1.5">{plan.name}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">
                        {plan.pixelWidth}×{plan.pixelHeight}
                      </td>
                      <td className="px-3 py-1.5 text-right">{plan.outputs}</td>
                      <td className="px-3 py-1.5 text-right">
                        {plan.renderServersTotal} ({plan.renderPrimaries}+{plan.renderPrimaries} backup)
                      </td>
                      <td className="px-3 py-1.5">{plan.storageTier}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {[
                          plan.liveVideo && "live video capture",
                          plan.dualVideoCard && "dual video card",
                          plan.sharedServer && "shares a server with other small screens",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── BOM ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Bill of materials</h2>
              <button
                className="ml-auto px-3 py-1.5 rounded border border-border text-sm flex items-center gap-2 hover:bg-muted"
                onClick={exportExcel}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Export Excel
              </button>
            </div>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                    <th className="px-3 py-2">Why it&apos;s here</th>
                  </tr>
                </thead>
                <tbody>
                  {[...grouped, ...(ungrouped.length ? [{ category: "OTHER", lines: ungrouped }] : [])].map(
                    (group) => (
                      <React.Fragment key={group.category}>
                        <tr className="bg-muted/40">
                          <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {CATEGORY_LABEL[group.category] ?? group.category}
                          </td>
                        </tr>
                        {group.lines.map((line) => (
                          <tr key={line.sku + line.rationale} className="border-t border-border align-top">
                            <td className="px-3 py-1.5">
                              <div>{line.displayName}</div>
                              <div className="font-mono text-xs text-muted-foreground">{line.sku}</div>
                            </td>
                            <td className="px-3 py-1.5 text-right">{line.quantity}</td>
                            <td className="px-3 py-1.5 text-right">{money(line.unitPrice)}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{money(line.lineTotal)}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-md">
                              {line.rationale}
                              {line.flags.map((flag) => (
                                <div key={flag} className="mt-1 text-amber-600 dark:text-amber-500 flex items-start gap-1">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {flag}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  )}
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      System total
                      <span className="ml-3 text-xs font-normal text-muted-foreground">
                        hardware {money(result.totals.hardware)} · labor {money(result.totals.softCost)}
                        {result.totals.license > 0 ? ` · license ${money(result.totals.license)}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{money(result.totals.grand)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            {result.catalog.lastPriceUpdate && (
              <p className="text-xs text-muted-foreground">
                Prices from the rate card ({result.catalog.itemCount} items), last updated{" "}
                {new Date(result.catalog.lastPriceUpdate).toLocaleDateString()}.
              </p>
            )}
          </section>

          {/* ── Review flags ── */}
          <section className="border border-amber-500/40 rounded-lg p-4 bg-amber-500/5 space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" /> Needs human review
            </h2>
            <ul className="space-y-1 text-sm">
              {result.reviewFlags.map((flag) => (
                <li key={flag} className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-500 mt-0.5">•</span> {flag}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Processor advisory ── */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Processing advisory (per screen)</h2>
            <p className="text-sm text-muted-foreground">
              Port counts and layout math for the display processing side. Informational —
              processor pricing lives on the LED rate card.
            </p>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-3 py-2">Screen</th>
                    <th className="px-3 py-2 text-right">Total pixels</th>
                    <th className="px-3 py-2 text-right">Ports needed</th>
                    <th className="px-3 py-2">Recommended processor</th>
                    <th className="px-3 py-2 text-right">Closets / IDFs</th>
                    <th className="px-3 py-2 text-right">Fiber pairs</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {result.processorAdvisories.map((adv) => (
                    <tr key={adv.name} className="border-t border-border align-top">
                      <td className="px-3 py-1.5">{adv.name}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">
                        {adv.totalPixels.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right">{adv.portsNeeded}</td>
                      <td className="px-3 py-1.5">{adv.recommendedClass}</td>
                      <td className="px-3 py-1.5 text-right">{adv.closets}</td>
                      <td className="px-3 py-1.5 text-right">{adv.fiberConverterPairs}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-xs">
                        {adv.flags.join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Assumptions ── */}
          <section className="border border-border rounded-lg p-4 bg-muted/30 space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Info className="w-4 h-4" /> Standing assumptions
            </h2>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {result.assumptions.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
