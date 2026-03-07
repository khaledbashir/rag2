"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileSignature,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  HardHat,
  Moon,
  Wrench,
  FolderOpen,
  Sparkles,
  ChevronDown,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DisplayEntry {
  id: string;
  name: string;
  widthFt: string;
  heightFt: string;
  pixelPitch: string;
  quantity: string;
  environment: "Indoor" | "Outdoor";
  structureType: string;
  hasDemolition: boolean;
  installPrice: string;
}

interface ProjectSummary {
  id: string;
  clientName: string;
  venue: string | null;
  screenCount: number;
  updatedAt: string;
}

interface SOWSection {
  id: string;
  title: string;
  content: string;
}

function makeDisplay(): DisplayEntry {
  return {
    id: crypto.randomUUID(),
    name: "",
    widthFt: "",
    heightFt: "",
    pixelPitch: "",
    quantity: "1",
    environment: "Indoor",
    structureType: "wall",
    hasDemolition: false,
    installPrice: "",
  };
}

// Cabinet estimation (mirrors server-side logic)
function estimateCabinets(wFt: number, hFt: number, pitch: number) {
  let cw: number, ch: number;
  if (pitch <= 2.0) { cw = 600; ch = 337.5; }
  else if (pitch <= 4.0) { cw = 500; ch = 500; }
  else if (pitch <= 8.0) { cw = 500; ch = 1000; }
  else { cw = 960; ch = 960; }
  const cols = Math.ceil(wFt / (cw / 304.8));
  const rows = Math.ceil(hFt / (ch / 304.8));
  return { rows, cols, total: rows * cols };
}

const STRUCTURE_LABELS: Record<string, string> = {
  wall: "aluminum channel for LED mounting",
  flown: "flown/rigged steel structure",
  ceiling: "ceiling-mounted steel structure",
  ground: "ground-supported steel structure",
  freestanding: "freestanding steel structure",
  custom: "custom structural support system",
};

const DEFAULT_EXCLUSIONS = [
  "Temporary power",
  "Site security",
  "Structural and Electrical engineering",
  "Building permits",
  "Sidewalk / Lane Closures",
  "LED Disposal",
];

const TASK_TEMPLATES = [
  { text: "Removal and disposal of existing displays, and secondary steel (as needed)", condition: "demo" },
  { text: "Unload, receive, inspect and stage all structural components in pre-arranged staging locations", condition: "always" },
  { text: "Provide manpower and equipment for structural installation of displays and any necessary sub structure", condition: "always" },
  { text: "Provide floor protection as required by the project / general contractor / engineers", condition: "always" },
  { text: "Unload, receive, inspect, and stage LED video panels", condition: "always" },
  { text: "Uncrate and install LED video panel sections", condition: "always" },
  { text: "Provide manpower and equipment for structural installation of trim and flashing", condition: "always" },
  { text: "Breakdown and dispose of crates as they are unloaded. Disposal is part of this scope of work", condition: "always" },
  { text: "Complete all electrical power and low voltage data jumps between assembled LED", condition: "always" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SOWGeneratorPage() {
  // Source
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loadingProject, setLoadingProject] = useState(false);

  // Project fields
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [revision, setRevision] = useState("1");
  const [installStart, setInstallStart] = useState("");
  const [installEnd, setInstallEnd] = useState("");
  const [isUnionLabor, setIsUnionLabor] = useState(false);
  const [hasNightWork, setHasNightWork] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [displays, setDisplays] = useState<DisplayEntry[]>([makeDisplay()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  // Editable sections
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");

  // Load projects
  useEffect(() => {
    setProjectsLoading(true);
    fetch("/api/projects?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setProjects(
          (data.projects || []).map((p: any) => ({
            id: p.id,
            clientName: p.clientName || "Untitled",
            venue: p.venue,
            screenCount: p.screenCount || p.screens?.length || 0,
            updatedAt: p.updatedAt,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  const loadProject = async (pid: string) => {
    if (!pid) return;
    setLoadingProject(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${pid}`);
      if (!res.ok) throw new Error("Failed to load project");
      const { project } = await res.json();
      setProjectName(project.clientName || "");
      setClientName(project.clientName || "");
      setVenue(project.venue || "");
      setAddress([project.clientAddress, project.clientCity, project.clientZip].filter(Boolean).join(", "));
      const pDoc = project.pricingDocument as any;
      const tables = pDoc?.tables || [];
      setCurrency(pDoc?.currency || "USD");
      const screens = project.screens || [];
      if (screens.length > 0) {
        setDisplays(
          screens.map((s: any, i: number) => {
            const table = tables[i] || tables.find((t: any) => t.name?.toLowerCase().includes(s.name?.toLowerCase()));
            return {
              id: crypto.randomUUID(),
              name: s.name || `Display ${i + 1}`,
              widthFt: String(s.width || s.widthFt || ""),
              heightFt: String(s.height || s.heightFt || ""),
              pixelPitch: String(s.pixelPitch || s.pitchMm || ""),
              quantity: String(s.quantity || 1),
              environment: (s.environment === "Outdoor" ? "Outdoor" : "Indoor") as "Indoor" | "Outdoor",
              structureType: s.structureType || "wall",
              hasDemolition: false,
              installPrice: table?.grandTotal > 0 ? String(table.grandTotal) : "",
            };
          })
        );
      }
      setAutoFilled(true);
      setSectionOverrides({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingProject(false);
    }
  };

  const updateDisplay = (id: string, field: keyof DisplayEntry, value: any) => {
    setDisplays((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const startEdit = (id: string, content: string) => {
    setEditingSection(id);
    setEditBuffer(content);
  };

  const saveEdit = () => {
    if (editingSection) {
      setSectionOverrides((prev) => ({ ...prev, [editingSection]: editBuffer }));
      setEditingSection(null);
    }
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditBuffer("");
  };

  // Build preview data
  const validDisplays = displays.filter((d) => d.name.trim());
  const hasDemolition = validDisplays.some((d) => d.hasDemolition);
  const subtitle = `${venue || "Project"} – Display ${hasDemolition ? "Replacement" : "Installation"}`;

  const defaultSections: SOWSection[] = [
    {
      id: "overview",
      title: "PROJECT OVERVIEW",
      content: "The following Scope of Work is intended to be general in nature. The intention is to have the successful Subcontractor perform all related work shown on the Contract Documents other than those items specifically indicated below to be excluded.\n\nThis Scope of Work takes precedence over the Drawings and Specifications in the event of a conflict in trade assignment or responsibility. By accepting this Scope of Work, the Subcontractor is verifying that the Drawings and Specifications clearly identify the Subcontractor's work.",
    },
    {
      id: "objective",
      title: "Objective",
      content: `${hasDemolition ? "Demolition and Installation" : "Installation"} of the ${validDisplays.length > 1 ? "displays" : "Main display"} for ${venue || projectName || "[Venue]"}.`,
    },
    {
      id: "installation",
      title: "Installation",
      content: installStart && installEnd
        ? `Installation is to take place between ${installStart} and ${installEnd}. Installation of the LED video board included in the equipment list below and described within the SOW is to be part of this scope.`
        : "Installation timeline to be determined. Installation of the LED video board included in the equipment list below and described within the SOW is to be part of this scope.",
    },
    {
      id: "electrical",
      title: "Electrical Connection",
      content: 'Electrical connections between LED panels (jumps) will be included as part of this scope of work. "Jumps" refers to both high voltage power and low voltage data connections between ALL LED panels.',
    },
    {
      id: "testing",
      title: "Testing and Adjusting",
      content: "Sub-contractor will adjust the displays to ensure the best quality installation possible and will work with ANC to complete and make any necessary changes.",
    },
    {
      id: "signoff",
      title: "ANC Signoff",
      content: "Each display will be reviewed to confirm that equipment has been installed per the SOW and to the satisfaction of the ANC project manager and the customer.",
    },
  ];

  const getSectionContent = (id: string) =>
    sectionOverrides[id] || defaultSections.find((s) => s.id === id)?.content || "";

  const canGenerate = projectName.trim() && validDisplays.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const payload = {
        projectName: projectName.trim(),
        clientName: clientName.trim() || "Client",
        venue: venue.trim() || projectName.trim(),
        address: address.trim() || undefined,
        date,
        revision: parseInt(revision) || 1,
        installStartDate: installStart || undefined,
        installEndDate: installEnd || undefined,
        isUnionLabor,
        hasNightWork,
        includeElectrical: true,
        includeStructural: true,
        currency,
        sectionOverrides,
        displays: validDisplays.map((d) => ({
          name: d.name.trim(),
          widthFt: parseFloat(d.widthFt) || 0,
          heightFt: parseFloat(d.heightFt) || 0,
          pixelPitch: parseFloat(d.pixelPitch) || 0,
          quantity: parseInt(d.quantity) || 1,
          environment: d.environment,
          structureType: d.structureType,
          hasDemolition: d.hasDemolition,
          installPrice: parseFloat(d.installPrice) || 0,
        })),
      };
      const res = await fetch("/api/sow/generate-installation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.trim()} - Installation SOW.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  const inputSm = "px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-blue/30";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <FileSignature className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">SOW Builder</h1>
            <p className="text-[11px] text-muted-foreground">Click any section to edit. Download when ready.</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
            canGenerate && !generating
              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? "Generating..." : "Download DOCX"}
        </button>
      </div>

      {/* Project Picker */}
      <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-muted/30 border border-border">
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="flex-1 text-xs bg-transparent border-none focus:outline-none text-foreground"
        >
          <option value="">{projectsLoading ? "Loading..." : "Load from existing project..."}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName}{p.venue ? ` — ${p.venue}` : ""}{p.screenCount > 0 ? ` (${p.screenCount} screens)` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => loadProject(selectedProjectId)}
          disabled={!selectedProjectId || loadingProject}
          className={cn("px-3 py-1 rounded text-xs font-semibold transition-all", selectedProjectId && !loadingProject ? "bg-brand-blue text-white" : "bg-muted text-muted-foreground")}
        >
          {loadingProject ? "..." : "Load"}
        </button>
        {autoFilled && <span className="text-[10px] text-emerald-600 font-medium">Auto-filled</span>}
      </div>

      {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 text-xs text-red-600">{error}</div>}

      {/* ══════════════════════════════════════════════════════════════════
          LIVE DOCUMENT PREVIEW
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm overflow-hidden">
        {/* ANC Header */}
        <div className="border-b-2 border-red-500 px-8 py-4 text-center">
          <div className="text-2xl font-black tracking-wider text-foreground">anc</div>
          <div className="text-[10px] text-muted-foreground">www.anc.com</div>
        </div>

        <div className="px-8 py-6 space-y-1">
          {/* Title */}
          <h2 className="text-center text-lg font-bold text-foreground">Scope of Work:</h2>
          <p className="text-center text-base text-foreground mb-6">{subtitle}</p>

          {/* Project Info Block */}
          <div className="font-mono text-xs space-y-1 mb-6 bg-muted/20 rounded-lg p-4">
            <div className="flex gap-2">
              <span className="font-bold w-28 shrink-0">PROJECT NAME:</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Enter project name" className="flex-1 bg-transparent border-b border-dashed border-border focus:border-brand-blue focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-28 shrink-0">ADDRESS:</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" className="flex-1 bg-transparent border-b border-dashed border-border focus:border-brand-blue focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-28 shrink-0">DATE:</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputSm + " w-36"} />
              <span className="font-bold ml-4">Revision #</span>
              <input type="number" value={revision} onChange={(e) => setRevision(e.target.value)} min="1" className={inputSm + " w-12 text-center"} />
            </div>
          </div>

          {/* Editable Sections */}
          {defaultSections.map((section) => {
            const content = getSectionContent(section.id);
            const isEditing = editingSection === section.id;
            return (
              <div key={section.id} className="group relative mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={cn("text-sm font-bold text-foreground", section.id === "overview" ? "font-mono tracking-wide" : "underline")}>{section.title}</h3>
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(section.id, content)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground transition-all"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBuffer}
                      onChange={(e) => setEditBuffer(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-brand-blue bg-brand-blue/5 text-foreground focus:outline-none resize-y"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button onClick={saveEdit} className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-semibold"><Check className="w-3 h-3" />Save</button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground text-[10px] font-semibold"><X className="w-3 h-3" />Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 transition-colors" onClick={() => startEdit(section.id, content)}>
                    {content}
                  </div>
                )}
                {section.id === "installation" && (
                  <div className="flex gap-2 mt-2 items-center">
                    <span className="text-[10px] text-muted-foreground font-medium">Dates:</span>
                    <input type="date" value={installStart} onChange={(e) => setInstallStart(e.target.value)} className={inputSm + " w-32"} />
                    <span className="text-[10px] text-muted-foreground">to</span>
                    <input type="date" value={installEnd} onChange={(e) => setInstallEnd(e.target.value)} className={inputSm + " w-32"} />
                  </div>
                )}
              </div>
            );
          })}

          {/* ── SCOPE OF WORK ─────────────────────────────────────────── */}
          <div className="pt-4">
            <h3 className="font-mono text-sm tracking-wide font-bold text-foreground mb-3">SCOPE OF WORK</h3>

            {/* Toggles */}
            <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/20 border border-border">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input type="checkbox" checked={isUnionLabor} onChange={(e) => setIsUnionLabor(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <HardHat className="w-3.5 h-3.5 text-muted-foreground" /> Union Labor
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input type="checkbox" checked={hasNightWork} onChange={(e) => setHasNightWork(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <Moon className="w-3.5 h-3.5 text-muted-foreground" /> Night Work
              </label>
            </div>

            {/* 1. General Inclusions (per display) */}
            <p className="text-xs font-bold text-foreground mb-2">1. <span className="underline">General Inclusions:</span></p>

            {validDisplays.map((d, i) => {
              const w = parseFloat(d.widthFt) || 0;
              const h = parseFloat(d.heightFt) || 0;
              const p = parseFloat(d.pixelPitch) || 3;
              const cab = w > 0 && h > 0 ? estimateCabinets(w, h, p) : null;
              const struct = STRUCTURE_LABELS[d.structureType] || STRUCTURE_LABELS.custom;
              return (
                <div key={d.id} className="ml-4 mb-3 p-3 rounded-lg border border-border/50 bg-muted/10">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={d.name} onChange={(e) => updateDisplay(d.id, "name", e.target.value)} placeholder="Display name" className="text-xs font-semibold bg-transparent border-b border-dashed border-border focus:border-brand-blue focus:outline-none flex-1" />
                    <span className="text-[10px] text-muted-foreground">Qty:</span>
                    <input type="number" value={d.quantity} onChange={(e) => updateDisplay(d.id, "quantity", e.target.value)} min="1" className={inputSm + " w-10 text-center"} />
                    {displays.length > 1 && <button onClick={() => setDisplays((prev) => prev.filter((x) => x.id !== d.id))} className="p-0.5 text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div><label className="text-[10px] text-muted-foreground">Height (ft)</label><input type="number" value={d.heightFt} onChange={(e) => updateDisplay(d.id, "heightFt", e.target.value)} step="0.01" className={inputSm + " w-full"} /></div>
                    <div><label className="text-[10px] text-muted-foreground">Width (ft)</label><input type="number" value={d.widthFt} onChange={(e) => updateDisplay(d.id, "widthFt", e.target.value)} step="0.01" className={inputSm + " w-full"} /></div>
                    <div><label className="text-[10px] text-muted-foreground">Pitch (mm)</label><input type="number" value={d.pixelPitch} onChange={(e) => updateDisplay(d.id, "pixelPitch", e.target.value)} step="0.1" className={inputSm + " w-full"} /></div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Structure</label>
                      <select value={d.structureType} onChange={(e) => updateDisplay(d.id, "structureType", e.target.value)} className={inputSm + " w-full"}>
                        <option value="wall">Wall Mount</option>
                        <option value="flown">Flown</option>
                        <option value="ceiling">Ceiling</option>
                        <option value="ground">Ground</option>
                        <option value="freestanding">Freestanding</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </div>
                  {/* Live inclusion preview */}
                  <div className="text-[11px] text-foreground/80 space-y-0.5 ml-2 border-l-2 border-border pl-2">
                    {d.hasDemolition && <p>• Demolition and disposal of existing display.</p>}
                    <p>• Fabrication and installation of secondary structure consisting of {struct}.</p>
                    {cab && <p>• LED cabinets (Approx {cab.total} cabinets) ({cab.rows} Rows of {cab.cols} Cabinets) per display ({d.heightFt || "0"}'h X {d.widthFt || "0"}'W)</p>}
                    <p>• Power and low voltage cables for display.</p>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/30">
                    <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                      <input type="checkbox" checked={d.hasDemolition} onChange={(e) => updateDisplay(d.id, "hasDemolition", e.target.checked)} className="w-3 h-3 rounded" />
                      <Wrench className="w-3 h-3 text-muted-foreground" /> Demolition
                    </label>
                    <select value={d.environment} onChange={(e) => updateDisplay(d.id, "environment", e.target.value)} className={inputSm + " text-[10px]"}>
                      <option value="Indoor">Indoor</option>
                      <option value="Outdoor">Outdoor</option>
                    </select>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setDisplays((prev) => [...prev, makeDisplay()])}
              className="flex items-center gap-1 ml-4 px-2 py-1 text-[11px] font-semibold text-brand-blue hover:bg-brand-blue/5 rounded transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Display
            </button>

            {/* 2. General Exclusions */}
            <p className="text-xs font-bold text-foreground mt-4 mb-2">2. <span className="underline">General Exclusions:</span></p>
            <div className="ml-6 space-y-0.5">
              {DEFAULT_EXCLUSIONS.map((ex, i) => (
                <p key={i} className="text-[11px] text-foreground/80">2.{i + 1}. {ex}</p>
              ))}
            </div>

            {/* Per-display task lists */}
            {validDisplays.map((d, di) => {
              const tasks = TASK_TEMPLATES.filter((t) => t.condition === "always" || (t.condition === "demo" && d.hasDemolition));
              return (
                <div key={d.id} className="mt-4">
                  <p className="text-xs font-bold text-foreground mb-1">{di + 3}. <span className="underline">{d.name || `Display ${di + 1}`} – QTY {d.quantity || 1}:</span></p>
                  <div className="ml-6 space-y-0.5">
                    {tasks.map((t, ti) => (
                      <p key={ti} className="text-[11px] text-foreground/80">{di + 3}.{ti + 1}. {t.text}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ITEMIZED PRICING */}
          <div className="pt-6">
            <h3 className="font-mono text-sm tracking-wide font-bold text-foreground mb-2">ITEMIZED PRICING</h3>
            <p className="text-xs text-foreground/80">The itemized pricing for the above Scope of Work should be provided in the format below as requested in the RFP documents. If you have any questions, please do not hesitate to send over.</p>
          </div>

          {/* BID DUE DATE */}
          <div className="pt-4 pb-2">
            <p className="text-xs"><span className="font-bold">BID DUE DATE:</span> Please submit your bid via email to the ANC Contacts ASAP.</p>
          </div>
        </div>
      </div>

      {/* Bottom download bar */}
      <div className="flex items-center justify-between mt-6 p-4 rounded-xl bg-muted/30 border border-border">
        <div className="text-xs text-muted-foreground">
          {validDisplays.length} display{validDisplays.length !== 1 ? "s" : ""} configured
          {autoFilled && " (auto-filled from project)"}
        </div>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
            canGenerate && !generating
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download DOCX
        </button>
      </div>
    </div>
  );
}
