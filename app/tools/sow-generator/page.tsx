"use client";

import { useEffect, useState } from "react";
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
  manufacturer: string;
  suggestedPrice: number | null;
}

interface ProjectSummary {
  id: string;
  clientName: string;
  venue: string | null;
  screenCount: number;
  totalAmount: number;
  updatedAt: string;
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
    manufacturer: "",
    suggestedPrice: null,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SOWGeneratorPage() {
  // Source selection
  const [source, setSource] = useState<"new" | "project">("new");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loadingProject, setLoadingProject] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [installWeeks, setInstallWeeks] = useState("4");
  const [isUnionLabor, setIsUnionLabor] = useState(false);
  const [hasNightWork, setHasNightWork] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [displays, setDisplays] = useState<DisplayEntry[]>([makeDisplay()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  // Load project list on mount
  useEffect(() => {
    setProjectsLoading(true);
    fetch("/api/projects?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.projects || []).map((p: any) => ({
          id: p.id,
          clientName: p.clientName || "Untitled",
          venue: p.venue,
          screenCount: p.screenCount || p.screens?.length || 0,
          totalAmount: p.totalAmount || 0,
          updatedAt: p.updatedAt,
        }));
        setProjects(list);
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  // Load full project data when selected
  const loadProject = async (projectId: string) => {
    if (!projectId) return;
    setLoadingProject(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to load project");
      const data = await res.json();
      const project = data.project;

      // Fill project details
      setProjectName(project.clientName || "Untitled Project");
      setClientName(project.clientName || "");
      setVenue(project.venue || "");
      setAddress(
        [project.clientAddress, project.clientCity, project.clientZip]
          .filter(Boolean)
          .join(", ")
      );

      // Get pricing document
      const pDoc = project.pricingDocument as any;
      const tables = pDoc?.tables || [];
      setCurrency(pDoc?.currency || "USD");

      // Build displays from screens
      const screens = project.screens || [];
      if (screens.length > 0) {
        const newDisplays: DisplayEntry[] = screens.map(
          (s: any, i: number) => {
            const table =
              tables[i] ||
              tables.find(
                (t: any) =>
                  t.name &&
                  s.name &&
                  t.name.toLowerCase().includes(s.name.toLowerCase())
              );
            const grandTotal = table?.grandTotal || 0;
            const sqft =
              (Number(s.width || s.widthFt || 0)) *
              (Number(s.height || s.heightFt || 0));
            // Suggest install price: $289/sqft if no pricing data
            const suggested = sqft > 0 ? Math.round(sqft * 289) : null;

            return {
              id: crypto.randomUUID(),
              name: s.name || `Display ${i + 1}`,
              widthFt: String(s.width || s.widthFt || ""),
              heightFt: String(s.height || s.heightFt || ""),
              pixelPitch: String(s.pixelPitch || s.pitchMm || ""),
              quantity: String(s.quantity || 1),
              environment: (s.environment === "Outdoor"
                ? "Outdoor"
                : "Indoor") as "Indoor" | "Outdoor",
              structureType: s.structureType || "wall",
              hasDemolition: false,
              installPrice: grandTotal > 0 ? String(grandTotal) : "",
              manufacturer: s.manufacturer || "",
              suggestedPrice: grandTotal > 0 ? null : suggested,
            };
          }
        );
        setDisplays(newDisplays);
      }

      setAutoFilled(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingProject(false);
    }
  };

  const addDisplay = () => setDisplays((prev) => [...prev, makeDisplay()]);

  const removeDisplay = (id: string) => {
    if (displays.length <= 1) return;
    setDisplays((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDisplay = (
    id: string,
    field: keyof DisplayEntry,
    value: any
  ) => {
    setDisplays((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const applySuggested = (id: string, price: number) => {
    setDisplays((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, installPrice: String(price), suggestedPrice: null }
          : d
      )
    );
  };

  const resetForm = () => {
    setProjectName("");
    setClientName("");
    setVenue("");
    setAddress("");
    setInstallWeeks("4");
    setIsUnionLabor(false);
    setHasNightWork(false);
    setCurrency("USD");
    setDisplays([makeDisplay()]);
    setSelectedProjectId("");
    setAutoFilled(false);
    setError(null);
  };

  const canGenerate = projectName.trim() && displays.some((d) => d.name.trim());

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
        installWeeks: parseInt(installWeeks) || 4,
        isUnionLabor,
        hasNightWork,
        includeElectrical: true,
        includeStructural: true,
        currency,
        displays: displays
          .filter((d) => d.name.trim())
          .map((d) => ({
            name: d.name.trim(),
            widthFt: parseFloat(d.widthFt) || 0,
            heightFt: parseFloat(d.heightFt) || 0,
            pixelPitch: parseFloat(d.pixelPitch) || 0,
            quantity: parseInt(d.quantity) || 1,
            environment: d.environment,
            structureType: d.structureType,
            hasDemolition: d.hasDemolition,
            installPrice: parseFloat(d.installPrice) || 0,
            manufacturer: d.manufacturer || undefined,
          })),
      };

      const res = await fetch("/api/sow/generate-installation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to generate SOW");
      }

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

  const inputClass =
    "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors";
  const labelClass = "block text-xs font-semibold text-foreground mb-1.5";
  const selectClass =
    "px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(n);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <FileSignature className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            SOW Builder
          </h1>
          <p className="text-xs text-muted-foreground">
            Generate a subcontractor-ready Installation Scope of Work (DOCX)
          </p>
        </div>
      </div>

      {/* Source Selector */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <h2 className="text-sm font-bold text-foreground mb-4">
          Start From
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => {
              setSource("project");
              setAutoFilled(false);
            }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
              source === "project"
                ? "border-brand-blue bg-brand-blue/5"
                : "border-border hover:border-border/80"
            )}
          >
            <FolderOpen
              className={cn(
                "w-5 h-5",
                source === "project"
                  ? "text-brand-blue"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Existing Project
              </div>
              <div className="text-[11px] text-muted-foreground">
                Auto-fill from a saved project's screens and pricing
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setSource("new");
              resetForm();
            }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
              source === "new"
                ? "border-brand-blue bg-brand-blue/5"
                : "border-border hover:border-border/80"
            )}
          >
            <Plus
              className={cn(
                "w-5 h-5",
                source === "new"
                  ? "text-brand-blue"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Start Fresh
              </div>
              <div className="text-[11px] text-muted-foreground">
                Enter project details and displays manually
              </div>
            </div>
          </button>
        </div>

        {/* Project Picker */}
        {source === "project" && (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelClass}>Select Project</label>
              <div className="relative">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={projectsLoading}
                  className={selectClass + " w-full appearance-none pr-8"}
                >
                  <option value="">
                    {projectsLoading
                      ? "Loading projects..."
                      : "Choose a project..."}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName}
                      {p.venue ? ` — ${p.venue}` : ""}
                      {p.screenCount > 0
                        ? ` (${p.screenCount} screens)`
                        : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <button
              onClick={() => loadProject(selectedProjectId)}
              disabled={!selectedProjectId || loadingProject}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
                selectedProjectId && !loadingProject
                  ? "bg-brand-blue text-white hover:bg-brand-blue/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {loadingProject ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loadingProject ? "Loading..." : "Auto-Fill"}
            </button>
          </div>
        )}

        {autoFilled && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Auto-filled from project. Review the details below and adjust as
              needed.
            </p>
          </div>
        )}
      </div>

      {/* Project Details */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <h2 className="text-sm font-bold text-foreground mb-4">
          Project Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Bilt HQ LED Installation"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Bilt Rewards"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Bilt Headquarters"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 837 Washington St, New York, NY"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Install Timeline (weeks)</label>
            <input
              type="number"
              value={installWeeks}
              onChange={(e) => setInstallWeeks(e.target.value)}
              min="1"
              max="52"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectClass + " w-full"}
            >
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={isUnionLabor}
              onChange={(e) => setIsUnionLabor(e.target.checked)}
              className="w-4 h-4 rounded border-border text-brand-blue focus:ring-brand-blue/30"
            />
            <HardHat className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Union Labor (IBEW)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={hasNightWork}
              onChange={(e) => setHasNightWork(e.target.checked)}
              className="w-4 h-4 rounded border-border text-brand-blue focus:ring-brand-blue/30"
            />
            <Moon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Night Work
            </span>
          </label>
        </div>
      </div>

      {/* Displays */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">
            Displays ({displays.length})
          </h2>
          <button
            onClick={addDisplay}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Display
          </button>
        </div>

        <div className="space-y-4">
          {displays.map((d, idx) => (
            <div
              key={d.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    Display {idx + 1}
                  </span>
                  {d.manufacturer && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {d.manufacturer}
                    </span>
                  )}
                </div>
                {displays.length > 1 && (
                  <button
                    onClick={() => removeDisplay(d.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={d.name}
                    onChange={(e) =>
                      updateDisplay(d.id, "name", e.target.value)
                    }
                    placeholder="e.g. Media Room Display"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Height (ft)</label>
                  <input
                    type="number"
                    value={d.heightFt}
                    onChange={(e) =>
                      updateDisplay(d.id, "heightFt", e.target.value)
                    }
                    placeholder="0"
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Width (ft)</label>
                  <input
                    type="number"
                    value={d.widthFt}
                    onChange={(e) =>
                      updateDisplay(d.id, "widthFt", e.target.value)
                    }
                    placeholder="0"
                    step="0.01"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Pixel Pitch (mm)</label>
                  <input
                    type="number"
                    value={d.pixelPitch}
                    onChange={(e) =>
                      updateDisplay(d.id, "pixelPitch", e.target.value)
                    }
                    placeholder="0"
                    step="0.1"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Quantity</label>
                  <input
                    type="number"
                    value={d.quantity}
                    onChange={(e) =>
                      updateDisplay(d.id, "quantity", e.target.value)
                    }
                    min="1"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Environment</label>
                  <select
                    value={d.environment}
                    onChange={(e) =>
                      updateDisplay(d.id, "environment", e.target.value)
                    }
                    className={selectClass + " w-full"}
                  >
                    <option value="Indoor">Indoor</option>
                    <option value="Outdoor">Outdoor</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Structure Type</label>
                  <select
                    value={d.structureType}
                    onChange={(e) =>
                      updateDisplay(d.id, "structureType", e.target.value)
                    }
                    className={selectClass + " w-full"}
                  >
                    <option value="wall">Wall Mount</option>
                    <option value="flown">Flown / Rigged</option>
                    <option value="ceiling">Ceiling Mount</option>
                    <option value="ground">Ground Support</option>
                    <option value="freestanding">Freestanding</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border/50">
                <div className="flex-1">
                  <label className={labelClass}>Install Price ($)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={d.installPrice}
                      onChange={(e) =>
                        updateDisplay(d.id, "installPrice", e.target.value)
                      }
                      placeholder="0"
                      step="100"
                      className={inputClass}
                    />
                    {d.suggestedPrice && !d.installPrice && (
                      <button
                        onClick={() =>
                          applySuggested(d.id, d.suggestedPrice!)
                        }
                        className="shrink-0 px-2 py-1.5 text-[10px] font-semibold rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                        title="Suggested based on $289/sqft install rate"
                      >
                        Suggest: {fmt(d.suggestedPrice)}
                      </button>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer group pt-4">
                  <input
                    type="checkbox"
                    checked={d.hasDemolition}
                    onChange={(e) =>
                      updateDisplay(d.id, "hasDemolition", e.target.checked)
                    }
                    className="w-4 h-4 rounded border-border text-brand-blue focus:ring-brand-blue/30"
                  />
                  <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                    Demolition
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all",
            canGenerate && !generating
              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Generate Installation SOW
            </>
          )}
        </button>
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}
