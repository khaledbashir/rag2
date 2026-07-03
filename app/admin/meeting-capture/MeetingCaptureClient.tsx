"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Laptop,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RecallRuntime = {
  region: string;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  mcpUrl: string;
};

type RecallBotRow = {
  bot: {
    id: string;
    meeting_url?: string;
    bot_name?: string;
    join_at?: string | null;
    metadata?: Record<string, unknown>;
  };
  status: {
    code: string;
    subCode: string | null;
    message: string | null;
    createdAt: string | null;
  };
  media: {
    recordingId: string | null;
    transcriptUrl: string | null;
    videoUrl: string | null;
    audioUrl: string | null;
    participantEventsUrl: string | null;
    meetingMetadataUrl: string | null;
  };
};

type BotsResponse = {
  ok: boolean;
  runtime: RecallRuntime;
  count?: number;
  bots?: RecallBotRow[];
  error?: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  text: string;
};

const architectureRows = [
  {
    icon: Database,
    title: "System of record",
    body: "Meeting artifacts land on the CRM opportunity or proposal timeline.",
  },
  {
    icon: Workflow,
    title: "Application surface",
    body: "Operator controls live inside this app because it already owns proposal context, auth, and CRM handoff.",
  },
  {
    icon: Radio,
    title: "Capture layer",
    body: "Recall remains the meeting/desktop recording provider, with MCP for debug visibility.",
  },
];

const capabilityRows = [
  "Schedule a recorder for Zoom, Google Meet, or Microsoft Teams meeting links.",
  "Use meeting captions by default for transcript capture.",
  "Write scheduled, completed, failed, and review-required notes back to CRM.",
  "Sync completed recordings manually when webhook delivery needs backfill.",
  "Accept Desktop Recording SDK artifacts from local capture flows.",
  "Inspect recent bots and media links from the operator page.",
];

const blockerRows = [
  {
    title: "Webhook signing secret",
    detail: "Needed from the Recall dashboard to verify incoming webhook signatures.",
  },
  {
    title: "Durable service env",
    detail: "The live key/region are active now; they still need to be persisted in service settings before the next dashboard deploy.",
  },
  {
    title: "CRM launch point",
    detail: "A button inside the CRM opportunity page needs CRM-side app placement or metadata access.",
  },
  {
    title: "Desktop SDK binary",
    detail: "A packaged desktop app is required before desktop recording can be a one-click user workflow.",
  },
  {
    title: "Calendar automation",
    detail: "User calendar connections are required before bots can auto-join meetings without manual scheduling.",
  },
];

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusClass(code: string) {
  if (code === "done") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (code === "fatal" || code === "call_ended_not_recorded") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (code.includes("joining") || code.includes("recording")) return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-border bg-muted text-muted-foreground";
}

export default function MeetingCaptureClient({ userEmail }: { userEmail: string }) {
  const [bots, setBots] = useState<RecallBotRow[]>([]);
  const [runtime, setRuntime] = useState<RecallRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [desktopSaving, setDesktopSaving] = useState(false);

  const [form, setForm] = useState({
    meetingUrl: "",
    meetingTitle: "",
    opportunityId: "",
    proposalId: "",
    companyName: "",
    dealName: "",
    joinAt: "",
    botName: "ANC Meeting Recorder",
    recordVideo: true,
    transcribe: true,
    transcriptionProvider: "meeting_captions",
  });

  const [desktopForm, setDesktopForm] = useState({
    opportunityId: "",
    proposalId: "",
    source: "read-ai",
    sourceUrl: "",
    meetingTitle: "",
    recordingId: "",
    transcriptUrl: "",
    videoUrl: "",
    audioUrl: "",
    notes: "",
    notifySlack: true,
  });

  const completedCount = useMemo(() => bots.filter((row) => row.status.code === "done").length, [bots]);
  const needsReviewCount = useMemo(
    () => bots.filter((row) => row.status.code === "fatal" || row.status.code === "call_ended_not_recorded").length,
    [bots],
  );

  const fetchBots = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await fetch("/api/integrations/recall-ai/bots?page=1&pageSize=25");
      const data = (await res.json()) as BotsResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || "Meeting capture status failed");
      setBots(data.bots || []);
      setRuntime(data.runtime);
      setNotice(null);
    } catch (error: any) {
      setNotice({ tone: "error", text: error?.message || "Meeting capture status failed" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const scheduleBot = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      const payload = {
        meetingUrl: form.meetingUrl.trim(),
        meetingTitle: form.meetingTitle.trim() || undefined,
        opportunityId: form.opportunityId.trim() || undefined,
        proposalId: form.proposalId.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
        dealName: form.dealName.trim() || form.meetingTitle.trim() || undefined,
        joinAt: normalizeDateTimeLocal(form.joinAt),
        botName: form.botName.trim() || "ANC Meeting Recorder",
        recordVideo: form.recordVideo,
        transcribe: form.transcribe,
        transcriptionProvider: form.transcriptionProvider,
        scheduledBy: userEmail,
      };
      const res = await fetch("/api/integrations/recall-ai/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Recorder scheduling failed");
      setNotice({ tone: "success", text: `Recorder scheduled: ${data.bot?.id || "created"}` });
      setForm((prev) => ({ ...prev, meetingUrl: "", meetingTitle: "", opportunityId: "", proposalId: "", companyName: "", dealName: "", joinAt: "" }));
      await fetchBots(true);
    } catch (error: any) {
      setNotice({ tone: "error", text: error?.message || "Recorder scheduling failed" });
    } finally {
      setCreating(false);
    }
  };

  const syncBot = async (botId: string) => {
    setSyncingId(botId);
    setNotice(null);
    try {
      const res = await fetch(`/api/integrations/recall-ai/bots/${encodeURIComponent(botId)}?sync=true`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "CRM sync failed");
      setNotice({ tone: "success", text: `Synced recorder ${botId} to CRM.` });
      await fetchBots(true);
    } catch (error: any) {
      setNotice({ tone: "error", text: error?.message || "CRM sync failed" });
    } finally {
      setSyncingId(null);
    }
  };

  const saveDesktopRecording = async (event: React.FormEvent) => {
    event.preventDefault();
    setDesktopSaving(true);
    setNotice(null);
    try {
      const payload = {
        opportunityId: desktopForm.opportunityId.trim() || undefined,
        proposalId: desktopForm.proposalId.trim() || undefined,
        source: desktopForm.source,
        sourceUrl: desktopForm.sourceUrl.trim() || undefined,
        meetingTitle: desktopForm.meetingTitle.trim() || undefined,
        recordingId: desktopForm.recordingId.trim() || undefined,
        transcriptUrl: desktopForm.transcriptUrl.trim() || undefined,
        videoUrl: desktopForm.videoUrl.trim() || undefined,
        audioUrl: desktopForm.audioUrl.trim() || undefined,
        notes: desktopForm.notes.trim() || undefined,
        notifySlack: desktopForm.notifySlack,
        scheduledBy: userEmail,
      };
      const res = await fetch("/api/integrations/recall-ai/desktop-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Desktop recording save failed");
      const slackText = data.crmSync?.slackSync?.ok ? " Slack notified." : data.crmSync?.slackSync?.skipped ? " Slack skipped." : "";
      setNotice({ tone: "success", text: `Meeting capture attached to CRM.${slackText}` });
      setDesktopForm({
        opportunityId: "",
        proposalId: "",
        source: "read-ai",
        sourceUrl: "",
        meetingTitle: "",
        recordingId: "",
        transcriptUrl: "",
        videoUrl: "",
        audioUrl: "",
        notes: "",
        notifySlack: true,
      });
    } catch (error: any) {
      setNotice({ tone: "error", text: error?.message || "Desktop recording save failed" });
    } finally {
      setDesktopSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            {[
              ["Control Room", "#control-room"],
              ["Schedule", "#schedule"],
              ["Recent Bots", "#recent-bots"],
              ["Desktop SDK", "#desktop-sdk"],
              ["Plan", "#plan"],
              ["Blockers", "#blockers"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="flex items-center rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-8">
          <section id="control-room" className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-normal text-foreground serif-vault">Meeting Capture</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Recorder scheduling, CRM sync, desktop captures, and operator readiness.
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchBots(true)} disabled={refreshing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {notice && (
              <div
                className={cn(
                  "rounded-md border px-4 py-3 text-sm",
                  notice.tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  notice.tone === "error" && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                  notice.tone === "info" && "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
                )}
              >
                {notice.text}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard icon={Bot} label="Recent bots" value={loading ? "..." : String(bots.length)} />
              <MetricCard icon={CheckCircle2} label="Completed" value={loading ? "..." : String(completedCount)} />
              <MetricCard icon={AlertTriangle} label="Needs review" value={loading ? "..." : String(needsReviewCount)} />
              <MetricCard icon={ShieldCheck} label="Webhook signing" value={runtime?.webhookSecretConfigured ? "Set" : "Needed"} muted={!runtime?.webhookSecretConfigured} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {architectureRows.map((row) => (
                <Card key={row.title}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <row.icon className="h-4 w-4 text-primary" />
                      {row.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{row.body}</CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id="schedule" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Send className="h-5 w-5" />
                  Schedule Recorder
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={scheduleBot} className="space-y-4">
                  <Field label="Meeting URL">
                    <Input value={form.meetingUrl} onChange={(e) => setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))} placeholder="https://meet.google.com/..." required />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Meeting title">
                      <Input value={form.meetingTitle} onChange={(e) => setForm((prev) => ({ ...prev, meetingTitle: e.target.value }))} placeholder="MetLife Live Sync review" />
                    </Field>
                    <Field label="Join time">
                      <Input type="datetime-local" value={form.joinAt} onChange={(e) => setForm((prev) => ({ ...prev, joinAt: e.target.value }))} />
                    </Field>
                    <Field label="Opportunity ID">
                      <Input value={form.opportunityId} onChange={(e) => setForm((prev) => ({ ...prev, opportunityId: e.target.value }))} placeholder="CRM opportunity UUID" />
                    </Field>
                    <Field label="Proposal ID">
                      <Input value={form.proposalId} onChange={(e) => setForm((prev) => ({ ...prev, proposalId: e.target.value }))} placeholder="Proposal workspace ID" />
                    </Field>
                    <Field label="Company">
                      <Input value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Account name" />
                    </Field>
                    <Field label="Deal">
                      <Input value={form.dealName} onChange={(e) => setForm((prev) => ({ ...prev, dealName: e.target.value }))} placeholder="Opportunity name" />
                    </Field>
                    <Field label="Bot name">
                      <Input value={form.botName} onChange={(e) => setForm((prev) => ({ ...prev, botName: e.target.value }))} />
                    </Field>
                    <Field label="Transcript provider">
                      <Select value={form.transcriptionProvider} onValueChange={(value) => setForm((prev) => ({ ...prev, transcriptionProvider: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting_captions">Meeting captions</SelectItem>
                          <SelectItem value="recallai_streaming">Streaming transcription</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-5 rounded-md border border-border p-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.recordVideo} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, recordVideo: checked === true }))} />
                      Record video
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.transcribe} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, transcribe: checked === true }))} />
                      Capture transcript
                    </label>
                  </div>

                  <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Schedule
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ReadinessRow label="Region" value={runtime?.region || "Checking"} ok={Boolean(runtime?.region)} />
                <ReadinessRow label="API key" value={runtime?.apiKeyConfigured ? "Set" : "Missing"} ok={Boolean(runtime?.apiKeyConfigured)} />
                <ReadinessRow label="Webhook secret" value={runtime?.webhookSecretConfigured ? "Set" : "Needed"} ok={Boolean(runtime?.webhookSecretConfigured)} />
                <ReadinessRow label="MCP" value={runtime?.mcpUrl || "Checking"} ok={Boolean(runtime?.mcpUrl)} />
              </CardContent>
            </Card>
          </section>

          <section id="recent-bots">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5" />
                  Recent Bots
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-20 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : bots.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No recent recorders returned for this workspace.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bots.map((row) => (
                      <div key={row.bot.id} className="rounded-md border border-border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{String(row.bot.metadata?.dealName || row.bot.bot_name || "Meeting recorder")}</p>
                              <Badge className={cn("border", statusClass(row.status.code))}>{row.status.code}</Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{row.bot.id}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{formatDate(row.bot.join_at || row.status.createdAt)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {row.media.transcriptUrl && <ArtifactLink href={row.media.transcriptUrl} label="Transcript" />}
                            {row.media.videoUrl && <ArtifactLink href={row.media.videoUrl} label="Video" />}
                            <Button variant="outline" size="sm" onClick={() => syncBot(row.bot.id)} disabled={syncingId === row.bot.id}>
                              {syncingId === row.bot.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                              Sync CRM
                            </Button>
                          </div>
                        </div>
                        {row.status.message && <p className="mt-3 text-sm text-muted-foreground">{row.status.message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section id="desktop-sdk">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Laptop className="h-5 w-5" />
                  Otter / Read / Desktop Intake
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveDesktopRecording} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Opportunity ID">
                      <Input value={desktopForm.opportunityId} onChange={(e) => setDesktopForm((prev) => ({ ...prev, opportunityId: e.target.value }))} />
                    </Field>
                    <Field label="Proposal ID">
                      <Input value={desktopForm.proposalId} onChange={(e) => setDesktopForm((prev) => ({ ...prev, proposalId: e.target.value }))} />
                    </Field>
                    <Field label="Meeting title">
                      <Input value={desktopForm.meetingTitle} onChange={(e) => setDesktopForm((prev) => ({ ...prev, meetingTitle: e.target.value }))} />
                    </Field>
                    <Field label="Source">
                      <Select value={desktopForm.source} onValueChange={(value) => setDesktopForm((prev) => ({ ...prev, source: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read-ai">Read.ai</SelectItem>
                          <SelectItem value="otter-ai">Otter.ai</SelectItem>
                          <SelectItem value="recall-ai">Recall.ai</SelectItem>
                          <SelectItem value="desktop-sdk">Desktop SDK</SelectItem>
                          <SelectItem value="manual-upload">Manual notes</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Source URL">
                      <Input value={desktopForm.sourceUrl} onChange={(e) => setDesktopForm((prev) => ({ ...prev, sourceUrl: e.target.value }))} placeholder="Read.ai or Otter share link" />
                    </Field>
                    <Field label="Recording ID">
                      <Input value={desktopForm.recordingId} onChange={(e) => setDesktopForm((prev) => ({ ...prev, recordingId: e.target.value }))} />
                    </Field>
                    <Field label="Transcript URL">
                      <Input value={desktopForm.transcriptUrl} onChange={(e) => setDesktopForm((prev) => ({ ...prev, transcriptUrl: e.target.value }))} />
                    </Field>
                    <Field label="Video URL">
                      <Input value={desktopForm.videoUrl} onChange={(e) => setDesktopForm((prev) => ({ ...prev, videoUrl: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Notes or transcript">
                    <Textarea value={desktopForm.notes} onChange={(e) => setDesktopForm((prev) => ({ ...prev, notes: e.target.value }))} rows={5} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={desktopForm.notifySlack} onCheckedChange={(checked) => setDesktopForm((prev) => ({ ...prev, notifySlack: checked === true }))} />
                    Notify Slack
                  </label>
                  <Button type="submit" disabled={desktopSaving}>
                    {desktopSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                    Attach meeting capture
                  </Button>
                </form>
              </CardContent>
            </Card>
          </section>

          <section id="plan" className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Build Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    ["Now", "Operator page, manual scheduling, recent bot debug, manual CRM sync."],
                    ["Next", "Webhook signing secret, Recall dashboard webhook test, CRM opportunity launch button."],
                    ["After", "Calendar-connected auto-recording and packaged desktop capture app."],
                  ].map(([phase, body]) => (
                    <div key={phase} className="rounded-md border border-border p-3">
                      <p className="text-sm font-medium">{phase}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Capabilities Live</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {capabilityRows.map((item) => (
                    <div key={item} className="flex gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="blockers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-5 w-5" />
                  Blockers
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {blockerRows.map((item) => (
                  <div key={item.title} className="rounded-md border border-border p-4">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, muted = false }: { icon: LucideIcon; label: string; value: string; muted?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-md border border-border p-2", muted ? "text-amber-500" : "text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ReadinessRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate text-right font-medium", ok ? "text-foreground" : "text-amber-600 dark:text-amber-400")}>{value}</span>
    </div>
  );
}

function ArtifactLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} target="_blank" rel="noreferrer">
        <ExternalLink className="mr-2 h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}
