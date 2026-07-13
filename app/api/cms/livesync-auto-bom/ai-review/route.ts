/**
 * POST /api/cms/livesync-auto-bom/ai-review
 *
 * Real-model expert review of an auto-generated Control System BOM.
 * Re-runs the deterministic engine server-side for an authoritative BOM,
 * then streams a GLM review over it — including the model's visible
 * reasoning (`reasoning_content`) — as SSE lines the client renders live.
 *
 * The model reviews; it never changes quantities or invents prices. The
 * deterministic engine stays the source of truth for the numbers.
 *
 * Provider is config-only: LIVESYNC_AI_* overrides, else the Z.AI key that
 * is already in the app env (glm-5.2), else Ollama Cloud.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/apiAuth";
import type { UserRole } from "@/lib/rbac";
import { log } from "@/lib/logger";
import {
  buildLivesyncAutoBom,
  type LivesyncJobInput,
  type LivesyncScreenInput,
} from "@/lib/cms/livesyncAutoBom";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "PRODUCT_EXPERT"];

type Provider = { name: string; baseUrl: string; apiKey: string; model: string };

function pickProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.LIVESYNC_AI_API_KEY && process.env.LIVESYNC_AI_BASE_URL) {
    providers.push({
      name: "custom",
      baseUrl: process.env.LIVESYNC_AI_BASE_URL,
      apiKey: process.env.LIVESYNC_AI_API_KEY,
      model: process.env.LIVESYNC_AI_MODEL || "glm-5.2",
    });
  }
  if (process.env.Z_AI_API_KEY) {
    providers.push({
      name: "z-ai",
      baseUrl: process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4",
      apiKey: process.env.Z_AI_API_KEY,
      model: process.env.LIVESYNC_AI_MODEL || "glm-5.2",
    });
  }
  if (process.env.OLLAMA_API_KEY) {
    providers.push({
      name: "ollama-cloud",
      baseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
      apiKey: process.env.OLLAMA_API_KEY,
      model: process.env.OLLAMA_MODEL || "kimi-k2.5",
    });
  }
  return providers;
}

export async function POST(request: NextRequest) {
  const [session, authError] = await requireAuth();
  if (authError) return authError;
  const role = (session as unknown as { user?: { role?: UserRole } } | null)?.user?.role;
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.screens) || body.screens.length === 0) {
    return new Response(JSON.stringify({ error: "Provide at least one screen." }), { status: 400 });
  }

  const providers = pickProviders();
  if (providers.length === 0) {
    return new Response(JSON.stringify({ error: "No AI provider configured." }), { status: 503 });
  }

  const screens: LivesyncScreenInput[] = (body.screens as Record<string, unknown>[])
    .filter((raw) => Number(raw.pixelWidth) > 0 && Number(raw.pixelHeight) > 0)
    .map((raw, i) => ({
      name: String(raw.name || `Screen ${i + 1}`),
      pixelWidth: Number(raw.pixelWidth),
      pixelHeight: Number(raw.pixelHeight),
      liveVideo: !!raw.liveVideo,
      outdoor: !!raw.outdoor,
      physicalWidthFt: Number(raw.physicalWidthFt) > 0 ? Number(raw.physicalWidthFt) : null,
    }));
  const job: LivesyncJobInput = {
    screens,
    sportsVenue: body.sportsVenue !== false,
    includeLicense: !!body.includeLicense,
  };

  const catalogItems = await prisma.cmsCatalogItem.findMany({ orderBy: { sortOrder: "asc" } });
  const result = buildLivesyncAutoBom(
    job,
    catalogItems.map((item) => ({
      sku: item.sku,
      displayName: item.displayName,
      category: item.category as string,
      unitCost: Number(item.unitCost),
      unitPrice: item.unitPrice == null ? null : Number(item.unitPrice),
      isActive: item.isActive,
    }))
  );

  const bomTable = result.lines
    .map((l) => `${l.category} | ${l.displayName} (${l.sku}) | qty ${l.quantity} | $${l.unitPrice} | line $${l.lineTotal} | ${l.rationale}${l.flags.length ? " | FLAGS: " + l.flags.join("; ") : ""}`)
    .join("\n");
  const screenDesc = job.screens
    .map((s) => `${s.name}: ${s.pixelWidth}x${s.pixelHeight}px${s.liveVideo ? ", live video" : ""}${s.outdoor ? ", outdoor" : ""}${s.physicalWidthFt ? `, ${s.physicalWidthFt}ft wide` : ""}`)
    .join("\n");

  const systemPrompt =
    "You are a senior control-system estimation engineer at a major LED display integrator, reviewing a machine-generated Control System (media server) bill of materials for a sports venue job. " +
    "House rules the generator followed: each server output drives up to 3840x2160; never exceed 2 outputs per server; every primary server gets a dedicated 1:1 backup; minimum 2 UI servers (8TB); audio element per server; RS-232 scoring intake on sports venues; matrix is always the next size up, never exact; ~1 rack per 12 servers; ~1 week install labor per rack; outdoor screens get climate racks per 150ft of width; licensing usually excluded on RFP jobs. " +
    "Your job: verify the package hangs together, call out anything that looks off or risky, list the specific questions you would ask before quoting, and suggest concrete improvements. " +
    "Do NOT change quantities or invent prices — the deterministic engine owns the numbers. Be direct and concise. Plain text with short section headings, no markdown tables.";

  const userPrompt = `JOB\n${screenDesc}\nSports venue: ${job.sportsVenue ? "yes" : "no"} · License: ${job.includeLicense ? "included" : "excluded"}\n\nGENERATED BOM (total $${result.totals.grand.toLocaleString()})\n${bomTable}\n\nOPEN REVIEW FLAGS\n${result.reviewFlags.join("\n")}\n\nReview this package.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, text })}\n\n`));
      try {
        let upstream: Response | null = null;
        let provider: Provider | null = null;
        for (const candidate of providers) {
          const response = await fetch(`${candidate.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${candidate.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: candidate.model,
              stream: true,
              temperature: 0.3,
              max_tokens: 3000,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
          });
          if (response.ok && response.body) {
            upstream = response;
            provider = candidate;
            break;
          }
          const errText = await response.text().catch(() => "");
          log.error("[livesync ai-review] upstream error", {
            provider: candidate.name,
            status: response.status,
            errText: errText.slice(0, 300),
          });
        }
        if (!upstream || !upstream.body) {
          send("error", "AI review providers are temporarily unavailable.");
          controller.close();
          return;
        }
        send("meta", provider?.model || "AI review");
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n");
          buffer = events.pop() ?? "";
          for (const line of events) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta ?? {};
              if (delta.reasoning_content) send("thinking", delta.reasoning_content);
              if (delta.content) send("answer", delta.content);
            } catch {
              // partial JSON across chunks — will complete on the next read
            }
          }
        }
        send("done", "");
      } catch (error) {
        log.error("[livesync ai-review] stream failed", { error: String(error) });
        send("error", "AI review failed.");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
