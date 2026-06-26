import type { EmailQuoteAiReview, EmailQuoteIntake } from "./emailToQuoteIntake";

interface AiReviewInput {
    subject?: string;
    body: string;
    intake: EmailQuoteIntake;
}

interface ProviderConfig {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokensKey: "max_tokens" | "max_completion_tokens";
}

function configuredProviders(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    if (process.env.Z_AI_API_KEY) {
        providers.push({
            provider: "z-ai",
            baseUrl: process.env.Z_AI_BASE_URL || "https://api.z.ai/api/coding/paas/v4",
            apiKey: process.env.Z_AI_API_KEY,
            model: process.env.Z_AI_MODEL_NAME || "glm-5",
            maxTokensKey: "max_tokens",
        });
    }

    if (process.env.OPENAI_API_KEY) {
        providers.push({
            provider: "openai",
            baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
            maxTokensKey: "max_completion_tokens",
        });
    }

    return providers;
}

function emptyReview(status: EmailQuoteAiReview["status"], error?: string): EmailQuoteAiReview {
    return {
        status,
        reviewedAt: new Date().toISOString(),
        evidence: [],
        questions: [],
        riskFlags: [],
        displayReview: [],
        error,
    };
}

function extractJson(raw: string): unknown {
    const cleaned = raw.trim();
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : cleaned;

    try {
        return JSON.parse(candidate);
    } catch {
        const objectMatch = candidate.match(/\{[\s\S]*\}/);
        if (!objectMatch) throw new Error("AI response did not contain JSON");
        return JSON.parse(objectMatch[0]);
    }
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asConfidence(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function normalizePriority(value: unknown): "high" | "medium" | "low" {
    const raw = asString(value).toLowerCase();
    if (raw === "high" || raw === "low") return raw;
    return "medium";
}

function normalizeDisplayStatus(value: unknown): "confirmed" | "needs_review" | "inferred" {
    const raw = asString(value).toLowerCase();
    if (raw === "confirmed" || raw === "inferred") return raw;
    return "needs_review";
}

function normalizeReview(parsed: any, provider: ProviderConfig): EmailQuoteAiReview {
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const riskFlags = Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [];
    const displayReview = Array.isArray(parsed.displayReview) ? parsed.displayReview : [];

    return {
        status: "reviewed",
        provider: provider.provider,
        model: provider.model,
        reviewedAt: new Date().toISOString(),
        confidence: asConfidence(parsed.confidence),
        summary: asString(parsed.summary),
        evidence: evidence
            .map((item: any) => ({
                claim: asString(item.claim),
                sourceText: asString(item.sourceText),
                confidence: asConfidence(item.confidence),
            }))
            .filter((item: any) => item.claim && item.sourceText)
            .slice(0, 8),
        questions: questions
            .map((item: any) => ({
                question: asString(item.question),
                why: asString(item.why),
                priority: normalizePriority(item.priority),
            }))
            .filter((item: any) => item.question)
            .slice(0, 8),
        riskFlags: riskFlags.map(asString).filter(Boolean).slice(0, 8),
        displayReview: displayReview
            .map((item: any) => ({
                projectName: asString(item.projectName),
                displayName: asString(item.displayName),
                status: normalizeDisplayStatus(item.status),
                sourceText: asString(item.sourceText),
                note: asString(item.note),
            }))
            .filter((item: any) => item.projectName || item.displayName)
            .slice(0, 12),
    };
}

function buildPrompt(input: AiReviewInput): string {
    return `You are reviewing an inbound rough-estimate email for ANC Sports LED display estimating.

Your job is NOT to invent a quote. Your job is to verify what the parser extracted, identify what is directly supported by the email, and flag anything that needs human review.

Rules:
- Return only JSON. No markdown.
- Do not invent dimensions, pixel pitch, product vendor, pricing, or install assumptions.
- If a value is not explicitly in the email, mark it as missing or inferred.
- Use short sourceText snippets copied from the email for evidence.
- Be especially strict around "same size", "specs below", ribbons, quantities, and rough-estimate scope.
- Confidence must be 0 to 1.

Return this JSON shape:
{
  "summary": "one short sentence",
  "confidence": 0.82,
  "evidence": [
    { "claim": "Project 2 has two 60' x 60' boards", "sourceText": "Left Board = 60' x 60'...", "confidence": 0.98 }
  ],
  "questions": [
    { "question": "What are the existing plaza board dimensions for Gate F Quote #1?", "why": "The email says same size but does not provide dimensions.", "priority": "high" }
  ],
  "riskFlags": ["Gate F Quote #2 says specs below but no specs are included."],
  "displayReview": [
    { "projectName": "Exterior Suite Tower", "displayName": "Left Board", "status": "confirmed", "sourceText": "Left Board = 60' x 60'", "note": "Dimensions are explicit." }
  ]
}

Subject:
${input.subject || ""}

Email:
${input.body}

Parser output:
${JSON.stringify({
        title: input.intake.title,
        clientName: input.intake.clientName,
        venueName: input.intake.venueName,
        requesterName: input.intake.requesterName,
        requestedBreakdown: input.intake.requestedBreakdown,
        projects: input.intake.projects,
        missingAssumptions: input.intake.missingAssumptions,
        displays: input.intake.estimatorAnswers.displays.map((display) => ({
            displayName: display.displayName,
            displayType: display.displayType,
            quantity: display.quantity,
            widthFt: display.widthFt,
            heightFt: display.heightFt,
            pixelPitch: display.pixelPitch,
        })),
    }, null, 2)}`;
}

async function callProvider(provider: ProviderConfig, prompt: string): Promise<EmailQuoteAiReview> {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
                    content: "You are a strict structured-data reviewer for ANC Sports LED estimate intake. Return only valid JSON.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0,
            [provider.maxTokensKey]: 2500,
            ...(provider.provider === "openai" ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${provider.provider} returned ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
        throw new Error(`${provider.provider} returned no message content`);
    }

    return normalizeReview(extractJson(content), provider);
}

export async function reviewEmailToQuoteWithAi(input: AiReviewInput): Promise<EmailQuoteAiReview> {
    const providers = configuredProviders();
    if (providers.length === 0) {
        return emptyReview("unavailable", "No AI provider is configured.");
    }

    const prompt = buildPrompt(input);
    const errors: string[] = [];

    for (const provider of providers) {
        try {
            return await callProvider(provider, prompt);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    return emptyReview("failed", errors.join(" | "));
}
