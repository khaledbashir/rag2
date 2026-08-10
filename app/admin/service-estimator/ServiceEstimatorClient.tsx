"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Copy,
  Download,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { normalizeEstimatorDraft } from "@/lib/serviceEstimator/draft";
import { calculateServiceEstimateOptions, PANTHERS_SERVICE_REFERENCE } from "@/lib/serviceEstimator/engine";
import {
  addOption,
  hasMultipleOptions,
  materializeOptions,
  patchOption,
  removeOption,
  renameOption,
  resolveSelectedOption,
} from "@/lib/serviceEstimator/options";
import type {
  BundleDiscountMode,
  ServiceCapexInput,
  ServiceEstimatorInput,
  ServiceEstimatorOption,
  ServiceEventInput,
  ServiceFlatAmount,
} from "@/lib/serviceEstimator/types";
import { DEFAULT_SECTION_LABELS } from "@/lib/serviceEstimator/types";

/** A calculated service line — days x technicians x rate, the original model. */
const calculatedLine = (
  line: Pick<ServiceEventInput, "id" | "name" | "days" | "technicians" | "clientDayRate" | "technicianDayCost">,
): ServiceEventInput => ({
  ...line,
  pricingMode: "calculated",
  flatRevenue: [],
  flatCost: [],
  flatEscalates: false,
});

/**
 * A typed line — Natalia, 2026-07-30: "I just want to put like a number".
 * LiveSync licences, tech support and parts warranty are all priced this way.
 */
const flatLine = (id: string, name: string): ServiceEventInput => ({
  id,
  name,
  pricingMode: "flat",
  days: 0,
  technicians: 0,
  clientDayRate: 0,
  technicianDayCost: 0,
  flatRevenue: [],
  flatCost: [],
  flatEscalates: false,
});

/** Parse a typed cell: a number, or the word "Included". Blank reads as zero. */
const parseFlatAmount = (raw: string): ServiceFlatAmount => {
  const trimmed = raw.trim();
  if (/^inc(luded)?$/i.test(trimmed)) return "included";
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const formatFlatAmount = (amount: ServiceFlatAmount | undefined): string => {
  if (amount === undefined) return "";
  if (amount === "included") return "Included";
  return String(amount);
};

/** Grow or shrink a typed year list to match the contract term. */
const sizeToTerm = (values: ServiceFlatAmount[], termYears: number): ServiceFlatAmount[] =>
  Array.from({ length: termYears }, (_, index) => values[index] ?? 0);

const STORAGE_KEY = "anc-service-estimator-draft-v1";

const createBlankInput = (): ServiceEstimatorInput => ({
  clientName: "",
  venueName: "",
  location: "",
  contractStart: "",
  contractEnd: "",
  paymentTerms: "Six equal monthly installments per Contract Year",
  scopeOfServices: "",
  currency: "USD",
  termStartYear: 2026,
  termYears: 3,
  revenueEscalationPct: 0,
  costEscalationPct: 0,
  bundleDiscountMode: "included-in-rates",
  bundleDiscountPct: 20,
  events: [
    calculatedLine({
      id: "pre-event-support",
      name: "Pre Event Hardware Support",
      days: 0,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    }),
    calculatedLine({
      id: "event-support",
      name: "Event Hardware Support",
      days: 0,
      technicians: 2,
      clientDayRate: 850,
      technicianDayCost: 280,
    }),
  ],
  breakFix: {
    enabled: true,
    label: "Break/Fix Hardware Maintenance",
    pricingMode: "calculated",
    days: 0,
    technicians: 2,
    hoursPerDay: 8,
    technicianHourlyCost: 35,
    priceMultiplier: 1.62,
    flatRevenue: [],
    flatCost: [],
    flatEscalates: false,
  },
  options: [],
  capex: [],
  partsWarranty: { enabled: false, title: "Parts Warranty", columns: [], rows: [] },
  sectionLabels: { ...DEFAULT_SECTION_LABELS },
  marketingOpportunityValue: 0,
  marketingSharePct: 20,
});

const cloneInput = (input: ServiceEstimatorInput): ServiceEstimatorInput =>
  JSON.parse(JSON.stringify(input)) as ServiceEstimatorInput;

const numberValue = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number, currency: string) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

const percent = (value: number) =>
  value.toLocaleString("en-US", { style: "percent", maximumFractionDigits: 1 });

const inputClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

const numberInputClass = `${inputClass} text-right tabular-nums`;

/**
 * A typed year cell — a number, or the word "Included".
 *
 * This has to hold the user's raw keystrokes while they are mid-word. The cell
 * is a controlled input whose value is re-derived from the parsed model, so
 * formatting it on every keystroke made the word impossible to type: "I" does
 * not parse, becomes 0, and the field rewrites itself to "0" before the second
 * letter lands. Only a paste ever worked.
 *
 * So the draft text wins while the field is focused, and the cell snaps to the
 * canonical value on blur. The model still updates on every keystroke, so the
 * totals below stay live.
 */
export function FlatAmountInput({
  value,
  onRawChange,
  className,
}: {
  value: ServiceFlatAmount | undefined;
  onRawChange: (raw: string) => void;
  className?: string;
}) {
  const canonical = formatFlatAmount(value);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className={className}
      value={draft ?? canonical}
      placeholder="0"
      onChange={(e) => {
        setDraft(e.target.value);
        onRawChange(e.target.value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export default function ServiceEstimatorClient() {
  const [input, setInput] = useState<ServiceEstimatorInput>(createBlankInput);
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  /**
   * Which option the service-line editor is pointed at. An estimate with one
   * option behaves exactly as it did before options existed — the tab strip
   * only appears once an author asks for alternatives.
   */
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const options = useMemo(() => materializeOptions(input), [input]);
  const selectedOption = useMemo(
    () => resolveSelectedOption(input, selectedOptionId),
    [input, selectedOptionId],
  );
  const pricedOptions = useMemo(() => calculateServiceEstimateOptions(input), [input]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === selectedOption.id),
  );
  /** The preview always shows the option being edited, not just the first. */
  const result = pricedOptions[selectedIndex].result;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // A saved draft was written by whichever build of this page last ran, so
      // it is missing every field added since. It is restored through the
      // normalizer, never cast — a draft from an older build used to take the
      // whole page down on load, and stayed down because it was read back on
      // every reload.
      if (saved) setInput(normalizeEstimatorDraft(JSON.parse(saved), createBlankInput()));
    } catch {
      // A malformed browser draft should not block a fresh estimate.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
  }, [hydrated, input]);

  const patchInput = <K extends keyof ServiceEstimatorInput>(key: K, value: ServiceEstimatorInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  /**
   * Every service-line write lands on the option currently being edited. The
   * helpers mirror option one back onto the top-level lines, so a single-option
   * estimate is untouched by any of this.
   */
  const patchSelectedOption = (patch: Partial<Omit<ServiceEstimatorOption, "id">>) => {
    setInput((current) =>
      patchOption(current, resolveSelectedOption(current, selectedOptionId).id, patch),
    );
  };

  const patchSelectedLines = (
    updater: (events: ServiceEventInput[], current: ServiceEstimatorInput) => ServiceEventInput[],
  ) => {
    setInput((current) => {
      const option = resolveSelectedOption(current, selectedOptionId);
      return patchOption(current, option.id, { events: updater(option.events, current) });
    });
  };

  const patchEvent = (index: number, patch: Partial<ServiceEventInput>) => {
    patchSelectedLines((events) =>
      events.map((event, eventIndex) => (eventIndex === index ? { ...event, ...patch } : event)),
    );
  };

  const addEvent = () => {
    patchSelectedLines((events) => [
      ...events,
      calculatedLine({
        id: crypto.randomUUID(),
        name: `Event Support ${events.length + 1}`,
        days: 0,
        technicians: 2,
        clientDayRate: events[0]?.clientDayRate || 850,
        technicianDayCost: events[0]?.technicianDayCost || 280,
      }),
    ]);
  };

  /** A typed line: LiveSync licence, tech support, parts warranty, white glove. */
  const addFlatEvent = () => {
    patchSelectedLines((events) => [...events, flatLine(crypto.randomUUID(), "New Charge")]);
  };

  /**
   * An add-on service. Natalia, 2026-08-11: "we need an option to say optional
   * add on and add as many services as needed" — the same line as any other,
   * named so it reads as an add-on wherever it lands.
   */
  const addAddOnEvent = () => {
    patchSelectedLines((events) => [
      ...events,
      flatLine(crypto.randomUUID(), `Optional Add-On ${events.filter((event) => event.name.startsWith("Optional Add-On")).length + 1}`),
    ]);
  };

  const patchFlatValue = (
    index: number,
    field: "flatRevenue" | "flatCost",
    yearIndex: number,
    raw: string,
  ) => {
    patchSelectedLines((events, current) =>
      events.map((event, eventIndex) => {
        if (eventIndex !== index) return event;
        const values = sizeToTerm(event[field], current.termYears);
        values[yearIndex] = parseFlatAmount(raw);
        return { ...event, [field]: values };
      }),
    );
  };

  const patchBreakFix = (patch: Partial<ServiceEstimatorOption["breakFix"]>) => {
    setInput((current) => {
      const option = resolveSelectedOption(current, selectedOptionId);
      return patchOption(current, option.id, { breakFix: { ...option.breakFix, ...patch } });
    });
  };

  const handleAddOption = () => {
    setInput((current) => {
      const { input: next, addedId } = addOption(current, resolveSelectedOption(current, selectedOptionId).id);
      setSelectedOptionId(addedId);
      return next;
    });
  };

  const handleRemoveOption = (id: string) => {
    setInput((current) => {
      const next = removeOption(current, id);
      if (id === selectedOptionId) setSelectedOptionId(materializeOptions(next)[0].id);
      return next;
    });
  };

  const patchSectionLabel = (key: keyof typeof DEFAULT_SECTION_LABELS, value: string) => {
    setInput((current) => ({
      ...current,
      sectionLabels: { ...current.sectionLabels, [key]: value },
    }));
  };

  const removeEvent = (index: number) => {
    patchSelectedLines((events) => events.filter((_, eventIndex) => eventIndex !== index));
  };

  const patchCapex = (index: number, patch: Partial<ServiceCapexInput>) => {
    setInput((current) => ({
      ...current,
      capex: current.capex.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const addCapex = () => {
    setInput((current) => ({
      ...current,
      capex: [
        ...current.capex,
        {
          id: crypto.randomUUID(),
          name: `Capital Item ${current.capex.length + 1}`,
          amount: 0,
          usefulLifeYears: 5,
        },
      ],
    }));
  };

  const removeCapex = (index: number) => {
    setInput((current) => ({
      ...current,
      capex: current.capex.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const exportWorkbook = async () => {
    setExportError(null);
    if (!input.clientName.trim()) {
      setExportError("Add the client or team name before exporting.");
      return;
    }
    const empty = materializeOptions(input).find((option) => option.events.length === 0);
    if (empty) {
      setExportError(
        hasMultipleOptions(input)
          ? `${empty.name} has no service lines. Add one, or remove the option.`
          : "Add at least one service line before exporting.",
      );
      return;
    }

    setExporting(true);
    try {
      const response = await fetch("/api/service-estimator/export.xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const issue = payload?.issues?.[0];
        throw new Error(issue ? `${issue.path}: ${issue.message}` : payload?.error || "Export failed");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || "ANC_Service_Estimate.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const firstYear = result.years[0];
  const yearHeadings = result.yearLabels;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">Draft autosaved in this browser</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Rate choices remain editable until Alexis confirms the standard service rate card.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setInput(cloneInput(PANTHERS_SERVICE_REFERENCE))}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Load Panthers Reference
          </button>
          <button
            type="button"
            onClick={() => setInput(createBlankInput())}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
            New Estimate
          </button>
          <button
            type="button"
            onClick={exportWorkbook}
            disabled={exporting}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Building Workbook…" : "Export Formula Workbook"}
          </button>
        </div>
      </div>

      {exportError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {exportError}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          eyebrow="Step 1"
          title="Project and contract"
          copy="These values populate the Project Overview and client-facing service schedule."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Client / Team">
            <input className={inputClass} value={input.clientName} onChange={(event) => patchInput("clientName", event.target.value)} placeholder="Carolina Panthers" />
          </Field>
          <Field label="Venue / Stadium">
            <input className={inputClass} value={input.venueName} onChange={(event) => patchInput("venueName", event.target.value)} placeholder="Bank of America Stadium" />
          </Field>
          <Field label="Location">
            <input className={inputClass} value={input.location} onChange={(event) => patchInput("location", event.target.value)} placeholder="Charlotte, NC" />
          </Field>
          <Field label="Term Start">
            <input className={inputClass} value={input.contractStart} onChange={(event) => patchInput("contractStart", event.target.value)} placeholder="August 1, 2026" />
          </Field>
          <Field label="Term End">
            <input className={inputClass} value={input.contractEnd} onChange={(event) => patchInput("contractEnd", event.target.value)} placeholder="July 31, 2029" />
          </Field>
          <Field label="Payment Terms">
            <input className={inputClass} value={input.paymentTerms} onChange={(event) => patchInput("paymentTerms", event.target.value)} />
          </Field>
          <Field
            label="Scope of Services"
            hint="Goes on the cover page. Leave blank to list the service lines you priced below."
          >
            <textarea
              className={`${inputClass} h-24 py-2`}
              value={input.scopeOfServices}
              onChange={(event) => patchInput("scopeOfServices", event.target.value)}
              placeholder="Attachment: scope of services"
            />
          </Field>
          <Field label="First Contract Year">
            <input type="number" min={2000} max={2100} className={numberInputClass} value={input.termStartYear} onChange={(event) => patchInput("termStartYear", numberValue(event.target.value))} />
          </Field>
          <Field label="Term Length" hint="Supports 1–10 contract years.">
            <input type="number" min={1} max={10} className={numberInputClass} value={input.termYears} onChange={(event) => patchInput("termYears", Math.min(10, Math.max(1, numberValue(event.target.value))))} />
          </Field>
          <Field label="Currency">
            <select className={inputClass} value={input.currency} onChange={(event) => patchInput("currency", event.target.value as ServiceEstimatorInput["currency"])}>
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
        </div>
      </section>

      {/*
        Options — Natalia, 2026-08-11: "we have now 3 cost sheet going for one
        thing … also has to be options — option 1,2,3 … all within one project
        aka excel." One estimate carries the alternatives; each gets its own tab
        in the exported workbook.
      */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle
            eyebrow="Options"
            title="Priced alternatives"
            copy="Price more than one version of this deal in a single estimate — with and without event support, or with an add-on package. Each option exports as its own tab in the same workbook."
          />
          <button
            type="button"
            onClick={handleAddOption}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Copy className="h-4 w-4" /> Add Option
          </button>
        </div>

        {hasMultipleOptions(input) ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {options.map((option, index) => {
                const active = option.id === selectedOption.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedOptionId(option.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>{option.name}</span>
                    <span className={active ? "opacity-80" : "opacity-60"}>
                      {money(pricedOptions[index].result.totalContractIncome, input.currency)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-end">
              <Field label="Option name" hint="Becomes the tab name in the exported workbook.">
                <input
                  className={inputClass}
                  value={selectedOption.name}
                  onChange={(event) =>
                    setInput((current) => renameOption(current, selectedOption.id, event.target.value))
                  }
                  placeholder={`Option ${selectedIndex + 1}`}
                />
              </Field>
              <button
                type="button"
                onClick={() => handleRemoveOption(selectedOption.id)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" /> Remove this option
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            This estimate prices one version. Add an option to price an alternative alongside it — same project, same workbook.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle
            eyebrow={hasMultipleOptions(input) ? `Step 2 · ${selectedOption.name}` : "Step 2"}
            title={input.sectionLabels.eventSupport}
            copy="Calculated lines work out days × technicians × rate. Switch a line to Typed and enter the number yourself for each contract year — no calculation is applied. Enter a number, or the word Included when the project already covers that year. Add as many services as the deal needs."
          />
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={addEvent} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted">
              <Plus className="h-4 w-4" /> Calculated Line
            </button>
            <button type="button" onClick={addFlatEvent} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10">
              <Plus className="h-4 w-4" /> Typed Line
            </button>
            <button type="button" onClick={addAddOnEvent} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted">
              <Plus className="h-4 w-4" /> Optional Add-On
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {selectedOption.events.map((event, index) => {
            const yearLine = firstYear?.eventLines[index];
            const isFlat = event.pricingMode === "flat";
            return (
              <div key={event.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={`${inputClass} sm:flex-1`}
                    value={event.name}
                    onChange={(e) => patchEvent(index, { name: e.target.value })}
                    placeholder="Service line name"
                  />
                  <div className="flex items-center gap-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-border">
                      {(["calculated", "flat"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => patchEvent(index, { pricingMode: mode })}
                          className={`h-9 px-3 text-xs font-semibold transition ${
                            event.pricingMode === mode
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {mode === "calculated" ? "Calculated" : "Type my number"}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvent(index)}
                      disabled={selectedOption.events.length === 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      aria-label={`Remove ${event.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isFlat ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid gap-2" style={{ gridTemplateColumns: `7rem repeat(${input.termYears}, minmax(0,1fr))` }}>
                      <div className="self-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Year</div>
                      {yearHeadings.map((label) => (
                        <div key={label} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                      ))}
                      <div className="self-center text-[11px] font-semibold text-foreground">Client</div>
                      {Array.from({ length: input.termYears }, (_, yearIndex) => (
                        <FlatAmountInput
                          key={`rev-${yearIndex}`}
                          className={numberInputClass}
                          value={event.flatRevenue[yearIndex]}
                          onRawChange={(raw) => patchFlatValue(index, "flatRevenue", yearIndex, raw)}
                        />
                      ))}
                      <div className="self-center text-[11px] font-semibold text-muted-foreground">ANC cost</div>
                      {Array.from({ length: input.termYears }, (_, yearIndex) => (
                        <FlatAmountInput
                          key={`cost-${yearIndex}`}
                          className={numberInputClass}
                          value={event.flatCost[yearIndex]}
                          onRawChange={(raw) => patchFlatValue(index, "flatCost", yearIndex, raw)}
                        />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={event.flatEscalates}
                        onChange={(e) => patchEvent(index, { flatEscalates: e.target.checked })}
                      />
                      Escalate any year left blank from the last number entered. Off means a typed number stays exactly as typed.
                    </label>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <Field label="Days"><input type="number" min={0} step="0.5" className={numberInputClass} value={event.days} onChange={(e) => patchEvent(index, { days: numberValue(e.target.value) })} /></Field>
                    <Field label="Technicians"><input type="number" min={0} step="1" className={numberInputClass} value={event.technicians} onChange={(e) => patchEvent(index, { technicians: numberValue(e.target.value) })} /></Field>
                    <Field label="Client Day Rate"><input type="number" min={0} step="1" className={numberInputClass} value={event.clientDayRate} onChange={(e) => patchEvent(index, { clientDayRate: numberValue(e.target.value) })} /></Field>
                    <Field label="Tech Day Cost"><input type="number" min={0} step="1" className={numberInputClass} value={event.technicianDayCost} onChange={(e) => patchEvent(index, { technicianDayCost: numberValue(e.target.value) })} /></Field>
                  </div>
                )}

                <div className="mt-2 flex justify-end gap-6 text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    {yearHeadings[0]} client:{" "}
                    <span className="font-semibold text-foreground">
                      {yearLine?.included ? "Included" : money(yearLine?.revenue || 0, input.currency)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {yearHeadings[0]} cost: <span className="font-semibold">{money(yearLine?.cost || 0, input.currency)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          eyebrow="Labels"
          title="Section headings"
          copy="Rename any heading to match how this deal is written up. These carry through to the exported workbook."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["eventSupport", "Service lines"],
            ["breakFix", "Break/fix"],
            ["capex", "Capital expenditure"],
            ["clientSchedule", "Client fee schedule"],
            ["internalModel", "Internal model"],
            ["operatingExpenses", "Operating expenses divider"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                value={input.sectionLabels[key]}
                onChange={(event) => patchSectionLabel(key, event.target.value)}
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            eyebrow={hasMultipleOptions(input) ? `Step 3A · ${selectedOption.name}` : "Step 3A"}
            title="Break/fix coverage"
            copy="The source workbook prices break/fix revenue from technician expense × multiplier. Every driver stays visible."
          />
          <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm font-semibold">Include break/fix</span>
            <input type="checkbox" checked={selectedOption.breakFix.enabled} onChange={(event) => patchBreakFix({ enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Line Label"><input className={inputClass} value={selectedOption.breakFix.label} onChange={(event) => patchBreakFix({ label: event.target.value })} /></Field>
            <Field label="Coverage Days"><input type="number" min={0} step="0.5" className={numberInputClass} value={selectedOption.breakFix.days} onChange={(event) => patchBreakFix({ days: numberValue(event.target.value) })} /></Field>
            <Field label="Technicians"><input type="number" min={0} className={numberInputClass} value={selectedOption.breakFix.technicians} onChange={(event) => patchBreakFix({ technicians: numberValue(event.target.value) })} /></Field>
            <Field label="Hours / Day"><input type="number" min={0} step="0.5" className={numberInputClass} value={selectedOption.breakFix.hoursPerDay} onChange={(event) => patchBreakFix({ hoursPerDay: numberValue(event.target.value) })} /></Field>
            <Field label="Technician Hourly Cost"><input type="number" min={0} className={numberInputClass} value={selectedOption.breakFix.technicianHourlyCost} onChange={(event) => patchBreakFix({ technicianHourlyCost: numberValue(event.target.value) })} /></Field>
            <Field label="Price Multiplier" hint="Panthers reference: 1.62"><input type="number" min={0.01} step="0.01" className={numberInputClass} value={selectedOption.breakFix.priceMultiplier} onChange={(event) => patchBreakFix({ priceMultiplier: numberValue(event.target.value) })} /></Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Year 1 Cost</div><div className="mt-1 font-semibold tabular-nums">{money(firstYear?.breakFixCost || 0, input.currency)}</div></div>
            <div><div className="text-xs text-muted-foreground">Year 1 Revenue</div><div className="mt-1 font-semibold tabular-nums text-primary">{money(firstYear?.breakFixRevenue || 0, input.currency)}</div></div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            eyebrow="Step 3B"
            title="Rate and discount controls"
            copy="These were the four open questions for Alexis. The workbook records the selected treatment instead of guessing."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client Revenue Escalation %"><input type="number" min={0} step="0.25" className={numberInputClass} value={input.revenueEscalationPct} onChange={(event) => patchInput("revenueEscalationPct", numberValue(event.target.value))} /></Field>
            <Field label="Technician Cost Escalation %"><input type="number" min={0} step="0.25" className={numberInputClass} value={input.costEscalationPct} onChange={(event) => patchInput("costEscalationPct", numberValue(event.target.value))} /></Field>
            <Field label="Bundle Discount Treatment">
              <select className={inputClass} value={input.bundleDiscountMode} onChange={(event) => patchInput("bundleDiscountMode", event.target.value as BundleDiscountMode)}>
                <option value="included-in-rates">Already included in entered rates</option>
                <option value="apply-to-subtotal">Apply to service subtotal</option>
                <option value="none">No bundle discount</option>
              </select>
            </Field>
            <Field label="Bundle Discount %"><input type="number" min={0} max={100} step="0.25" className={numberInputClass} value={input.bundleDiscountPct} onChange={(event) => patchInput("bundleDiscountPct", numberValue(event.target.value))} /></Field>
            <Field label="Marketing Opportunity Value"><input type="number" min={0} className={numberInputClass} value={input.marketingOpportunityValue} onChange={(event) => patchInput("marketingOpportunityValue", numberValue(event.target.value))} /></Field>
            <Field label="ANC Marketing Share %"><input type="number" min={0} max={100} step="0.25" className={numberInputClass} value={input.marketingSharePct} onChange={(event) => patchInput("marketingSharePct", numberValue(event.target.value))} /></Field>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle eyebrow="Optional" title="Capital expenditures" copy="Add internal equipment or setup costs. Depreciation remains live by useful life; cash impact lands in Contract Year 1." />
          <button type="button" onClick={addCapex} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"><Plus className="h-4 w-4" /> Add Capital Item</button>
        </div>
        {input.capex.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No capital expenditures included.</div>
        ) : (
          <div className="space-y-2">
            {input.capex.map((item, index) => (
              <div key={item.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_180px_180px_auto]">
                <input className={inputClass} value={item.name} onChange={(event) => patchCapex(index, { name: event.target.value })} />
                <input type="number" min={0} className={numberInputClass} value={item.amount} onChange={(event) => patchCapex(index, { amount: numberValue(event.target.value) })} aria-label={`${item.name} amount`} />
                <input type="number" min={1} max={20} className={numberInputClass} value={item.usefulLifeYears} onChange={(event) => patchCapex(index, { usefulLifeYears: Math.max(1, numberValue(event.target.value)) })} aria-label={`${item.name} useful life`} />
                <button type="button" onClick={() => removeCapex(index)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.name}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle eyebrow="Live Preview" title="Client fee schedule and internal economics" copy="The exported client schedule contains revenue only. Technician costs, capex, depreciation, profit, and return stay in the internal calculation sheet." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Contract Income", money(result.totalContractIncome, input.currency)],
            ["Operating Expenses", money(result.totalContractOperatingExpenses, input.currency)],
            ["Contract Profit", money(result.totalContractProfit, input.currency)],
            ["Year 1 Return", percent(firstYear?.returnPct || 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-muted/25 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div></div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Item</th>
                {result.yearLabels.map((label) => <th key={label} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedOption.events.map((event, eventIndex) => (
                <tr key={event.id}><td className="px-4 py-3 font-medium">{event.name}</td>{result.years.map((year) => <td key={year.yearLabel} className="px-4 py-3 text-right tabular-nums">{money(year.eventLines[eventIndex]?.revenue || 0, input.currency)}</td>)}</tr>
              ))}
              {selectedOption.breakFix.enabled ? <tr><td className="px-4 py-3 font-medium">{selectedOption.breakFix.label}</td>{result.years.map((year) => <td key={year.yearLabel} className="px-4 py-3 text-right tabular-nums">{money(year.breakFixRevenue, input.currency)}</td>)}</tr> : null}
              {input.bundleDiscountMode === "apply-to-subtotal" ? <tr className="text-red-700"><td className="px-4 py-3 font-medium">Bundle Discount</td>{result.years.map((year) => <td key={year.yearLabel} className="px-4 py-3 text-right tabular-nums">({money(year.bundleDiscountAmount, input.currency)})</td>)}</tr> : null}
              <tr className="bg-muted/40 font-bold"><td className="px-4 py-3">YEARLY TOTAL</td>{result.years.map((year) => <td key={year.yearLabel} className="px-4 py-3 text-right tabular-nums">{money(year.totalIncome, input.currency)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        {input.bundleDiscountMode === "included-in-rates" && input.bundleDiscountPct > 0 ? <p className="mt-2 text-xs italic text-muted-foreground">*{input.bundleDiscountPct}% bundle discount is already included in the entered rates.</p> : null}

        <div className="mt-5 rounded-md border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div><div className="text-sm font-semibold text-foreground">Workbook output</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Project Overview + client-facing Service Fee Schedule + buried Calculation Detail. All derived cells are formulas, and the fee schedule is recognized by Mirror Mode for Service Proposal and Service Contract output.</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}
