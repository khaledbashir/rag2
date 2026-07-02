import crypto from "crypto";

export type RecallRegion =
  | "us-west-2"
  | "us-east-1"
  | "eu-central-1"
  | "ap-northeast-1";

export type RecallBotMetadata = {
  source: "anc-crm";
  opportunityId?: string;
  proposalId?: string;
  companyName?: string;
  dealName?: string;
  scheduledBy?: string;
};

export type CreateRecallBotInput = {
  meetingUrl: string;
  botName?: string;
  joinAt?: string | null;
  metadata: RecallBotMetadata;
  recordVideo?: boolean;
  transcribe?: boolean;
  transcriptionProvider?: "meeting_captions" | "recallai_streaming";
  realtimeEndpointUrl?: string | null;
};

export type RecallMediaShortcut = {
  data?: {
    download_url?: string;
  };
  format?: string;
};

export type RecallRecording = {
  id?: string;
  media_shortcuts?: {
    video_mixed?: RecallMediaShortcut;
    audio_mixed?: RecallMediaShortcut;
    transcript?: RecallMediaShortcut;
    participant_events?: RecallMediaShortcut;
    meeting_metadata?: RecallMediaShortcut;
  };
};

export type RecallBot = {
  id: string;
  meeting_url?: string;
  bot_name?: string;
  join_at?: string | null;
  status_changes?: Array<{
    code?: string;
    sub_code?: string;
    message?: string;
    created_at?: string;
  }>;
  metadata?: RecallBotMetadata & Record<string, unknown>;
  recordings?: RecallRecording[];
  recording?: string | null;
};

export type RecallWebhookPayload = {
  event?: string;
  type?: string;
  data?: {
    bot?: Partial<RecallBot>;
  } & Record<string, unknown>;
  bot?: Partial<RecallBot>;
};

function getRecallApiKey() {
  return process.env.RECALLAI_API_KEY || process.env.RECALL_API_KEY;
}

export function getRecallRegion(): RecallRegion {
  const region = (process.env.RECALL_REGION || "us-west-2").trim();
  if (
    region === "us-west-2" ||
    region === "us-east-1" ||
    region === "eu-central-1" ||
    region === "ap-northeast-1"
  ) {
    return region;
  }
  throw new Error(`Unsupported Recall region: ${region}`);
}

function getRecallBaseUrl() {
  const explicit = process.env.RECALL_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return `https://${getRecallRegion()}.recall.ai`;
}

async function recallFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = getRecallApiKey();
  if (!apiKey) {
    throw new Error("Missing RECALLAI_API_KEY or RECALL_API_KEY");
  }

  const res = await fetch(`${getRecallBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = body?.detail || body?.error || body?.message || `Recall API ${res.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return body as T;
}

export function buildRecallRecordingConfig(input: {
  recordVideo?: boolean;
  transcribe?: boolean;
  transcriptionProvider?: "meeting_captions" | "recallai_streaming";
  realtimeEndpointUrl?: string | null;
}) {
  const config: Record<string, unknown> = {
    participant_events: {},
    meeting_metadata: {},
  };

  if (input.recordVideo !== false) {
    config.video_mixed_mp4 = {};
  }

  if (input.transcribe !== false) {
    const provider =
      input.transcriptionProvider === "recallai_streaming"
        ? { recallai_streaming: {} }
        : { meeting_captions: {} };

    config.transcript = {
      provider,
    };
  }

  if (input.realtimeEndpointUrl) {
    config.realtime_endpoints = [
      {
        type: "webhook",
        url: input.realtimeEndpointUrl,
        events: ["transcript.data", "participant_events.join", "participant_events.leave"],
      },
    ];
  }

  return config;
}

export async function createRecallBot(input: CreateRecallBotInput): Promise<RecallBot> {
  const payload: Record<string, unknown> = {
    meeting_url: input.meetingUrl,
    bot_name: input.botName || "ANC Meeting Recorder",
    metadata: input.metadata,
    recording_config: buildRecallRecordingConfig(input),
  };

  if (input.joinAt) {
    payload.join_at = input.joinAt;
  }

  return recallFetch<RecallBot>("/api/v1/bot/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function retrieveRecallBot(botId: string): Promise<RecallBot> {
  return recallFetch<RecallBot>(`/api/v1/bot/${encodeURIComponent(botId)}/`, {
    method: "GET",
  });
}

export function extractRecallBotFromWebhook(payload: RecallWebhookPayload): Partial<RecallBot> | null {
  return payload.data?.bot || payload.bot || null;
}

export function extractRecallMedia(bot: Partial<RecallBot>) {
  const recording = bot.recordings?.[0];
  const shortcuts = recording?.media_shortcuts || {};
  return {
    recordingId: recording?.id || bot.recording || null,
    videoUrl: shortcuts.video_mixed?.data?.download_url || null,
    audioUrl: shortcuts.audio_mixed?.data?.download_url || null,
    transcriptUrl: shortcuts.transcript?.data?.download_url || null,
    participantEventsUrl: shortcuts.participant_events?.data?.download_url || null,
    meetingMetadataUrl: shortcuts.meeting_metadata?.data?.download_url || null,
  };
}

export function latestRecallStatus(bot: Partial<RecallBot>) {
  const latest = bot.status_changes?.[bot.status_changes.length - 1];
  return {
    code: latest?.code || "unknown",
    subCode: latest?.sub_code || null,
    message: latest?.message || null,
    createdAt: latest?.created_at || null,
  };
}

export function verifyRecallWebhookSignature(args: {
  secret: string;
  headers: Headers | Record<string, string | undefined>;
  payload: string | null;
}) {
  const lowerHeaders =
    args.headers instanceof Headers
      ? Object.fromEntries(Array.from(args.headers.entries()).map(([key, value]) => [key.toLowerCase(), value]))
      : Object.fromEntries(Object.entries(args.headers).map(([key, value]) => [key.toLowerCase(), value || ""]));

  const msgId = lowerHeaders["webhook-id"] || lowerHeaders["svix-id"];
  const msgTimestamp = lowerHeaders["webhook-timestamp"] || lowerHeaders["svix-timestamp"];
  const msgSignature = lowerHeaders["webhook-signature"] || lowerHeaders["svix-signature"];

  if (!args.secret || !args.secret.startsWith("whsec_")) {
    throw new Error("Recall webhook verification secret is missing or invalid");
  }
  if (!msgId || !msgTimestamp || !msgSignature) {
    throw new Error("Recall webhook verification headers are missing");
  }

  const key = Buffer.from(args.secret.slice("whsec_".length), "base64");
  const payloadStr = args.payload || "";
  const toSign = `${msgId}.${msgTimestamp}.${payloadStr}`;
  const expectedSig = crypto.createHmac("sha256", key).update(toSign).digest("base64");

  for (const versionedSig of msgSignature.split(" ")) {
    const [version, signature] = versionedSig.split(",");
    if (version !== "v1" || !signature) continue;

    const actual = Buffer.from(signature, "base64");
    const expected = Buffer.from(expectedSig, "base64");
    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
      return;
    }
  }

  throw new Error("Recall webhook signature did not match");
}
