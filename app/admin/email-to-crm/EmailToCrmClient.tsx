"use client";

import { useCallback, useEffect, useState } from "react";

interface IntakeAttachment {
  name: string;
  sizeBytes?: number;
}

interface ExtractedDate {
  label: string;
  dateIso: string;
  kind: string;
  sourceText: string;
  verified?: boolean;
}

interface IntakeExtraction {
  clientOrVenue: string;
  projectName: string;
  summary: string;
  dueDates: ExtractedDate[];
  keyFacts: Array<{ fact: string; sourceText: string }>;
  people: Array<{ name: string; role?: string; email?: string }>;
  confidence: number;
}

interface IntakeCandidate {
  id: string;
  name: string;
  stage?: string;
  proposalDueDate?: string | null;
  score: number;
  reasons: string[];
}

interface IntakeRow {
  id: string;
  source: string;
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  rawBody: string;
  attachments?: IntakeAttachment[] | null;
  extraction?: IntakeExtraction | null;
  candidates?: IntakeCandidate[] | null;
  matchedOpportunityId?: string | null;
  matchedOpportunityName?: string | null;
  matchReason?: string | null;
  status: string;
  appliedChanges?: {
    updatedProposalDueDate?: boolean;
    changes?: { proposalDueDate?: { newValue: string; previousValue: string | null } | null };
  } | null;
  appliedAt?: string | null;
  appliedBy?: string | null;
  error?: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  applied: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  dismissed: "bg-muted text-muted-foreground",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Needs review",
  applied: "Applied",
  dismissed: "Dismissed",
  failed: "Failed",
};

function fmtDay(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EmailToCrmClient() {
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual submit form
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [fromField, setFromField] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [body, setBody] = useState("");
  const [attachmentNames, setAttachmentNames] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/intake/email-to-crm");
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setIntakes(data.intakes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitEmail = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const emailMatch = fromField.match(/<?([^\s<>]+@[^\s<>]+)>?/);
      const res = await fetch("/api/intake/email-to-crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || undefined,
          fromEmail: emailMatch?.[1],
          fromName: fromField.replace(/<[^>]*>/, "").trim() || undefined,
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
          body,
          attachments: attachmentNames
            .split("\n")
            .map((n) => n.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Submit failed (${res.status})`);
      setShowForm(false);
      setSubject("");
      setFromField("");
      setReceivedAt("");
      setBody("");
      setAttachmentNames("");
      await refresh();
      if (data.intake?.id) setOpenId(data.intake.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, payload: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/intake/email-to-crm/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Action failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"
        >
          {showForm ? "Close" : "Process an email"}
        </button>
        <button
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          className="px-3 py-1.5 rounded border border-border text-sm"
        >
          Refresh
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>

      {showForm && (
        <section className="border border-border rounded-lg bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="px-2 py-1.5 rounded border border-border bg-background text-sm"
            />
            <input
              value={fromField}
              onChange={(e) => setFromField(e.target.value)}
              placeholder="From (Name <email>)"
              className="px-2 py-1.5 rounded border border-border bg-background text-sm"
            />
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="px-2 py-1.5 rounded border border-border bg-background text-sm"
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Paste the full email body here…"
            rows={8}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm font-mono"
          />
          <textarea
            value={attachmentNames}
            onChange={(e) => setAttachmentNames(e.target.value)}
            placeholder="Attachment file names, one per line (optional)"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
          />
          <button
            onClick={submitEmail}
            disabled={submitting || body.trim().length < 20}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-60"
          >
            {submitting ? "Reading email…" : "Extract & match"}
          </button>
        </section>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : intakes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No emails processed yet. Paste one above to run the first intake.
        </p>
      ) : (
        <div className="space-y-3">
          {intakes.map((row) => {
            const open = openId === row.id;
            const extraction = row.extraction;
            const candidates = row.candidates || [];
            return (
              <section key={row.id} className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : row.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_STYLES[row.status] || "bg-muted"}`}
                  >
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                  <span className="text-sm text-foreground truncate">
                    {row.subject || "(no subject)"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {row.fromName || row.fromEmail || row.source} · {fmtDay(row.receivedAt || row.createdAt)}
                  </span>
                </button>

                {open && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {row.error && <p className="text-sm text-red-500">{row.error}</p>}

                    {extraction && (
                      <div className="space-y-2">
                        <p className="text-sm text-foreground">{extraction.summary}</p>
                        <div className="text-xs text-muted-foreground">
                          Venue/client: <span className="text-foreground">{extraction.clientOrVenue}</span>
                          {" · "}Project: <span className="text-foreground">{extraction.projectName}</span>
                          {" · "}Extraction confidence: {(extraction.confidence * 100).toFixed(0)}%
                        </div>

                        {extraction.dueDates.length > 0 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 pr-3 font-medium">Deadline</th>
                                <th className="py-1 pr-3 font-medium">Date</th>
                                <th className="py-1 pr-3 font-medium">Quoted from email</th>
                                <th className="py-1 font-medium">Verified</th>
                              </tr>
                            </thead>
                            <tbody>
                              {extraction.dueDates.map((d, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="py-1.5 pr-3">{d.label}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDay(`${d.dateIso}T12:00:00Z`)}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground italic">“{d.sourceText}”</td>
                                  <td className="py-1.5">
                                    {d.verified ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                    ) : (
                                      <span className="text-amber-600 dark:text-amber-400" title="Quote not found verbatim in the email — will not be written to the CRM">
                                        needs confirmation
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {extraction.keyFacts.length > 0 && (
                          <ul className="text-sm list-disc pl-5 text-muted-foreground">
                            {extraction.keyFacts.map((f, i) => (
                              <li key={i}>{f.fact}</li>
                            ))}
                          </ul>
                        )}

                        {(row.attachments?.length ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Attachments: {row.attachments!.map((a) => a.name).join(", ")}
                          </p>
                        )}
                      </div>
                    )}

                    {row.matchReason && (
                      <p className="text-xs text-muted-foreground">Match decision: {row.matchReason}</p>
                    )}

                    {row.status === "applied" && (
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        Applied to “{row.matchedOpportunityName}” by {row.appliedBy} on {fmtDay(row.appliedAt)}
                        {row.appliedChanges?.updatedProposalDueDate ? " — proposal due date updated." : " — timeline note added."}
                      </p>
                    )}

                    {row.status === "pending_review" && candidates.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Opportunity candidates
                        </p>
                        {candidates.map((c) => (
                          <div key={c.id} className="flex items-center gap-3 border border-border rounded p-2 bg-background">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                score {c.score} · {c.reasons.join(" · ")}
                                {c.proposalDueDate ? ` · current due ${fmtDay(c.proposalDueDate)}` : ""}
                              </p>
                            </div>
                            <button
                              onClick={() => act(row.id, { action: "apply", opportunityId: c.id })}
                              disabled={busyId === row.id}
                              className="ml-auto px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs shrink-0 disabled:opacity-60"
                            >
                              Apply to this
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => act(row.id, { action: "dismiss" })}
                          disabled={busyId === row.id}
                          className="px-3 py-1.5 rounded border border-border text-xs text-muted-foreground disabled:opacity-60"
                        >
                          Dismiss — not CRM-relevant
                        </button>
                      </div>
                    )}

                    {row.status === "pending_review" && candidates.length === 0 && extraction && (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        No matching opportunity found — check the venue name or create the opportunity first.
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
