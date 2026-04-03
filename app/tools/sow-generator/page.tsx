"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
  MessageSquare,
  Send,
  Zap,
  ArrowRight,
  History,
  Save,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
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

interface CustomSection {
  id: string;
  title: string;
  content: string;
  position: "before-scope" | "after-tasks";
}

interface ProjectSummary {
  id: string;
  clientName: string;
  venue: string | null;
  screenCount: number;
  updatedAt: string;
}

// Section presets — common sections Matt might need that aren't in the 3 reference SOWs
const SECTION_PRESETS: { title: string; content: string; icon: string }[] = [
  { title: "Safety Requirements", content: "<p>All work shall comply with OSHA standards and applicable local safety regulations. Subcontractor shall provide all required PPE for their workers and maintain a safe work environment at all times.</p>", icon: "shield" },
  { title: "Warranty", content: "<p>Subcontractor shall warrant all workmanship for a period of one (1) year from the date of substantial completion. Any defects in workmanship discovered during the warranty period shall be corrected at no additional cost to ANC or the Owner.</p>", icon: "badge" },
  { title: "Schedule Milestones", content: "<p>Subcontractor shall provide a detailed installation schedule within five (5) business days of contract execution. Schedule shall include mobilization, installation phases, testing, and demobilization dates.</p>", icon: "calendar" },
  { title: "Site Access & Logistics", content: "<p>Site access, staging areas, and working hours will be coordinated with the general contractor and venue operations. Subcontractor is responsible for coordinating material deliveries and crane/lift scheduling.</p>", icon: "truck" },
  { title: "Insurance Requirements", content: "<p>Subcontractor shall maintain Commercial General Liability insurance with minimum limits of $1,000,000 per occurrence and $2,000,000 aggregate. Certificate of insurance shall be provided prior to mobilization.</p>", icon: "shield-check" },
  { title: "Change Order Procedures", content: "<p>Any changes to the scope of work must be documented via written change order signed by both parties before work commences. No additional work will be compensated without prior written authorization from ANC.</p>", icon: "file-pen" },
  { title: "Material Storage", content: "<p>Subcontractor shall be responsible for secure storage of all materials on-site. ANC will coordinate with the Owner to provide designated staging and storage areas. Subcontractor assumes all risk for stored materials.</p>", icon: "warehouse" },
  { title: "Custom Section", content: "<p></p>", icon: "plus" },
];

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

// ─── Add Section Button + Preset Picker ─────────────────────────────────────

function AddSectionButton({
  position,
  showPicker,
  onTogglePicker,
  onAdd,
}: {
  position: "before-scope" | "after-tasks";
  showPicker: boolean;
  onTogglePicker: () => void;
  onAdd: (title: string, content: string) => void;
}) {
  return (
    <div className="relative my-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
        <button
          onClick={onTogglePicker}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-brand-blue hover:bg-brand-blue/5 rounded-full border border-dashed border-muted-foreground/30 hover:border-brand-blue/30 transition-all"
        >
          <Plus className="w-3 h-3" /> Add Section
        </button>
        <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
      </div>
      {showPicker && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-xl p-3 w-80">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Choose a section template</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SECTION_PRESETS.map((preset) => (
              <button
                key={preset.title}
                onClick={() => { onAdd(preset.title, preset.content); onTogglePicker(); }}
                className="text-left px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
              >
                <span className="text-xs font-medium text-foreground">{preset.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomSectionBlock({
  section,
  onUpdate,
  onRemove,
  onAISuggest,
  aiLoading,
}: {
  section: CustomSection;
  onUpdate: (field: "title" | "content", value: string) => void;
  onRemove: () => void;
  onAISuggest: (sectionId: string) => void;
  aiLoading: boolean;
}) {
  return (
    <div className="mb-4 group/custom relative border border-dashed border-brand-blue/20 rounded-lg p-3 bg-brand-blue/[0.02]">
      <div className="flex items-center gap-2 mb-1">
        <input
          value={section.title}
          onChange={(e) => onUpdate("title", e.target.value)}
          placeholder="Section Title"
          className="text-sm font-bold underline text-foreground bg-transparent border-none focus:outline-none flex-1"
        />
        <button onClick={() => onAISuggest(section.id)} disabled={aiLoading} className="p-1 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600" title="AI suggest">
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500" title="Remove section">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <SectionEditor
        content={section.content}
        onChange={(html) => onUpdate("content", html)}
        sectionId={section.id}
        placeholder="Click to write section content... or use the AI sparkle button"
      />
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

export default function SOWGeneratorPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <SOWGeneratorPage />
    </Suspense>
  );
}

function SOWGeneratorPage() {
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
  const [customSectionsBefore, setCustomSectionsBefore] = useState<CustomSection[]>([]);
  const [customSectionsAfter, setCustomSectionsAfter] = useState<CustomSection[]>([]);
  const [showPresetPicker, setShowPresetPicker] = useState<"before-scope" | "after-tasks" | null>(null);
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

  // Save / draft state
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // AI state
  const [aiLoadingSection, setAiLoadingSection] = useState<string | null>(null);
  const [aiCommand, setAiCommand] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiLastAction, setAiLastAction] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

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

  // ─── AI Command Handler ──────────────────────────────────────────
  const executeAICommand = async (command: string) => {
    if (!command.trim()) return;
    setAiProcessing(true);
    setAiLastAction(null);
    const cmd = command.toLowerCase().trim();

    try {
      // ── Local intent parsing (fast, no API call needed) ──────────

      // Add display: "add a 20x40 display called Main Scoreboard at 10mm"
      const displayMatch = cmd.match(/add\s+(?:a\s+)?(?:(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s+)?display\s+(?:called\s+|named\s+)?["""]?([^"""\d][^"""]*?)["""]?(?:\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*mm)?$/i)
        || cmd.match(/add\s+display\s*[:\-]?\s*(.+)/i);
      if (displayMatch || cmd.startsWith("add display")) {
        const newD = makeDisplay();
        if (displayMatch && displayMatch[3]) {
          // Full match: dimensions + name + pitch
          newD.heightFt = displayMatch[1] || "";
          newD.widthFt = displayMatch[2] || "";
          newD.name = displayMatch[3].trim();
          newD.pixelPitch = displayMatch[4] || "";
        } else if (displayMatch && displayMatch[1] && !displayMatch[2]) {
          // Simple: "add display Main Scoreboard"
          newD.name = displayMatch[1].trim();
        }
        setDisplays(prev => [...prev, newD]);
        setAiLastAction(`Added display "${newD.name || "New Display"}"`);
        setAiCommand("");
        setAiProcessing(false);
        return;
      }

      // Toggle union labor
      if (cmd.includes("union")) {
        const enable = !cmd.includes("no ") && !cmd.includes("remove") && !cmd.includes("disable");
        setIsUnionLabor(enable);
        setAiLastAction(enable ? "Enabled union labor" : "Disabled union labor");
        setAiCommand("");
        setAiProcessing(false);
        return;
      }

      // Toggle night work
      if (cmd.includes("night")) {
        const enable = !cmd.includes("no ") && !cmd.includes("remove") && !cmd.includes("disable");
        setHasNightWork(enable);
        setAiLastAction(enable ? "Enabled night work" : "Disabled night work");
        setAiCommand("");
        setAiProcessing(false);
        return;
      }

      // Set dates: "set dates april 1 to july 30" or "install from 05/01/26 to 07/30/26"
      const dateMatch = cmd.match(/(?:set\s+)?(?:install\s+)?(?:dates?|from)\s+(\S+)\s+(?:to|through|-)\s+(\S+)/i);
      if (dateMatch) {
        const tryParse = (s: string) => {
          const d = new Date(s);
          return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
        };
        const start = tryParse(dateMatch[1]);
        const end = tryParse(dateMatch[2]);
        if (start) setInstallStart(start);
        if (end) setInstallEnd(end);
        setAiLastAction(`Set install dates: ${start || dateMatch[1]} to ${end || dateMatch[2]}`);
        setAiCommand("");
        setAiProcessing(false);
        return;
      }

      // Set project info: "project name XYZ" / "venue ABC" / "client DEF"
      if (cmd.startsWith("project name") || cmd.startsWith("set project")) {
        const name = cmd.replace(/^(?:set\s+)?project\s+(?:name\s+)?/i, "").trim();
        if (name) { setProjectName(name); setAiLastAction(`Set project name: ${name}`); }
        setAiCommand(""); setAiProcessing(false); return;
      }
      if (cmd.startsWith("venue") || cmd.startsWith("set venue")) {
        const v = cmd.replace(/^(?:set\s+)?venue\s+/i, "").trim();
        if (v) { setVenue(v); setAiLastAction(`Set venue: ${v}`); }
        setAiCommand(""); setAiProcessing(false); return;
      }
      if (cmd.startsWith("client") || cmd.startsWith("set client")) {
        const c = cmd.replace(/^(?:set\s+)?client\s+/i, "").trim();
        if (c) { setClientName(c); setAiLastAction(`Set client: ${c}`); }
        setAiCommand(""); setAiProcessing(false); return;
      }
      if (cmd.startsWith("address") || cmd.startsWith("set address")) {
        const a = cmd.replace(/^(?:set\s+)?address\s+/i, "").trim();
        if (a) { setAddress(a); setAiLastAction(`Set address: ${a}`); }
        setAiCommand(""); setAiProcessing(false); return;
      }

      // Add/remove exclusion
      if (cmd.match(/add\s+exclusion/i)) {
        const text = cmd.replace(/^add\s+exclusion\s*/i, "").trim();
        if (text) {
          setExclusions(prev => [...prev, { id: uid(), text, enabled: true }]);
          setAiLastAction(`Added exclusion: ${text}`);
        }
        setAiCommand(""); setAiProcessing(false); return;
      }
      if (cmd.match(/remove\s+exclusion/i)) {
        const text = cmd.replace(/^remove\s+exclusion\s*/i, "").trim().toLowerCase();
        if (text) {
          setExclusions(prev => prev.filter(e => !e.text.toLowerCase().includes(text)));
          setAiLastAction(`Removed exclusion matching: ${text}`);
        }
        setAiCommand(""); setAiProcessing(false); return;
      }

      // Toggle demolition: "enable demolition" / "add demolition"
      if (cmd.includes("demolition")) {
        const enable = !cmd.includes("no ") && !cmd.includes("remove") && !cmd.includes("disable");
        setDisplays(prev => prev.map(d => ({ ...d, hasDemolition: enable })));
        setAiLastAction(enable ? "Enabled demolition for all displays" : "Disabled demolition");
        setAiCommand(""); setAiProcessing(false); return;
      }

      // Set revision
      const revMatch = cmd.match(/revision\s+#?(\d+)/i);
      if (revMatch) {
        setRevision(revMatch[1]);
        setAiLastAction(`Set revision to #${revMatch[1]}`);
        setAiCommand(""); setAiProcessing(false); return;
      }

      // ── AI-powered actions (needs API call) ──────────────────────

      // Add section with AI-generated content
      if (cmd.match(/(?:add|write|create)\s+(?:a\s+)?(?:section|clause)\s+(?:about|for|on|called)?\s*(.+)/i)) {
        const topicMatch = cmd.match(/(?:add|write|create)\s+(?:a\s+)?(?:section|clause)\s+(?:about|for|on|called)?\s*(.+)/i);
        const topic = topicMatch?.[1]?.trim() || command;

        // Check if it matches a preset
        const preset = SECTION_PRESETS.find(p => p.title.toLowerCase().includes(topic.toLowerCase()));
        if (preset && preset.title !== "Custom Section") {
          setCustomSectionsBefore(prev => [...prev, { id: uid(), title: preset.title, content: preset.content, position: "before-scope" }]);
          setAiLastAction(`Added "${preset.title}" section from template`);
          setAiCommand(""); setAiProcessing(false); return;
        }

        // AI-generate the content
        try {
          const context = `Project: ${projectName}. Venue: ${venue}. Client: ${clientName}. ${validDisplays.length} displays. ${hasDemolition ? "Demolition included." : ""} ${isUnionLabor ? "Union labor." : ""}`;
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `Write a professional "${topic}" section for an LED display installation SOW. Context: ${context}. Output ONLY the section text, 2-4 sentences, professional tone.`,
              systemPrompt: "You are a technical writer for ANC, an LED display installation company. Write concise, professional SOW section text. No headers or labels.",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.response || data.message || "";
            const title = topic.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            setCustomSectionsBefore(prev => [...prev, {
              id: uid(),
              title,
              content: `<p>${text}</p>`,
              position: "before-scope",
            }]);
            setAiLastAction(`Added "${title}" section with AI-generated content`);
          }
        } catch {
          setAiLastAction("AI unavailable — added blank section");
          const title = topic.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          setCustomSectionsBefore(prev => [...prev, { id: uid(), title, content: "<p></p>", position: "before-scope" }]);
        }
        setAiCommand(""); setAiProcessing(false); return;
      }

      // Fallback: ask AI to interpret and respond
      try {
        const context = `Current SOW state: Project "${projectName}", Venue "${venue}", Client "${clientName}", ${validDisplays.length} display(s): ${validDisplays.map(d => d.name).join(", ")}. Union: ${isUnionLabor}. Night: ${hasNightWork}. Exclusions: ${exclusions.filter(e => e.enabled).map(e => e.text).join(", ")}.`;
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `The user said: "${command}". ${context}. Interpret what they want and respond with a brief, helpful answer. If they're asking you to do something, explain what action to take.`,
            systemPrompt: "You are an AI assistant helping build an LED display installation SOW for ANC. Be concise and actionable.",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setAiLastAction(data.response || data.message || "I understood your request but couldn't execute it automatically. Try a more specific command.");
        }
      } catch {
        setAiLastAction("Try: 'add display [name]', 'add section about [topic]', 'set venue [name]', 'union labor', 'night work'");
      }
      setAiCommand("");
    } finally {
      setAiProcessing(false);
    }
  };

  // Build form state for saving
  const buildFormState = useCallback(() => ({
    projectName, clientName, venue, address, date, revision,
    installStart, installEnd, isUnionLabor, hasNightWork,
    includeRefDocs, bidDueDate, currency, sections,
    displays: displays.map(d => ({ ...d })),
    displayTasks: Object.fromEntries(
      Object.entries(displayTasks).map(([k, v]) => [k, v.map(t => ({ ...t }))])
    ),
    exclusions: exclusions.map(e => ({ ...e })),
    customSectionsBefore: customSectionsBefore.map(s => ({ ...s })),
    customSectionsAfter: customSectionsAfter.map(s => ({ ...s })),
  }), [projectName, clientName, venue, address, date, revision, installStart, installEnd, isUnionLabor, hasNightWork, includeRefDocs, bidDueDate, currency, sections, displays, displayTasks, exclusions, customSectionsBefore, customSectionsAfter]);

  // Save draft
  const handleSave = async () => {
    setSaving(true);
    setSavedAt(null);
    try {
      const formState = buildFormState();
      if (draftId) {
        await fetch("/api/sow/history", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId,
            projectName: projectName.trim() || "Untitled SOW",
            clientName: clientName.trim(),
            venue: venue.trim(),
            displayCount: validDisplays.length,
            hasUnionLabor, hasNightWork,
            formState,
          }),
        });
      } else {
        const res = await fetch("/api/sow/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: projectName.trim() || "Untitled SOW",
            clientName: clientName.trim(),
            venue: venue.trim(),
            displayCount: validDisplays.length,
            hasUnionLabor, hasNightWork,
            formState,
          }),
        });
        const data = await res.json();
        if (data.id) setDraftId(data.id);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Load draft from history
  const loadDraft = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sow/history/${id}`);
      if (!res.ok) return;
      const record = await res.json();
      const fs = record.generationInput || {};
      setDraftId(id);
      if (fs.projectName) setProjectName(fs.projectName);
      if (fs.clientName) setClientName(fs.clientName);
      if (fs.venue) setVenue(fs.venue);
      if (fs.address) setAddress(fs.address);
      if (fs.date) setDate(fs.date);
      if (fs.revision) setRevision(fs.revision);
      if (fs.installStart) setInstallStart(fs.installStart);
      if (fs.installEnd) setInstallEnd(fs.installEnd);
      if (fs.isUnionLabor !== undefined) setIsUnionLabor(fs.isUnionLabor);
      if (fs.hasNightWork !== undefined) setHasNightWork(fs.hasNightWork);
      if (fs.includeRefDocs !== undefined) setIncludeRefDocs(fs.includeRefDocs);
      if (fs.bidDueDate) setBidDueDate(fs.bidDueDate);
      if (fs.currency) setCurrency(fs.currency);
      if (fs.sections) setSections(fs.sections);
      if (fs.displays?.length) setDisplays(fs.displays);
      if (fs.displayTasks) setDisplayTasks(fs.displayTasks);
      if (fs.exclusions?.length) setExclusions(fs.exclusions);
      if (fs.customSectionsBefore?.length) setCustomSectionsBefore(fs.customSectionsBefore);
      if (fs.customSectionsAfter?.length) setCustomSectionsAfter(fs.customSectionsAfter);
      setAutoFilled(true);
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
  }, []);

  // Load from URL param on mount
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) loadDraft(loadId);
  }, [searchParams, loadDraft]);

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
        customSections: [
          ...customSectionsBefore.map(cs => ({ title: cs.title, content: stripHtml(cs.content), position: "before-scope" })),
          ...customSectionsAfter.map(cs => ({ title: cs.title, content: stripHtml(cs.content), position: "after-tasks" })),
        ],
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

  const [generatingPremium, setGeneratingPremium] = useState(false);

  const handleGeneratePremium = async () => {
    if (!canGenerate) return;
    setGeneratingPremium(true);
    setError(null);
    try {
      const stripHtml2 = (html: string) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
      };
      const sectionOverrides2: Record<string, string> = {};
      Object.entries(sections).forEach(([key, html]) => {
        sectionOverrides2[key] = stripHtml2(html);
      });
      sectionOverrides2.objective = objectiveText;
      sectionOverrides2.installation = installationText;
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
        bidDueDate,
        sectionOverrides: sectionOverrides2,
        customExclusions: exclusions.filter(e => e.enabled && !DEFAULT_EXCLUSIONS.some(d => d.text === e.text)).map(e => e.text),
        customSections: [
          ...customSectionsBefore.map(cs => ({ title: cs.title, content: stripHtml2(cs.content), position: "before-scope" })),
          ...customSectionsAfter.map(cs => ({ title: cs.title, content: stripHtml2(cs.content), position: "after-tasks" })),
        ],
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
      const res = await fetch("/api/sow/generate-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.trim()} - Installation SOW (Premium).docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setGeneratingPremium(false);
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
        <div className="flex items-center gap-2">
          <Link
            href="/tools/sow-generator/history"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : savedAt ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : savedAt ? `Saved ${savedAt}` : "Save"}
          </button>
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
        <div className="border-b-[3px] border-[#0A52EF] px-8 py-4 flex flex-col items-center">
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

          {/* ── Custom Sections (before SCOPE OF WORK) ──────────────────── */}
          {customSectionsBefore.map((cs) => (
            <CustomSectionBlock
              key={cs.id}
              section={cs}
              onUpdate={(field, value) => setCustomSectionsBefore(prev => prev.map(s => s.id === cs.id ? { ...s, [field]: value } : s))}
              onRemove={() => setCustomSectionsBefore(prev => prev.filter(s => s.id !== cs.id))}
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === cs.id}
            />
          ))}

          <AddSectionButton
            position="before-scope"
            showPicker={showPresetPicker === "before-scope"}
            onTogglePicker={() => setShowPresetPicker(prev => prev === "before-scope" ? null : "before-scope")}
            onAdd={(title, content) => setCustomSectionsBefore(prev => [...prev, { id: uid(), title, content, position: "before-scope" }])}
          />

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

          {/* ── Custom Sections (after tasks, before pricing) ─────────── */}
          {customSectionsAfter.map((cs) => (
            <CustomSectionBlock
              key={cs.id}
              section={cs}
              onUpdate={(field, value) => setCustomSectionsAfter(prev => prev.map(s => s.id === cs.id ? { ...s, [field]: value } : s))}
              onRemove={() => setCustomSectionsAfter(prev => prev.filter(s => s.id !== cs.id))}
              onAISuggest={handleAISuggest}
              aiLoading={aiLoadingSection === cs.id}
            />
          ))}

          <AddSectionButton
            position="after-tasks"
            showPicker={showPresetPicker === "after-tasks"}
            onTogglePicker={() => setShowPresetPicker(prev => prev === "after-tasks" ? null : "after-tasks")}
            onAdd={(title, content) => setCustomSectionsAfter(prev => [...prev, { id: uid(), title, content, position: "after-tasks" }])}
          />

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

      {/* ═══ AI Command Bar (sticky bottom) ═══ */}
      <div className="sticky bottom-0 left-0 right-0 mt-6 bg-background/95 backdrop-blur-sm border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-xl z-30">
        {/* AI response toast */}
        {aiLastAction && (
          <div className="px-4 py-2 bg-brand-blue/5 border-b border-brand-blue/10">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              <Zap className="w-3.5 h-3.5 text-brand-blue shrink-0" />
              <p className="text-xs text-foreground flex-1">{aiLastAction}</p>
              <button onClick={() => setAiLastAction(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Quick action chips */}
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-none">
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">Quick:</span>
            {[
              { label: "+ Display", cmd: "add display " },
              { label: "+ Section", cmd: "add section about " },
              { label: "Union Labor", cmd: "union labor" },
              { label: "Night Work", cmd: "night work" },
              { label: "Demolition", cmd: "enable demolition" },
              { label: "+ Exclusion", cmd: "add exclusion " },
              { label: "Safety Section", cmd: "add section about safety requirements" },
              { label: "Warranty", cmd: "add section about warranty" },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => {
                  if (chip.cmd.endsWith(" ")) {
                    setAiCommand(chip.cmd);
                    aiInputRef.current?.focus();
                  } else {
                    executeAICommand(chip.cmd);
                  }
                }}
                className="shrink-0 px-2 py-1 text-[10px] font-medium rounded-full border border-border hover:border-brand-blue/30 hover:bg-brand-blue/5 text-muted-foreground hover:text-brand-blue transition-all"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Command input + download */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
              <input
                ref={aiInputRef}
                value={aiCommand}
                onChange={(e) => setAiCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !aiProcessing) executeAICommand(aiCommand); }}
                placeholder='Try: "add 20x40 display called Main Scoreboard at 10mm" or "write a safety section"'
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-border bg-muted/30 focus:bg-background focus:border-brand-blue/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/10 transition-all"
                disabled={aiProcessing}
              />
              {aiCommand && (
                <button
                  onClick={() => executeAICommand(aiCommand)}
                  disabled={aiProcessing}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-brand-blue text-white hover:bg-brand-blue/90 transition-colors"
                >
                  {aiProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <button
              onClick={handleGeneratePremium}
              disabled={!canGenerate || generatingPremium}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shrink-0",
                canGenerate && !generatingPremium
                  ? "bg-[#0A52EF] text-white hover:bg-[#0842BF] shadow-lg shadow-[#0A52EF]/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {generatingPremium ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              DOCX
            </button>
          </div>

          {/* Status line */}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-muted-foreground">
              {validDisplays.length} display{validDisplays.length !== 1 ? "s" : ""} |{" "}
              {exclusions.filter(e => e.enabled).length} exclusions |{" "}
              {customSectionsBefore.length + customSectionsAfter.length > 0 ? `${customSectionsBefore.length + customSectionsAfter.length} custom section${customSectionsBefore.length + customSectionsAfter.length > 1 ? "s" : ""} | ` : ""}
              Rev #{revision}
              {autoFilled && " | Auto-filled"}
            </p>
            <p className="text-[10px] text-muted-foreground">AI-assisted SOW builder</p>
          </div>
        </div>
      </div>
    </div>
  );
}
