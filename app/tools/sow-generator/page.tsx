"use client";

import { useState } from "react";
import {
  FileSignature,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  HardHat,
  Moon,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function SOWGeneratorPage() {
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

  const addDisplay = () => setDisplays((prev) => [...prev, makeDisplay()]);

  const removeDisplay = (id: string) => {
    if (displays.length <= 1) return;
    setDisplays((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDisplay = (id: string, field: keyof DisplayEntry, value: any) => {
    setDisplays((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const canGenerate =
    projectName.trim() &&
    displays.some((d) => d.name.trim());

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

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <FileSignature className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Installation SOW Generator
          </h1>
          <p className="text-xs text-muted-foreground">
            Generate a subcontractor-ready Scope of Work document (DOCX)
          </p>
        </div>
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
                <span className="text-xs font-bold text-muted-foreground">
                  Display {idx + 1}
                </span>
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
                    Includes Demolition
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
