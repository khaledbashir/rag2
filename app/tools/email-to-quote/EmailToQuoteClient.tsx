"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    AlertTriangle,
    ArrowRight,
    BrainCircuit,
    CheckCircle2,
    Clipboard,
    ExternalLink,
    FileSearch,
    Loader2,
    MailPlus,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import type { EmailQuoteIntake, IntakeDisplaySpec, IntakeProject } from "@/services/intake/emailToQuoteIntake";

const SAMPLE_SUBJECT = "49ers New LED Signage - Rough Estimate";

const SAMPLE_BODY = `Please see below for the areas we'd love some rough estimates for. Ideally, we get a breakdown of the total costs for each individual project (hardware, installation, etc.). Let me know if you need anything else.

Project 1: Gate F LEDs (2 vb's)
Quote #1 = Same size boards as the other two plaza boards
Quote #2= Specs below

Project 2: Exterior Suite Tower (2 vd's)
Left Board = 60' x 60'
Right Board = 60' x 60'

Project 3: Ring of Honor LEDs
Upper LED Ribbon = 8' x 550'
Lower ribbon = 3'6" x 55'

Kevin Hilton
EVP, Corporate Partnerships
M: 925.785.0776
4655 Great America Pkwy, Suite 201
Santa Clara, CA 95054`;

interface DraftProject {
    id: string;
    url: string;
}

interface CrmHandoff {
    action: "created" | "updated";
    company: { id: string; name: string; url: string };
    opportunity: { id: string; name: string; url: string; bidStatus?: string | null; ledSqFt?: number | null };
    estimatorUrl: string;
    followUpEmail: string;
}

type ParseState = "idle" | "parsing" | "parsed" | "creating";

interface ReviewStreamState {
    active: boolean;
    status: string;
    detail: string;
    markdown: string;
}

function formatDimension(width?: number, height?: number) {
    if (!width || !height) return "Needs dimensions";
    const formatFeet = (value: number) => Number.isInteger(value) ? `${value}'` : `${value.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "")}'`;
    return `${formatFeet(height)} x ${formatFeet(width)}`;
}

function displayCount(project: IntakeProject) {
    return project.displays.length + project.quoteOptions.reduce((sum, option) => sum + option.displays.length, 0);
}

function uniqueMissing(intake: EmailQuoteIntake | null) {
    if (!intake) return [];
    return Array.from(new Set(intake.missingAssumptions)).slice(0, 8);
}

function formatConfidence(value?: number) {
    if (typeof value !== "number") return "Not available";
    return `${Math.round(value * 100)}%`;
}

function reviewTone(status?: string) {
    if (status === "reviewed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function reviewLabel(status?: string) {
    if (status === "reviewed") return "AI reviewed";
    if (status === "failed") return "AI review failed";
    return "Parser output only";
}

function parseOptionalNumber(value: string) {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function displayRowsForProject(project: IntakeProject, projectIndex: number, baseEstimatorIndex: number) {
    let estimatorIndex = baseEstimatorIndex;
    const rows: Array<{
        display: IntakeDisplaySpec;
        projectIndex: number;
        displayIndex: number;
        optionIndex?: number;
        optionLabel?: string;
        estimatorIndex: number;
    }> = [];

    project.displays.forEach((display, displayIndex) => {
        rows.push({ display, projectIndex, displayIndex, estimatorIndex });
        estimatorIndex += 1;
    });

    project.quoteOptions.forEach((option, optionIndex) => {
        option.displays.forEach((display, displayIndex) => {
            rows.push({ display, projectIndex, optionIndex, optionLabel: option.label, displayIndex, estimatorIndex });
            estimatorIndex += 1;
        });
    });

    return rows;
}

export default function EmailToQuoteClient() {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [intake, setIntake] = useState<EmailQuoteIntake | null>(null);
    const [draft, setDraft] = useState<DraftProject | null>(null);
    const [crmHandoff, setCrmHandoff] = useState<CrmHandoff | null>(null);
    const [state, setState] = useState<ParseState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [reviewStream, setReviewStream] = useState<ReviewStreamState>({
        active: false,
        status: "Ready",
        detail: "",
        markdown: "",
    });

    const missingAssumptions = useMemo(() => uniqueMissing(intake), [intake]);
    const parsedDisplays = intake?.estimatorAnswers.displays.length || 0;
    const projectEstimatorOffsets = useMemo(() => {
        if (!intake) return [];
        let offset = 0;
        return intake.projects.map((project) => {
            const current = offset;
            offset += displayCount(project);
            return current;
        });
    }, [intake]);

    const reviewEmail = async () => {
        if (!body.trim()) {
            setError("Paste the email body first.");
            return;
        }

        setState("parsing");
        setError(null);
        setDraft(null);
        setCrmHandoff(null);
        setReviewStream({
            active: true,
            status: "Starting review",
            detail: "Reading the email and preparing the AI review.",
            markdown: "",
        });

        try {
            const res = await fetch("/api/intake/email-to-quote/review-stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body }),
            });

            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Email review failed");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split("\n\n");
                buffer = events.pop() || "";

                for (const event of events) {
                    const line = event.split("\n").find((item) => item.startsWith("data: "));
                    if (!line) continue;

                    const chunk = JSON.parse(line.slice(6));
                    if (chunk.type === "status") {
                        setReviewStream((current) => ({
                            ...current,
                            status: chunk.label || current.status,
                            detail: chunk.detail || "",
                        }));
                    }

                    if (chunk.type === "reasoning" && chunk.markdown) {
                        setReviewStream((current) => ({
                            ...current,
                            markdown: `${current.markdown}${chunk.markdown}`,
                        }));
                    }

                    if (chunk.type === "review" && chunk.intake) {
                        setIntake(chunk.intake);
                        setReviewStream((current) => ({
                            active: false,
                            status: chunk.intake.aiReview?.status === "reviewed" ? "AI review complete" : "Review needs attention",
                            detail: chunk.intake.aiReview?.summary || chunk.intake.aiReview?.error || "",
                            markdown: chunk.intake.aiReview?.reasoningMarkdown || current.markdown,
                        }));
                    }

                    if (chunk.type === "done") {
                        setState("parsed");
                    }
                }
            }

            setState("parsed");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Email review failed");
            setReviewStream((current) => ({
                ...current,
                active: false,
                status: "Review failed",
                detail: err instanceof Error ? err.message : "Email review failed",
            }));
            setState(intake ? "parsed" : "idle");
        }
    };

    const createDraft = async () => {
        if (!body.trim()) {
            setError("Paste the email body first.");
            return;
        }

        setState("creating");
        setError(null);
        setDraft(null);
        setCrmHandoff(null);

        try {
            const res = await fetch("/api/intake/email-to-quote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject,
                    body,
                    createDraft: true,
                    createCrmHandoff: true,
                    intakeOverride: intake || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Draft creation failed");

            setIntake(data.intake);
            if (data.project) setDraft(data.project);
            if (data.crmHandoff) setCrmHandoff(data.crmHandoff);
            setState("parsed");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Draft creation failed");
            setState(intake ? "parsed" : "idle");
        }
    };

    const reset = () => {
        setSubject("");
        setBody("");
        setIntake(null);
        setDraft(null);
        setCrmHandoff(null);
        setError(null);
        setState("idle");
        setReviewStream({ active: false, status: "Ready", detail: "", markdown: "" });
    };

    const loadSample = () => {
        setSubject(SAMPLE_SUBJECT);
        setBody(SAMPLE_BODY);
        setDraft(null);
        setCrmHandoff(null);
        setError(null);
        setReviewStream({ active: false, status: "Ready", detail: "", markdown: "" });
    };

    const updateDraftField = (field: "title" | "clientName" | "venueName", value: string) => {
        setIntake((current) => {
            if (!current) return current;
            return {
                ...current,
                [field]: value,
                estimatorAnswers: {
                    ...current.estimatorAnswers,
                    projectName: field === "title" ? value : current.estimatorAnswers.projectName,
                    clientName: field === "clientName" ? value : current.estimatorAnswers.clientName,
                    location: field === "venueName" ? value : current.estimatorAnswers.location,
                },
            };
        });
    };

    const updateDisplay = (
        projectIndex: number,
        displayIndex: number,
        estimatorIndex: number,
        field: "name" | "quantity" | "widthFt" | "heightFt",
        value: string,
        optionIndex?: number,
    ) => {
        setIntake((current) => {
            if (!current) return current;

            const projects = current.projects.map((project, idx) => {
                if (idx !== projectIndex) return project;

                if (typeof optionIndex === "number") {
                    return {
                        ...project,
                        quoteOptions: project.quoteOptions.map((option, optIdx) => {
                            if (optIdx !== optionIndex) return option;
                            return {
                                ...option,
                                displays: option.displays.map((display, dispIdx) => (
                                    dispIdx === displayIndex ? updateIntakeDisplay(display, field, value) : display
                                )),
                            };
                        }),
                    };
                }

                return {
                    ...project,
                    displays: project.displays.map((display, dispIdx) => (
                        dispIdx === displayIndex ? updateIntakeDisplay(display, field, value) : display
                    )),
                };
            });

            const estimatorDisplays = current.estimatorAnswers.displays.map((display, idx) => {
                if (idx !== estimatorIndex) return display;
                const numberValue = field === "name" ? undefined : parseOptionalNumber(value);
                if (field === "name") return { ...display, displayName: value };
                if (field === "quantity") return { ...display, quantity: numberValue || 1 };
                if (field === "widthFt") return { ...display, widthFt: numberValue || 0, rfpWidthFt: numberValue || 0 };
                return { ...display, heightFt: numberValue || 0, rfpHeightFt: numberValue || 0 };
            });

            return {
                ...current,
                projects,
                estimatorAnswers: {
                    ...current.estimatorAnswers,
                    displays: estimatorDisplays,
                },
            };
        });
    };

    const isWorking = state === "parsing" || state === "creating";

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <MailPlus className="h-5 w-5 text-emerald-500" />
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-semibold tracking-tight">Email Intake</h1>
                            <p className="truncate text-xs text-muted-foreground">Inbound request to estimator draft</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadSample}
                            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                            <Clipboard className="h-3.5 w-3.5" />
                            Load sample
                        </button>
                        <button
                            onClick={reset}
                            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(360px,0.9fr)_minmax(480px,1.1fr)]">
                <section className="space-y-4">
                    <div className="rounded border border-border bg-card p-4">
                        <label className="block text-xs font-medium text-muted-foreground" htmlFor="email-subject">
                            Subject
                        </label>
                        <input
                            id="email-subject"
                            value={subject}
                            onChange={(event) => setSubject(event.target.value)}
                            placeholder="49ers New LED Signage - Rough Estimate"
                            className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                        />
                    </div>

                    <div className="rounded border border-border bg-card p-4">
                        <label className="block text-xs font-medium text-muted-foreground" htmlFor="email-body">
                            Email body
                        </label>
                        <textarea
                            id="email-body"
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            placeholder="Paste the inbound request email here..."
                            className="mt-2 h-[420px] w-full resize-none rounded border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 rounded border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={reviewEmail}
                            disabled={isWorking || !body.trim()}
                            className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Sparkles className="h-4 w-4" />
                            AI review email
                        </button>
                        <button
                            onClick={createDraft}
                            disabled={isWorking || !body.trim()}
                            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {state === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            Create CRM handoff
                        </button>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded border border-border bg-card p-4">
                            <div className="text-xl font-semibold tabular-nums">{intake?.projects.length || 0}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Project areas</div>
                        </div>
                        <div className="rounded border border-border bg-card p-4">
                            <div className="text-xl font-semibold tabular-nums">{parsedDisplays}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Displays/options</div>
                        </div>
                        <div className="rounded border border-border bg-card p-4">
                            <div className="truncate text-xl font-semibold">{intake ? reviewLabel(intake.aiReview?.status) : "Ready"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Review layer</div>
                        </div>
                    </div>

                    {draft && !crmHandoff && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                <div>
                                    <div className="text-sm font-medium">Draft estimate created</div>
                                    <div className="text-xs text-muted-foreground">{intake?.title}</div>
                                </div>
                            </div>
                            <Link
                                href={draft.url}
                                className="inline-flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                            >
                                Open estimator
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    )}

                    {crmHandoff && (
                        <CrmHandoffPanel handoff={crmHandoff} draft={draft} />
                    )}

                    {(reviewStream.active || reviewStream.markdown || state === "parsing") && (
                        <LiveReviewPanel stream={reviewStream} />
                    )}

                    {intake?.aiReview && (
                        <AiReviewPanel intake={intake} />
                    )}

                    {intake && (
                        <div className="rounded border border-border bg-card p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold">Draft fields</h2>
                                    <p className="mt-1 text-xs text-muted-foreground">Edits here carry into the estimate draft.</p>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                                <EditableText label="Project name" value={intake.title} onChange={(value) => updateDraftField("title", value)} />
                                <EditableText label="Client" value={intake.clientName} onChange={(value) => updateDraftField("clientName", value)} />
                                <EditableText label="Venue" value={intake.venueName || ""} onChange={(value) => updateDraftField("venueName", value)} />
                            </div>
                        </div>
                    )}

                    <div className="p-1">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold">{intake?.title || "Parser output"}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">{intake?.summary || "Parsed projects and quote assumptions will appear here."}</p>
                            </div>
                            {intake?.requesterName && (
                                <div className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{intake.requesterName}</div>
                            )}
                        </div>

                        <div className="mt-4 space-y-3">
                            {intake?.projects.map((project, projectIndex) => (
                                <ProjectReview
                                    key={`${project.projectNumber}-${project.name}`}
                                    project={project}
                                    projectIndex={projectIndex}
                                    baseEstimatorIndex={projectEstimatorOffsets[projectIndex] || 0}
                                    onDisplayChange={updateDisplay}
                                />
                            ))}
                        </div>
                    </div>

                    {missingAssumptions.length > 0 && (
                        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4" />
                                Review assumptions
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {missingAssumptions.map((item) => (
                                    <span key={item} className="rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function updateIntakeDisplay(display: IntakeDisplaySpec, field: "name" | "quantity" | "widthFt" | "heightFt", value: string): IntakeDisplaySpec {
    if (field === "name") return { ...display, name: value };
    const numberValue = parseOptionalNumber(value);
    if (field === "quantity") return { ...display, quantity: numberValue || 1 };
    if (field === "widthFt") return { ...display, widthFt: numberValue };
    return { ...display, heightFt: numberValue };
}

function CrmHandoffPanel({ handoff, draft }: { handoff: CrmHandoff; draft: DraftProject | null }) {
    const copyFollowUp = async () => {
        await navigator.clipboard?.writeText(handoff.followUpEmail);
    };

    return (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                    <div>
                        <div className="text-sm font-semibold">
                            CRM handoff {handoff.action === "created" ? "created" : "updated"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Opportunity, timeline note, quote draft, and follow-up email are ready.
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={handoff.opportunity.url}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                    >
                        Open CRM
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                        href={draft?.url || handoff.estimatorUrl}
                        className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        Open quote
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Company</div>
                    <div className="mt-1 truncate text-sm font-medium">{handoff.company.name}</div>
                </div>
                <div className="rounded border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Opportunity</div>
                    <div className="mt-1 truncate text-sm font-medium">{handoff.opportunity.name}</div>
                </div>
                <div className="rounded border border-border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">LED area</div>
                    <div className="mt-1 text-sm font-medium tabular-nums">
                        {handoff.opportunity.ledSqFt ? `${Math.round(handoff.opportunity.ledSqFt).toLocaleString()} sq ft` : "Needs dimensions"}
                    </div>
                </div>
            </div>

            <div className="mt-4 rounded border border-border bg-background p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client follow-up</div>
                    <button
                        type="button"
                        onClick={copyFollowUp}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        <Clipboard className="h-3.5 w-3.5" />
                        Copy
                    </button>
                </div>
                <pre className="whitespace-pre-wrap text-xs leading-5 text-foreground/85">{handoff.followUpEmail}</pre>
            </div>
        </div>
    );
}

function EditableText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block text-xs font-medium text-muted-foreground">
            {label}
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary"
            />
        </label>
    );
}

function LiveReviewPanel({ stream }: { stream: ReviewStreamState }) {
    return (
        <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="relative mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <BrainCircuit className="h-4 w-4" />
                        {stream.active && <span className="absolute inset-0 animate-ping rounded-full border border-emerald-500/30" />}
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-foreground">{stream.status}</div>
                        {stream.detail && <div className="mt-1 text-xs text-muted-foreground">{stream.detail}</div>}
                    </div>
                </div>
                <div className="rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                    GLM 5.2 reasoning
                </div>
            </div>

            <div className="mt-4 max-h-[360px] overflow-y-auto rounded border border-border bg-background p-4">
                {stream.markdown ? (
                    <div className="text-sm leading-relaxed text-foreground/85 [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{stream.markdown}</ReactMarkdown>
                        {stream.active && <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-emerald-500 align-middle" />}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        Preparing review notes...
                    </div>
                )}
            </div>
        </div>
    );
}

function AiReviewPanel({ intake }: { intake: EmailQuoteIntake }) {
    const review = intake.aiReview;
    if (!review) return null;

    return (
        <div className={`rounded border p-4 ${reviewTone(review.status)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <div className="text-sm font-semibold">{reviewLabel(review.status)}</div>
                        <div className="mt-1 text-xs opacity-80">
                            Confidence: {formatConfidence(review.confidence)}
                            {review.reviewedAt ? ` · ${new Date(review.reviewedAt).toLocaleString()}` : ""}
                        </div>
                    </div>
                </div>
                <div className="rounded bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                    {review.status === "reviewed" ? "Review engine" : "AI unavailable"}
                </div>
            </div>

            {review.summary && (
                <p className="mt-3 text-sm text-foreground">{review.summary}</p>
            )}

            {review.error && (
                <div className="mt-3 rounded border border-current/20 bg-background/70 px-3 py-2 text-xs text-foreground">
                    {review.error}
                </div>
            )}

            {review.evidence.length > 0 && (
                <div className="mt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                        <FileSearch className="h-3.5 w-3.5" />
                        Evidence from email
                    </div>
                    <div className="space-y-2">
                        {review.evidence.map((item, index) => (
                            <div key={`${item.claim}-${index}`} className="rounded border border-border bg-background p-3">
                                <div className="text-xs font-medium text-foreground">{item.claim}</div>
                                <div className="mt-1 text-xs text-muted-foreground">"{item.sourceText}"</div>
                                <div className="mt-2 text-[11px] text-muted-foreground">Confidence {formatConfidence(item.confidence)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {review.displayReview.length > 0 && (
                <div className="mt-4 overflow-hidden rounded border border-border bg-background">
                    <div className="grid grid-cols-[1fr_92px] border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                        <span>Display check</span>
                        <span>Status</span>
                    </div>
                    {review.displayReview.map((item, index) => (
                        <div key={`${item.projectName}-${item.displayName}-${index}`} className="grid grid-cols-[1fr_92px] gap-3 px-3 py-2 text-xs">
                            <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">{item.projectName}{item.displayName ? ` · ${item.displayName}` : ""}</div>
                                <div className="mt-1 line-clamp-2 text-muted-foreground">{item.note || item.sourceText}</div>
                            </div>
                            <span className="self-start rounded bg-muted px-2 py-1 text-[11px] capitalize text-muted-foreground">
                                {item.status.replace("_", " ")}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {(review.questions.length > 0 || review.riskFlags.length > 0) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {review.questions.length > 0 && (
                        <div className="rounded border border-border bg-background p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions to resolve</div>
                            <div className="mt-2 space-y-2">
                                {review.questions.map((item, index) => (
                                    <div key={`${item.question}-${index}`} className="text-xs">
                                        <div className="font-medium text-foreground">{item.question}</div>
                                        {item.why && <div className="mt-1 text-muted-foreground">{item.why}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {review.riskFlags.length > 0 && (
                        <div className="rounded border border-border bg-background p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk flags</div>
                            <div className="mt-2 space-y-1">
                                {review.riskFlags.map((item) => (
                                    <div key={item} className="text-xs text-foreground">{item}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ProjectReview({
    project,
    projectIndex,
    baseEstimatorIndex,
    onDisplayChange,
}: {
    project: IntakeProject;
    projectIndex: number;
    baseEstimatorIndex: number;
    onDisplayChange: (
        projectIndex: number,
        displayIndex: number,
        estimatorIndex: number,
        field: "name" | "quantity" | "widthFt" | "heightFt",
        value: string,
        optionIndex?: number,
    ) => void;
}) {
    const displays = displayRowsForProject(project, projectIndex, baseEstimatorIndex);

    return (
        <div className="rounded border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-medium">{project.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        Project {project.projectNumber} - {displayCount(project)} display{displayCount(project) === 1 ? "" : "s"}
                    </div>
                </div>
                {project.quoteOptions.length > 0 && (
                    <div className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {project.quoteOptions.length} option{project.quoteOptions.length === 1 ? "" : "s"}
                    </div>
                )}
            </div>

            {displays.length > 0 && (
                <div className="mt-3 overflow-hidden rounded border border-border">
                    <div className="grid grid-cols-[minmax(160px,1fr)_72px_92px_92px] border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                        <span>Display</span>
                        <span>Qty</span>
                        <span>Width</span>
                        <span>Height</span>
                    </div>
                    {displays.map((row) => (
                        <div key={`${row.estimatorIndex}-${row.display.name}`} className="grid grid-cols-[minmax(160px,1fr)_72px_92px_92px] gap-2 px-3 py-2 text-xs">
                            <div className="min-w-0">
                                {row.optionLabel && <div className="mb-1 text-[10px] text-muted-foreground">{row.optionLabel}</div>}
                                <input
                                    value={row.display.name}
                                    onChange={(event) => onDisplayChange(row.projectIndex, row.displayIndex, row.estimatorIndex, "name", event.target.value, row.optionIndex)}
                                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none transition-colors focus:border-primary"
                                />
                            </div>
                            <input
                                type="number"
                                min="1"
                                value={row.display.quantity}
                                onChange={(event) => onDisplayChange(row.projectIndex, row.displayIndex, row.estimatorIndex, "quantity", event.target.value, row.optionIndex)}
                                className="h-8 w-full rounded border border-border bg-background px-2 text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary"
                            />
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Width"
                                value={row.display.widthFt ?? ""}
                                onChange={(event) => onDisplayChange(row.projectIndex, row.displayIndex, row.estimatorIndex, "widthFt", event.target.value, row.optionIndex)}
                                className="h-8 w-full rounded border border-border bg-background px-2 text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary"
                            />
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Height"
                                value={row.display.heightFt ?? ""}
                                onChange={(event) => onDisplayChange(row.projectIndex, row.displayIndex, row.estimatorIndex, "heightFt", event.target.value, row.optionIndex)}
                                className="h-8 w-full rounded border border-border bg-background px-2 text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
