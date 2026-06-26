"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clipboard,
    ExternalLink,
    Loader2,
    MailPlus,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import type { EmailQuoteIntake, IntakeProject } from "@/services/intake/emailToQuoteIntake";

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

type ParseState = "idle" | "parsing" | "parsed" | "creating";

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

export default function EmailToQuoteClient() {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [intake, setIntake] = useState<EmailQuoteIntake | null>(null);
    const [draft, setDraft] = useState<DraftProject | null>(null);
    const [state, setState] = useState<ParseState>("idle");
    const [error, setError] = useState<string | null>(null);

    const missingAssumptions = useMemo(() => uniqueMissing(intake), [intake]);
    const parsedDisplays = intake?.estimatorAnswers.displays.length || 0;

    const callIntake = async (createDraft: boolean) => {
        if (!body.trim()) {
            setError("Paste the email body first.");
            return;
        }

        setState(createDraft ? "creating" : "parsing");
        setError(null);
        setDraft(null);

        try {
            const res = await fetch("/api/intake/email-to-quote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body, createDraft }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Email intake failed");

            setIntake(data.intake);
            if (data.project) setDraft(data.project);
            setState("parsed");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Email intake failed");
            setState(intake ? "parsed" : "idle");
        }
    };

    const reset = () => {
        setSubject("");
        setBody("");
        setIntake(null);
        setDraft(null);
        setError(null);
        setState("idle");
    };

    const loadSample = () => {
        setSubject(SAMPLE_SUBJECT);
        setBody(SAMPLE_BODY);
        setDraft(null);
        setError(null);
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
                            onClick={() => callIntake(false)}
                            disabled={isWorking || !body.trim()}
                            className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {state === "parsing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Review email
                        </button>
                        <button
                            onClick={() => callIntake(true)}
                            disabled={isWorking || !body.trim()}
                            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {state === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            Create draft
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
                            <div className="truncate text-xl font-semibold">{intake?.venueName || "Ready"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Venue</div>
                        </div>
                    </div>

                    {draft && (
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

                    <div className="p-1">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold">{intake?.title || "Review output"}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">{intake?.summary || "Parsed projects and quote assumptions will appear here."}</p>
                            </div>
                            {intake?.requesterName && (
                                <div className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{intake.requesterName}</div>
                            )}
                        </div>

                        <div className="mt-4 space-y-3">
                            {intake?.projects.map((project) => (
                                <ProjectReview key={`${project.projectNumber}-${project.name}`} project={project} />
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

function ProjectReview({ project }: { project: IntakeProject }) {
    const displays = [
        ...project.displays,
        ...project.quoteOptions.flatMap((option) => option.displays.map((display) => ({ ...display, optionLabel: option.label }))),
    ];

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
                    <div className="grid grid-cols-[1fr_72px_112px] border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                        <span>Display</span>
                        <span>Qty</span>
                        <span>Size</span>
                    </div>
                    {displays.map((display, index) => (
                        <div key={`${display.name}-${index}`} className="grid grid-cols-[1fr_72px_112px] px-3 py-2 text-xs">
                            <span className="min-w-0 truncate text-foreground">
                                {"optionLabel" in display && display.optionLabel ? `${display.optionLabel}: ` : ""}
                                {display.name}
                            </span>
                            <span className="tabular-nums text-muted-foreground">{display.quantity}</span>
                            <span className="tabular-nums text-muted-foreground">{formatDimension(display.widthFt, display.heightFt)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
