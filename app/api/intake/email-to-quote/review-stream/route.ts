import { NextRequest } from "next/server";

import { log } from "@/lib/logger";
import { parseEmailToQuoteIntake } from "@/services/intake/emailToQuoteIntake";
import {
    buildEmailReviewPrompt,
    extractEmailReviewJson,
    getEmailReviewProviders,
    normalizeEmailReview,
} from "@/services/intake/emailToQuoteAiReview";

export const dynamic = "force-dynamic";

interface EmailReviewStreamRequest {
    subject?: string;
    body?: string;
}

function sse(data: unknown) {
    return `data: ${JSON.stringify(data)}\n\n`;
}

function publicFallbackNotes(intake: ReturnType<typeof parseEmailToQuoteIntake>) {
    const missing = intake.missingAssumptions.slice(0, 5);
    return [
        "### Review progress",
        `- Parsed **${intake.projects.length}** project area${intake.projects.length === 1 ? "" : "s"}.`,
        `- Found **${intake.estimatorAnswers.displays.length}** display/options to verify.`,
        missing.length ? `- Checking missing assumptions: ${missing.join(", ")}.` : "- Checking for missing assumptions.",
    ].join("\n");
}

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();

    try {
        const body = (await request.json()) as EmailReviewStreamRequest;
        if (!body.body || typeof body.body !== "string") {
            return new Response(JSON.stringify({ error: "Email body is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const intake = parseEmailToQuoteIntake({
            subject: body.subject,
            body: body.body,
            source: "email",
        });

        const providers = getEmailReviewProviders();
        const prompt = buildEmailReviewPrompt({ subject: body.subject, body: body.body, intake });

        const readable = new ReadableStream({
            async start(controller) {
                const send = (data: unknown) => controller.enqueue(encoder.encode(sse(data)));

                send({ type: "status", label: "Email parsed", detail: `${intake.projects.length} project areas / ${intake.estimatorAnswers.displays.length} displays` });
                send({ type: "reasoning", markdown: publicFallbackNotes(intake) });

                if (providers.length === 0) {
                    send({
                        type: "review",
                        intake: {
                            ...intake,
                            aiReview: {
                                status: "unavailable",
                                reviewedAt: new Date().toISOString(),
                                evidence: [],
                                questions: [],
                                riskFlags: [],
                                displayReview: [],
                                error: "No AI provider is configured.",
                            },
                        },
                    });
                    send({ type: "done" });
                    controller.close();
                    return;
                }

                const errors: string[] = [];

                for (const provider of providers) {
                    send({ type: "status", label: "AI review running", detail: provider.provider === "ollama-cloud" ? "Using GLM 5.2 reasoning" : "Using backup review model" });

                    try {
                        const upstream = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${provider.apiKey}`,
                            },
                            body: JSON.stringify({
                                model: provider.model,
                                messages: [
                                    {
                                        role: "system",
                                        content: "You are a strict public review-note and JSON extraction assistant for ANC Sports LED estimate intake. Return valid JSON in content. Put public reasoning notes in reasoning if supported.",
                                    },
                                    { role: "user", content: prompt },
                                ],
                                stream: true,
                                temperature: 0,
                                [provider.maxTokensKey]: 6000,
                            }),
                            signal: AbortSignal.timeout(120_000),
                        });

                        if (!upstream.ok) {
                            const errorText = await upstream.text().catch(() => "");
                            throw new Error(`${provider.provider} returned ${upstream.status}: ${errorText.slice(0, 220)}`);
                        }

                        const reader = upstream.body?.getReader();
                        if (!reader) throw new Error(`${provider.provider} returned no stream body`);

                        const decoder = new TextDecoder();
                        let buffer = "";
                        let content = "";
                        let reasoning = "";

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed || !trimmed.startsWith("data: ")) continue;

                                const payload = trimmed.slice(6);
                                if (payload === "[DONE]") continue;

                                try {
                                    const chunk = JSON.parse(payload);
                                    const delta = chunk.choices?.[0]?.delta || {};
                                    const reasoningDelta = delta.reasoning_content || delta.reasoning || delta.thinking || "";
                                    const contentDelta = delta.content || "";

                                    if (reasoningDelta) {
                                        reasoning += reasoningDelta;
                                        send({ type: "reasoning", markdown: reasoningDelta });
                                    }

                                    if (contentDelta) {
                                        content += contentDelta;
                                    }
                                } catch {
                                    // Skip malformed provider chunks.
                                }
                            }
                        }

                        reader.releaseLock();

                        const parsed = extractEmailReviewJson(content);
                        const review = normalizeEmailReview(parsed, provider);
                        review.reasoningMarkdown = review.reasoningMarkdown || reasoning || publicFallbackNotes(intake);
                        intake.aiReview = review;

                        send({ type: "review", intake });
                        send({ type: "done" });
                        controller.close();
                        return;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        errors.push(message);
                        log.warn(`[email-to-quote review-stream] ${provider.provider} failed: ${message}`);
                        send({ type: "status", label: "Retrying review", detail: message.slice(0, 120) });
                    }
                }

                intake.aiReview = {
                    status: "failed",
                    reviewedAt: new Date().toISOString(),
                    reasoningMarkdown: publicFallbackNotes(intake),
                    evidence: [],
                    questions: [],
                    riskFlags: [],
                    displayReview: [],
                    error: errors.join(" | "),
                };

                send({ type: "review", intake });
                send({ type: "done" });
                controller.close();
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        log.error("[email-to-quote review-stream] failed:", error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
