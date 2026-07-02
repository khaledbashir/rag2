import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildRecallRecordingConfig,
  extractRecallMedia,
  getRecallRegion,
  latestRecallStatus,
  verifyRecallWebhookSignature,
} from "./client";

describe("Recall.ai client helpers", () => {
  it("supports the Japan Recall region used by the dashboard", () => {
    const previous = process.env.RECALL_REGION;
    process.env.RECALL_REGION = "ap-northeast-1";

    expect(getRecallRegion()).toBe("ap-northeast-1");

    if (previous === undefined) {
      delete process.env.RECALL_REGION;
    } else {
      process.env.RECALL_REGION = previous;
    }
  });

  it("uses meeting captions as the default transcript provider", () => {
    const config = buildRecallRecordingConfig({});

    expect(config).toMatchObject({
      transcript: {
        provider: {
          meeting_captions: {},
        },
      },
      video_mixed_mp4: {},
      participant_events: {},
      meeting_metadata: {},
    });
  });

  it("can opt into Recall streaming transcription when needed", () => {
    const config = buildRecallRecordingConfig({
      transcriptionProvider: "recallai_streaming",
    });

    expect(config).toMatchObject({
      transcript: {
        provider: {
          recallai_streaming: {},
        },
      },
    });
  });

  it("extracts all CRM-relevant recording artifacts from media shortcuts", () => {
    const media = extractRecallMedia({
      id: "bot_1",
      recording: "recording_main",
      recordings: [
        {
          id: "recording_1",
          media_shortcuts: {
            video_mixed: { data: { download_url: "https://example.com/video.mp4" } },
            audio_mixed: { data: { download_url: "https://example.com/audio.mp3" } },
            transcript: { data: { download_url: "https://example.com/transcript.json" } },
            participant_events: { data: { download_url: "https://example.com/events.json" } },
            meeting_metadata: { data: { download_url: "https://example.com/metadata.json" } },
          },
        },
      ],
    });

    expect(media).toEqual({
      recordingId: "recording_1",
      videoUrl: "https://example.com/video.mp4",
      audioUrl: "https://example.com/audio.mp3",
      transcriptUrl: "https://example.com/transcript.json",
      participantEventsUrl: "https://example.com/events.json",
      meetingMetadataUrl: "https://example.com/metadata.json",
    });
  });

  it("returns latest bot status from status_changes", () => {
    expect(
      latestRecallStatus({
        id: "bot_1",
        status_changes: [
          { code: "joining_call", created_at: "2026-07-02T18:00:00Z" },
          { code: "done", created_at: "2026-07-02T19:00:00Z" },
        ],
      }),
    ).toEqual({
      code: "done",
      subCode: null,
      message: null,
      createdAt: "2026-07-02T19:00:00Z",
    });
  });

  it("verifies Recall webhook signatures", () => {
    const rawKey = crypto.randomBytes(32);
    const secret = `whsec_${rawKey.toString("base64")}`;
    const payload = JSON.stringify({ data: { bot: { id: "bot_1" } } });
    const id = "msg_test";
    const timestamp = "1783022400";
    const signature = crypto
      .createHmac("sha256", rawKey)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");

    expect(() =>
      verifyRecallWebhookSignature({
        secret,
        payload,
        headers: {
          "webhook-id": id,
          "webhook-timestamp": timestamp,
          "webhook-signature": `v1,${signature}`,
        },
      }),
    ).not.toThrow();
  });

  it("rejects invalid Recall webhook signatures", () => {
    const secret = `whsec_${crypto.randomBytes(32).toString("base64")}`;

    expect(() =>
      verifyRecallWebhookSignature({
        secret,
        payload: "{}",
        headers: {
          "webhook-id": "msg_test",
          "webhook-timestamp": "1783022400",
          "webhook-signature": "v1,invalid",
        },
      }),
    ).toThrow(/signature/i);
  });
});
