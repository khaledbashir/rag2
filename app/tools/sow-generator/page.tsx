"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
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
  ChevronUp,
  GripVertical,
  Check,
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Loader2,
  FileText,
  Undo,
  Redo,
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
  expanded: boolean;
}

interface ExclusionItem {
  id: string;
  text: string;
  enabled: boolean;
}

interface TaskItem {
  id: string;
  text: string;
  enabled: boolean;
}

interface ProjectSummary {
  id: string;
  clientName: string;
  venue: string | null;
  screenCount: number;
  updatedAt: string;
}

function uid() { return crypto.randomUUID(); }

function makeDisplay(): DisplayEntry {
  return {
    id: uid(), name: "", widthFt: "", heightFt: "", pixelPitch: "",
    quantity: "1", environment: "Indoor", structureType: "wall",
    hasDemolition: false, installPrice: "", expanded: true,
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
  "wall-plywood": '\u00BE" plywood for LED mounting',
  flown: "flown/rigged steel structure",
  ceiling: "ceiling-mounted steel structure",
  ground: "ground-supported steel structure",
  freestanding: "freestanding steel structure",
  custom: "custom structural support system",
};

const STRUCTURE_OPTIONS = [
  { value: "wall", label: "Wall (Aluminum Channel)" },
  { value: "wall-plywood", label: "Wall (Plywood)" },
  { value: "flown", label: "Flown / Rigged" },
  { value: "ceiling", label: "Ceiling Mount" },
  { value: "ground", label: "Ground Supported" },
  { value: "freestanding", label: "Freestanding" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_EXCLUSIONS: ExclusionItem[] = [
  { id: uid(), text: "Temporary power", enabled: true },
  { id: uid(), text: "Site security", enabled: true },
  { id: uid(), text: "Structural and Electrical engineering", enabled: true },
  { id: uid(), text: "Building permits", enabled: true },
  { id: uid(), text: "Sidewalk / Lane Closures", enabled: true },
  { id: uid(), text: "LED Disposal", enabled: true },
];

function getDefaultTasks(displayName: string, structureType: string): TaskItem[] {
  const structLabel = STRUCTURE_LABELS[structureType] || STRUCTURE_LABELS.custom;
  const isWall = structureType === "wall" || structureType === "wall-plywood";
  const structDetail = isWall
    ? `of ${structLabel} for mounting display's cabinets`
    : "displays and any necessary sub structure";
  return [
    { id: uid(), text: "Unload, receive, inspect and stage all structural components in pre-arranged staging locations (locations will be coordinated by ANC and Owner)", enabled: true },
    { id: uid(), text: `Provide manpower and equipment for structural installation ${structDetail}`, enabled: true },
    { id: uid(), text: "Provide floor protection as required by the project / general contractor / engineers", enabled: true },
    { id: uid(), text: "Unload, receive, inspect, and stage LED video panels", enabled: true },
    { id: uid(), text: "Uncrate and install LED video panels", enabled: true },
    { id: uid(), text: "Provide manpower and equipment for structural installation of trim and flashing", enabled: true },
    { id: uid(), text: "Breakdown and dispose of crates as they are unloaded. Disposal is part of this scope of work", enabled: true },
    { id: uid(), text: "Complete all electrical power and low voltage data jumps between assembled LED", enabled: true },
  ];
}

// ─── TipTap Section Editor ──────────────────────────────────────────────────

function SectionEditor({
  content,
  onChange,
  placeholder,
  sectionId,
  onAISuggest,
  aiLoading,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  sectionId: string;
  onAISuggest?: (sectionId: string) => void;
  aiLoading?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || "Click to edit..." }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none text-xs leading-relaxed text-foreground/90 focus:outline-none min-h-[2em] px-1 py-0.5 rounded transition-colors hover:bg-muted/20 focus-within:bg-muted/10",
      },
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="relative group/editor">
      {/* Inline formatting toolbar — appears on hover */}
      <div className="absolute -top-6 right-0 opacity-0 group-hover/editor:opacity-100 transition-opacity z-10">
        <div className="flex items-center gap-0.5 bg-zinc-800 dark:bg-zinc-200 rounded-md shadow-lg px-1 py-0.5">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={cn("p-0.5 rounded", editor.isActive("bold") ? "bg-white/20 dark:bg-black/20" : "hover:bg-white/10 dark:hover:bg-black/10")}>
            <Bold className="w-3 h-3 text-white dark:text-black" />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={cn("p-0.5 rounded", editor.isActive("italic") ? "bg-white/20 dark:bg-black/20" : "hover:bg-white/10 dark:hover:bg-black/10")}>
            <Italic className="w-3 h-3 text-white dark:text-black" />
          </button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={cn("p-0.5 rounded", editor.isActive("underline") ? "bg-white/20 dark:bg-black/20" : "hover:bg-white/10 dark:hover:bg-black/10")}>
            <UnderlineIcon className="w-3 h-3 text-white dark:text-black" />
          </button>
          <button onClick={() => editor.chain().focus().undo().run()} className="p-0.5 rounded hover:bg-white/10 dark:hover:bg-black/10">
            <Undo className="w-3 h-3 text-white dark:text-black" />
          </button>
        </div>
      </div>
      <EditorContent editor={editor} />
      {onAISuggest && (
        <button
          onClick={() => onAISuggest(sectionId)}
          disabled={aiLoading}
          className="absolute -right-7 top-0 opacity-0 group-hover/editor:opacity-100 p-1 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 transition-all"
          title="AI suggest text for this section"
        >
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── Editable List Component ────────────────────────────────────────────────

function EditableList({
  items,
  onChange,
  numberPrefix,
  addLabel,
}: {
  items: { id: string; text: string; enabled: boolean }[];
  onChange: (items: { id: string; text: string; enabled: boolean }[]) => void;
  numberPrefix: string;
  addLabel: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  return (
    <div className="ml-6 space-y-0.5">
      {items.map((item, i) => (
        <div key={item.id} className="group/item flex items-start gap-1.5">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => onChange(items.map((x) => x.id === item.id ? { ...x, enabled: e.target.checked } : x))}
            className="mt-0.5 w-3 h-3 rounded shrink-0"
          />
          {editingId === item.id ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onChange(items.map((x) => x.id === item.id ? { ...x, text: editText } : x)); setEditingId(null); }
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 text-[11px] px-1 py-0.5 border border-brand-blue rounded bg-brand-blue/5"
                autoFocus
              />
              <button onClick={() => { onChange(items.map((x) => x.id === item.id ? { ...x, text: editText } : x)); setEditingId(null); }} className="text-emerald-600"><Check className="w-3 h-3" /></button>
              <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <span
              className={cn("text-[11px] cursor-pointer hover:bg-muted/30 rounded px-0.5 -mx-0.5 flex-1", !item.enabled && "line-through text-muted-foreground")}
              onClick={() => { setEditingId(item.id); setEditText(item.text); }}
            >
              {numberPrefix}{i + 1}. {item.text}
            </span>
          )}
          <button
            onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            className="opacity-0 group-hover/item:opacity-100 p-0.5 text-muted-foreground hover:text-red-500 shrink-0"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { id: uid(), text: "New item", enabled: true }])}
        className="flex items-center gap-1 text-[10px] text-brand-blue hover:text-brand-blue/80 font-medium mt-1"
      >
        <Plus className="w-2.5 h-2.5" /> {addLabel}
      </button>
    </div>
  );
}

// ─── Display Card ───────────────────────────────────────────────────────────

function DisplayCard({
  display,
  index,
  inclusionNum,
  taskNum,
  onUpdate,
  onRemove,
  canRemove,
  tasks,
  onTasksChange,
}: {
  display: DisplayEntry;
  index: number;
  inclusionNum: number;
  taskNum: number;
  onUpdate: (field: keyof DisplayEntry, value: any) => void;
  onRemove: () => void;
  canRemove: boolean;
  tasks: TaskItem[];
  onTasksChange: (tasks: TaskItem[]) => void;
}) {
  const w = parseFloat(display.widthFt) || 0;
  const h = parseFloat(display.heightFt) || 0;
  const p = parseFloat(display.pixelPitch) || 3;
  const cab = w > 0 && h > 0 ? estimateCabinets(w, h, p) : null;
  const structLabel = STRUCTURE_LABELS[display.structureType] || STRUCTURE_LABELS.custom;
  const inputSm = "px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand-blue/30";
  const qtyLabel = parseInt(display.quantity) > 1 ? ` (Qty ${display.quantity})` : "";

  return (
    <div className="border border-border/60 rounded-lg bg-muted/5 overflow-hidden">
      {/* Display Header — always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => onUpdate("expanded", !display.expanded)}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground/50" />
        <div className="flex-1 min-w-0">
          {display.name ? (
            <span className="text-xs font-semibold text-foreground truncate">
              {inclusionNum}.{index + 1}. {display.name}{qtyLabel}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">Untitled Display</span>
          )}
          {cab && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {cab.total} cabinets ({cab.rows}x{cab.cols}) | {h}&apos;H x {w}&apos;W
            </span>
          )}
        </div>
        {display.hasDemolition && <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">DEMO</span>}
        {canRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-0.5 text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>}
        {display.expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </div>

      {display.expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30">
          {/* Specs Grid */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground font-medium">Display Name</label>
              <input value={display.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder="e.g. Main Scoreboard" className={inputSm + " w-full"} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Height (ft)</label>
              <input type="number" value={display.heightFt} onChange={(e) => onUpdate("heightFt", e.target.value)} step="0.01" className={inputSm + " w-full"} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Width (ft)</label>
              <input type="number" value={display.widthFt} onChange={(e) => onUpdate("widthFt", e.target.value)} step="0.01" className={inputSm + " w-full"} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Pitch (mm)</label>
              <input type="number" value={display.pixelPitch} onChange={(e) => onUpdate("pixelPitch", e.target.value)} step="0.1" className={inputSm + " w-full"} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Quantity</label>
              <input type="number" value={display.quantity} onChange={(e) => onUpdate("quantity", e.target.value)} min="1" className={inputSm + " w-full"} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Structure Type</label>
              <select value={display.structureType} onChange={(e) => onUpdate("structureType", e.target.value)} className={inputSm + " w-full"}>
                {STRUCTURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Environment</label>
              <select value={display.environment} onChange={(e) => onUpdate("environment", e.target.value)} className={inputSm + " w-full"}>
                <option value="Indoor">Indoor</option>
                <option value="Outdoor">Outdoor</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input type="checkbox" checked={display.hasDemolition} onChange={(e) => onUpdate("hasDemolition", e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <Wrench className="w-3 h-3 text-muted-foreground" /> Demolition
              </label>
            </div>
          </div>

          {/* Live Inclusion Preview */}
          <div className="bg-muted/20 rounded-lg p-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Inclusions Preview</p>
            {display.hasDemolition && <p className="text-[11px] text-foreground/70">{inclusionNum}.{index + 1}.1. Demolition and disposal of existing display.</p>}
            <p className="text-[11px] text-foreground/70">{inclusionNum}.{index + 1}.{display.hasDemolition ? 2 : 1}. Fabrication and installation of secondary structure consisting of {structLabel}.</p>
            {cab && <p className="text-[11px] text-foreground/70">{inclusionNum}.{index + 1}.{display.hasDemolition ? 3 : 2}. LED cabinets (Approx {cab.total} cabinets) ({cab.rows} Rows of {cab.cols} Cabinets) per display ({h}&apos;h X {w}&apos;W)</p>}
            <p className="text-[11px] text-foreground/70">{inclusionNum}.{index + 2}. Power and low voltage cables for display.</p>
          </div>

          {/* Editable Tasks */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Installation Tasks</p>
            <EditableList
              items={tasks}
              onChange={onTasksChange}
              numberPrefix={`${taskNum}.`}
              addLabel="Add task"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

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
  const [includeRefDocs, setIncludeRefDocs] = useState(false);
  const [bidDueDate, setBidDueDate] = useState("Please submit your bid via email to the ANC Contacts ASAP.");
  const [currency, setCurrency] = useState("USD");
  const [displays, setDisplays] = useState<DisplayEntry[]>([makeDisplay()]);
  const [displayTasks, setDisplayTasks] = useState<Record<string, TaskItem[]>>({});
  const [exclusions, setExclusions] = useState<ExclusionItem[]>(DEFAULT_EXCLUSIONS.map(e => ({ ...e, id: uid() })));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  // Section content (TipTap HTML)
  const [sections, setSections] = useState<Record<string, string>>({
    overview: "<p>The following Scope of Work is intended to be general in nature. The intention is to have the successful Subcontractor perform all related work shown on the Contract Documents other than those items specifically indicated below to be excluded.</p><p>This Scope of Work takes precedence over the Drawings and Specifications in the event of a conflict in trade assignment or responsibility. By accepting this Scope of Work, the Subcontractor is verifying that the Drawings and Specifications clearly identify the Subcontractor's work.</p>",
    electrical: '<p>Electrical connections between LED panels (jumps) will be included as part of this scope of work. "Jumps" refers to both high voltage power and low voltage data connections between ALL LED panels.</p>',
    testing: "<p>Sub-contractor will adjust the displays to ensure the best quality installation possible and will work with ANC to complete and make any necessary changes.</p>",
    signoff: "<p>Each display will be reviewed to confirm that equipment has been installed per the SOW and to the satisfaction of the ANC project manager and the customer.</p>",
  });

  // AI suggestion state
  const [aiLoadingSection, setAiLoadingSection] = useState<string | null>(null);

  // Derived
  const validDisplays = displays.filter((d) => d.name.trim());
  const hasDemolition = validDisplays.some((d) => d.hasDemolition);

  // Auto-compute objective and installation from state
  const objectiveText = `${hasDemolition ? "Demolition and Installation" : "Installation"} of the ${validDisplays.length > 1 ? `${validDisplays.map(d => d.name).join(", ")} displays` : validDisplays[0]?.name || "displays"} at ${venue || projectName || "[Venue]"}.`;

  const installationText = (() => {
    let t = installStart && installEnd
      ? `Installation is to take place between ${installStart} and ${installEnd}. Installation of all LED video boards included in the equipment list below and described within the SOW is to be part of this scope.`
      : "Installation timeline to be determined. Installation of all LED video boards included in the equipment list below and described within the SOW is to be part of this scope.";
    if (hasNightWork) t += " All work to be performed during off hours / night work.";
    if (isUnionLabor) t += " All work to be union labor.";
    return t;
  })();

  // Ensure tasks exist for each display
  const getDisplayTasks = useCallback((d: DisplayEntry): TaskItem[] => {
    if (displayTasks[d.id]) return displayTasks[d.id];
    return getDefaultTasks(d.name, d.structureType);
  }, [displayTasks]);

  const setTasksForDisplay = useCallback((displayId: string, tasks: TaskItem[]) => {
    setDisplayTasks(prev => ({ ...prev, [displayId]: tasks }));
  }, []);

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
        const newDisplays = screens.map((s: any, i: number) => {
          const table = tables[i] || tables.find((t: any) => t.name?.toLowerCase().includes(s.name?.toLowerCase()));
          return {
            id: uid(),
            name: s.name || `Display ${i + 1}`,
            widthFt: String(s.width || s.widthFt || ""),
            heightFt: String(s.height || s.heightFt || ""),
            pixelPitch: String(s.pixelPitch || s.pitchMm || ""),
            quantity: String(s.quantity || 1),
            environment: (s.environment === "Outdoor" ? "Outdoor" : "Indoor") as "Indoor" | "Outdoor",
            structureType: s.structureType || "wall",
            hasDemolition: false,
            installPrice: table?.grandTotal > 0 ? String(table.grandTotal) : "",
            expanded: false,
          };
        });
        setDisplays(newDisplays);
        // Generate default tasks for each display
        const newTasks: Record<string, TaskItem[]> = {};
        newDisplays.forEach((d: DisplayEntry) => {
          newTasks[d.id] = getDefaultTasks(d.name, d.structureType);
        });
        setDisplayTasks(newTasks);
      }
      setAutoFilled(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingProject(false);
    }
  };

  const updateDisplay = (id: string, field: keyof DisplayEntry, value: any) => {
    setDisplays((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const updated = { ...d, [field]: value };
      // Regenerate tasks when structure type changes
      if (field === "structureType") {
        setDisplayTasks(prev => ({
          ...prev,
          [id]: getDefaultTasks(d.name, value),
        }));
      }
      return updated;
    }));
  };

  // AI suggest
  const handleAISuggest = async (sectionId: string) => {
    setAiLoadingSection(sectionId);
    try {
      const context = `Project: ${projectName}. Client: ${clientName}. Venue: ${venue}. Displays: ${validDisplays.map(d => `${d.name} (${d.heightFt}'H x ${d.widthFt}'W, ${d.pixelPitch}mm)`).join(", ")}. ${hasDemolition ? "Includes demolition." : ""} ${isUnionLabor ? "Union labor required." : ""} ${hasNightWork ? "Night work required." : ""}`;

      const sectionPrompts: Record<string, string> = {
        objective: `Write a concise 1-2 sentence objective for an LED display installation SOW. ${context}`,
        installation: `Write the installation timeline paragraph for an LED display SOW. ${context}`,
        overview: `Write a professional project overview paragraph for an LED display installation SOW. Keep Matt Hobbs' standard ANC format.`,
        electrical: `Write the electrical connection paragraph for an LED display installation SOW.`,
        testing: `Write the testing and adjusting paragraph for an LED display installation SOW.`,
        signoff: `Write the ANC signoff paragraph for an LED display installation SOW.`,
      };

      const prompt = sectionPrompts[sectionId] || `Write professional text for the "${sectionId}" section of an LED display installation SOW. ${context}`;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          systemPrompt: "You are a technical writer for ANC, an LED display installation company. Write concise, professional SOW section text. Output ONLY the section text, no headers or labels. Keep it under 3 sentences unless the section requires more detail.",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.response || data.message || "";
        if (text) {
          setSections(prev => ({ ...prev, [sectionId]: `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>` }));
        }
      }
    } catch {
      // Silently fail — AI assist is optional
    } finally {
      setAiLoadingSection(null);
    }
  };

  const canGenerate = projectName.trim() && validDisplays.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      // Extract plain text from HTML sections for the DOCX generator
      const stripHtml = (html: string) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
      };

      const sectionOverrides: Record<string, string> = {};
      Object.entries(sections).forEach(([key, html]) => {
        sectionOverrides[key] = stripHtml(html);
      });

      // Add objective and installation
      sectionOverrides.objective = objectiveText;
      sectionOverrides.installation = installationText;

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
        includeReferenceDocuments: includeRefDocs,
        currency,
        bidDueDate: bidDueDate,
        sectionOverrides,
        customExclusions: exclusions.filter(e => e.enabled && !DEFAULT_EXCLUSIONS.some(d => d.text === e.text)).map(e => e.text),
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

  // Continuous numbering
  const refDocsEndNum = includeRefDocs ? 2 : 0;
  const inclusionNum = refDocsEndNum + 1;
  const exclusionNum = refDocsEndNum + 2;
  const firstTaskNum = refDocsEndNum + 3;

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
            <p className="text-[11px] text-muted-foreground">Edit any section inline. Hover for AI suggestions. Download when ready.</p>
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
          <option value="">{projectsLoading ? "Loading projects..." : "Load from existing project..."}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName}{p.venue ? ` \u2014 ${p.venue}` : ""}{p.screenCount > 0 ? ` (${p.screenCount} screens)` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => loadProject(selectedProjectId)}
          disabled={!selectedProjectId || loadingProject}
          className={cn("px-3 py-1.5 rounded text-xs font-semibold transition-all", selectedProjectId && !loadingProject ? "bg-brand-blue text-white hover:bg-brand-blue/90" : "bg-muted text-muted-foreground")}
        >
          {loadingProject ? <Loader2 className="w-3 h-3 animate-spin" /> : "Load"}
        </button>
        {autoFilled && <span className="text-[10px] text-emerald-600 font-medium px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 rounded">Auto-filled from project</span>}
      </div>

      {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 text-xs text-red-600">{error}</div>}

      {/* ══════════════════════════════════════════════════════════════════
          LIVE DOCUMENT — TipTap-powered SOW Editor
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm overflow-hidden">

        {/* ANC Header */}
        <div className="border-b-[3px] border-red-600 px-8 py-4 flex flex-col items-center">
          <img src="/anc-logo-blue.png" alt="ANC" className="h-12 object-contain" />
          <div className="text-[10px] text-muted-foreground mt-0.5">www.anc.com</div>
        </div>

        <div className="px-8 py-6 space-y-1">
          {/* Title */}
          <h2 className="text-center text-xl font-bold text-foreground font-mono">Scope of Work:</h2>
          <p className="text-center text-base text-foreground mb-6">
            {venue || projectName || "[Venue]"} {hasDemolition ? "\u2013 Display Replacement" : "\u2013 Display Installation"}
          </p>

          {/* Project Info Block (Courier New style) */}
          <div className="font-mono text-xs space-y-1.5 mb-6 border-t-[3px] border-black dark:border-white pt-4">
            <div className="flex gap-2 items-center">
              <span className="font-bold w-32 shrink-0">PROJECT NAME:</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Enter project name" className="flex-1 bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-brand-blue focus:outline-none py-0.5" />
            </div>
            <div className="flex gap-2 items-center">
              <span className="font-bold w-32 shrink-0">ADDRESS:</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter full address" className="flex-1 bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-brand-blue focus:outline-none py-0.5" />
            </div>
            <div className="flex gap-2 items-center">
              <span className="font-bold w-32 shrink-0">DATE:</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputSm + " w-36"} />
              <span className="ml-8">Revision #{" "}</span>
              <input type="number" value={revision} onChange={(e) => setRevision(e.target.value)} min="0" className={inputSm + " w-12 text-center"} />
            </div>
          </div>

          {/* ── PROJECT OVERVIEW ────────────────────────────────────────── */}
          <div className="border-t-[3px] border-black dark:border-white pt-3 mb-4">
            <h3 className="font-mono text-sm tracking-wide font-bold text-foreground mb-2">PROJECT OVERVIEW</h3>
            <SectionEditor
              content={sections.overview}
              onChange={(html) => setSections(prev => ({ ...prev, overview: html }))}
              sectionId="overview"
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === "overview"}
            />
          </div>

          {/* ── Objective ──────────────────────────────────────────────── */}
          <div className="mb-4">
            <h3 className="text-sm font-bold underline text-foreground mb-1">Objective</h3>
            <p className="text-xs text-foreground/90 leading-relaxed">{objectiveText}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">Venue:</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue name" className="text-[11px] bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-brand-blue focus:outline-none flex-1" />
              <span className="text-[10px] text-muted-foreground ml-2">Client:</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="text-[11px] bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-brand-blue focus:outline-none flex-1" />
            </div>
          </div>

          {/* ── Installation ───────────────────────────────────────────── */}
          <div className="mb-4">
            <h3 className="text-sm font-bold underline text-foreground mb-1">Installation</h3>
            <p className="text-xs text-foreground/90 leading-relaxed mb-2">{installationText}</p>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Start:</span>
                <input type="date" value={installStart} onChange={(e) => setInstallStart(e.target.value)} className={inputSm + " w-32"} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">End:</span>
                <input type="date" value={installEnd} onChange={(e) => setInstallEnd(e.target.value)} className={inputSm + " w-32"} />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] ml-2">
                <input type="checkbox" checked={isUnionLabor} onChange={(e) => setIsUnionLabor(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <HardHat className="w-3.5 h-3.5 text-muted-foreground" /> Union Labor
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input type="checkbox" checked={hasNightWork} onChange={(e) => setHasNightWork(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <Moon className="w-3.5 h-3.5 text-muted-foreground" /> Night Work
              </label>
            </div>
          </div>

          {/* ── Electrical Connection ───────────────────────────────────── */}
          <div className="mb-4">
            <h3 className="text-sm font-bold underline text-foreground mb-1">Electrical Connection</h3>
            <SectionEditor
              content={sections.electrical}
              onChange={(html) => setSections(prev => ({ ...prev, electrical: html }))}
              sectionId="electrical"
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === "electrical"}
            />
          </div>

          {/* ── Testing and Adjusting ──────────────────────────────────── */}
          <div className="mb-4">
            <h3 className="text-sm font-bold underline text-foreground mb-1">Testing and Adjusting</h3>
            <SectionEditor
              content={sections.testing}
              onChange={(html) => setSections(prev => ({ ...prev, testing: html }))}
              sectionId="testing"
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === "testing"}
            />
          </div>

          {/* ── ANC Signoff ────────────────────────────────────────────── */}
          <div className="mb-4">
            <h3 className="text-sm font-bold underline text-foreground mb-1">ANC Signoff</h3>
            <SectionEditor
              content={sections.signoff}
              onChange={(html) => setSections(prev => ({ ...prev, signoff: html }))}
              sectionId="signoff"
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === "signoff"}
            />
          </div>

          {/* ── REFERENCE DOCUMENTS (optional) ─────────────────────────── */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-muted-foreground mb-2">
              <input type="checkbox" checked={includeRefDocs} onChange={(e) => setIncludeRefDocs(e.target.checked)} className="w-3.5 h-3.5 rounded" />
              <FileText className="w-3.5 h-3.5" /> Include Reference Documents Section
            </label>
            {includeRefDocs && (
              <div className="border-t-[3px] border-black dark:border-white pt-3">
                <h3 className="font-mono text-xs tracking-wide font-bold text-foreground mb-2">REFERENCE DOCUMENTS, EQUIPMENT LIST AND DESCRIPTION</h3>
                <div className="ml-4 space-y-0.5 text-[11px] text-foreground/80">
                  <p className="font-bold">1. <span className="underline">Reference Drawings (see attached):</span></p>
                  <p className="ml-4">1.1. Photos of Existing wall</p>
                  <p className="font-bold mt-1">2. <span className="underline">Equipment:</span></p>
                  <p className="ml-4">2.1. LED Panels/Detail</p>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              SCOPE OF WORK
              ══════════════════════════════════════════════════════════════ */}
          <div className="border-t-[3px] border-black dark:border-white pt-3">
            <h3 className="font-mono text-sm tracking-wide font-bold text-foreground mb-4">SCOPE OF WORK</h3>

            {/* General Inclusions (per display) */}
            <p className="text-xs font-bold text-foreground mb-3">{inclusionNum}. <span className="underline">General Inclusions:</span></p>

            <div className="space-y-2 mb-4">
              {displays.map((d, i) => (
                <DisplayCard
                  key={d.id}
                  display={d}
                  index={i}
                  inclusionNum={inclusionNum}
                  taskNum={firstTaskNum + i}
                  onUpdate={(field, value) => updateDisplay(d.id, field, value)}
                  onRemove={() => setDisplays(prev => prev.filter(x => x.id !== d.id))}
                  canRemove={displays.length > 1}
                  tasks={getDisplayTasks(d)}
                  onTasksChange={(tasks) => setTasksForDisplay(d.id, tasks)}
                />
              ))}
            </div>

            <button
              onClick={() => setDisplays(prev => [...prev, makeDisplay()])}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue/5 rounded-lg border border-dashed border-brand-blue/30 transition-colors mb-6"
            >
              <Plus className="w-3.5 h-3.5" /> Add Display
            </button>

            {/* General Exclusions */}
            <p className="text-xs font-bold text-foreground mb-2">{exclusionNum}. <span className="underline">General Exclusions:</span></p>
            <EditableList
              items={exclusions}
              onChange={setExclusions}
              numberPrefix={`${exclusionNum}.`}
              addLabel="Add exclusion"
            />

            {/* Per-display task sections (shown in collapsed summary) */}
            <div className="mt-6 space-y-2">
              {validDisplays.map((d, di) => {
                const tasks = getDisplayTasks(d).filter(t => t.enabled);
                return (
                  <div key={d.id} className="bg-muted/10 rounded-lg p-3 border border-border/30">
                    <p className="text-xs font-bold text-foreground mb-1">{firstTaskNum + di}. <span className="underline">{d.name || `Display ${di + 1}`} \u2013 QTY {d.quantity || 1}:</span></p>
                    <div className="ml-6 space-y-0.5">
                      {d.hasDemolition && (
                        <p className="text-[11px] text-foreground/70">{firstTaskNum + di}.1. Removal and disposal of existing displays, and secondary steel (as needed)</p>
                      )}
                      {tasks.map((t, ti) => (
                        <p key={t.id} className="text-[11px] text-foreground/70">{firstTaskNum + di}.{(d.hasDemolition ? ti + 2 : ti + 1)}. {t.text}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ITEMIZED PRICING ───────────────────────────────────────── */}
          <div className="border-t-[3px] border-black dark:border-white pt-3 mt-6">
            <h3 className="font-mono text-sm tracking-wide font-bold text-foreground mb-2">ITEMIZED PRICING</h3>
            <p className="text-xs text-foreground/80">The itemized pricing for the above Scope of Work should be provided in the format below as requested in the RFP documents. If you have any questions, please do not hesitate to send over.</p>
          </div>

          {/* ── BID DUE DATE ───────────────────────────────────────────── */}
          <div className="pt-4 pb-2">
            <div className="flex items-start gap-1">
              <span className="text-xs font-bold shrink-0">BID DUE DATE:</span>
              <input
                value={bidDueDate}
                onChange={(e) => setBidDueDate(e.target.value)}
                className="flex-1 text-xs bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-brand-blue focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between mt-6 p-4 rounded-xl bg-muted/30 border border-border">
        <div className="text-xs text-muted-foreground">
          {validDisplays.length} display{validDisplays.length !== 1 ? "s" : ""} |{" "}
          {exclusions.filter(e => e.enabled).length} exclusions |{" "}
          Rev #{revision}
          {autoFilled && " | Auto-filled from project"}
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
          Download DOCX
        </button>
      </div>
    </div>
  );
}
