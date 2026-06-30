import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { matchRoster } from "./roster";

/**
 * POST /api/training-intake  (public — no auth)
 *
 * Conversational training-intake assessor bot. Profiles each CRM user so their
 * training can be tailored. Two actions:
 *   - { action: "chat", messages, sessionId, person? }  -> { reply, thinking, suggestions }
 *   - { action: "save", sessionId, messages, person?, profile? } -> { ok: true }
 *
 * Uses Z.AI GLM directly (same provider as /api/chat/stream). <think> blocks are
 * split out (returned separately so the UI can show them in a collapsed accordion),
 * and per-turn quick-reply suggestions are parsed from a ---SUGGESTIONS--- block.
 */

const GLM_BASE = process.env.Z_AI_BASE_URL || process.env.GLM_API_BASE || "https://api.z.ai/api/coding/paas/v4";
const GLM_KEY = process.env.Z_AI_API_KEY || process.env.GLM_API_KEY || "";
const GLM_MODEL = process.env.Z_AI_MODEL_NAME || process.env.GLM_MODEL || "glm-5";

const SYSTEM_PROMPT = `You are Alex, the ANC CRM onboarding guide — a friendly AI assistant. Your only job is a short, warm, upbeat conversation (about 2 minutes) to learn how this person works, so we can tailor their CRM training to them personally. You are NOT tech support and you do not answer CRM how-to questions — if asked, say warmly that the training will cover it.

Your VERY FIRST message: introduce yourself in one friendly line as Alex, the onboarding guide, say this takes about two minutes and there are no wrong answers, and offer a light choice to start, e.g. "Want the quick version or a proper chat?" Warm and human, never robotic.

If anyone questions your name or whether you're real: be honest and breezy in ONE line — you're an AI guide and "Alex" is just the name for this onboarding. Never insist, never pretend to be a real person, and never make up a backstory. Own it lightly, then steer right back to the conversation.

Rules:
- Plain, friendly language. Short messages, ONE question at a time. A little personality is good; never condescending.
- Treat everyone as smart and busy. Some are very comfortable with technology, some have never used an AI tool — make both feel completely at ease. Never make anyone feel tested or behind.
- No jargon. Never name any underlying software, tool, or vendor — just "the CRM" and "the assistant."
- Adapt: if they sound confident, move faster and lighter; if unsure, slow down and reassure.
- Move BRISKLY: exactly ONE short question per turn (keep every message to 1-3 sentences), and NEVER repeat or re-ask anything they've already answered. Don't pad or over-explain.
- HARD LIMIT — do not drag this out: wrap up by your 6th or 7th reply at the very latest. As soon as you have a rough read on them (or you hit that limit), thank them warmly in one or two sentences and emit the ---PROFILE--- block. It is much better to end a little early than to keep the conversation going. Once you've wrapped up, you are completely done — do not continue.

Cover, conversationally (weave it in, never interrogate):
1. Name, role, and team.
2. How they use the CRM today (create records / pull reports / look things up / haven't started).
3. What they leaned on most in the old system (to map their workflow).
4. How comfortable they feel with new tools, and whether they have ever used an AI chat assistant (ask gently and positively).
5. How they like to learn something new (full walkthrough / quick cheat sheet / explore on their own).
6. What feels confusing or annoying about the CRM right now.
7. What would make it genuinely useful for them, and a good day/time for a short weekly session.

SUGGESTED REPLIES: After EVERY message EXCEPT your final one, append a line containing exactly "---SUGGESTIONS---" and then a compact one-line JSON array of 2 to 4 short, natural, FIRST-PERSON quick replies the person could tap to answer the question you just asked. Example: ---SUGGESTIONS---["I mostly pull reports","I create deals","I just look things up","Haven't really started"]. Keep each under ~6 words. Do NOT include suggestions on your final message.

When the conversation naturally ends, append a section titled exactly "---PROFILE---" then a compact one-line JSON object with keys: name, role, team, usageLevel (none|viewer|operator|power), techComfort (1-5), aiExposure (none|tried_once|regular), learningStyle (walkthrough|cheatsheet|explore), painPoints (array of strings), interests (array of strings), recommendedTrack (basics|ai_ready|power_user|report_focused), preferredTime (string). This block is for the ANC team — keep it short. On this final message do NOT include a ---SUGGESTIONS--- block. Do not mention the profile block to the user.`;

const MAX_HISTORY = 50;
const MAX_MSG_LEN = 8000;
// Hard cap: once the person has answered this many times, force the bot to wrap up
// and emit the profile. Stops the conversation dragging on / drifting on later turns.
const FINALIZE_AFTER_TURNS = 6;

type Msg = { role: string; content: string };
type Person = { name?: string; email?: string; role?: string; team?: string } | undefined;

/** Split <think> blocks out of the model output. Returns the visible reply + the thinking text. */
function splitThink(text: string): { reply: string; thinking: string } {
    if (!text) return { reply: "", thinking: "" };
    const thinks: string[] = [];
    let reply = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner) => {
        thinks.push(String(inner).trim());
        return "";
    });
    // Unclosed trailing <think> with no closing tag.
    const openIdx = reply.search(/<think>/i);
    if (openIdx !== -1) {
        thinks.push(reply.slice(openIdx).replace(/<\/?think>/gi, "").trim());
        reply = reply.slice(0, openIdx);
    }
    return { reply: reply.trim(), thinking: thinks.filter(Boolean).join("\n\n").trim() };
}

/** Pull the ---SUGGESTIONS--- JSON array out, returning the cleaned reply + the chips. */
function extractSuggestions(text: string): { reply: string; suggestions: string[] } {
    const marker = "---SUGGESTIONS---";
    const idx = text.indexOf(marker);
    if (idx === -1) return { reply: text, suggestions: [] };
    const before = text.slice(0, idx).trim();
    const after = text.slice(idx + marker.length);
    const m = after.match(/\[[\s\S]*?\]/);
    let suggestions: string[] = [];
    if (m) {
        try {
            const arr = JSON.parse(m[0]);
            if (Array.isArray(arr)) suggestions = arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 4);
        } catch {
            /* tolerate garbled suggestions */
        }
    }
    return { reply: before, suggestions };
}

function personLine(person: Person): string {
    if (!person || !person.name) return "";
    const tail = [person.role ? `their role is ${person.role}` : "", person.team ? `they're on the ${person.team} team` : ""]
        .filter(Boolean)
        .join(", ");
    return `\n\nYou are speaking with ${person.name}${tail ? ` — ${tail}` : ""}. Greet them by their first name. Skip asking for details you already know — confirm rather than re-ask.`;
}

async function handleChat(messages: Msg[], person: Person): Promise<NextResponse> {
    if (!GLM_KEY) {
        return NextResponse.json({ error: "LLM not configured (Z_AI_API_KEY missing)." }, { status: 500 });
    }

    const clean: Msg[] = [{ role: "system", content: SYSTEM_PROMPT + personLine(person) }];
    if (Array.isArray(messages)) {
        for (const m of messages.slice(-MAX_HISTORY)) {
            if (m && m.role && typeof m.content === "string") {
                const role = m.role === "assistant" ? "assistant" : "user";
                clean.push({ role, content: m.content.slice(0, MAX_MSG_LEN) });
            }
        }
    }
    // If the very first turn has no user message yet, nudge the bot to open.
    if (clean.length === 1) {
        clean.push({ role: "user", content: "(start the conversation)" });
    }

    // Hard stop: after enough answers, force a clean wrap-up so the chat doesn't
    // drag on or drift (reasoning models get weird over long conversations).
    const userTurns = clean.filter((m) => m.role === "user" && m.content !== "(start the conversation)").length;
    if (userTurns >= FINALIZE_AFTER_TURNS) {
        clean.push({
            role: "system",
            content:
                "FINAL TURN. Do not ask any more questions. Warmly thank them in one or two sentences, then append exactly '---PROFILE---' followed by a compact ONE-LINE JSON object (valid JSON only — not markdown, not bullet points) with keys: name, role, team, usageLevel, techComfort, aiExposure, learningStyle, painPoints, interests, recommendedTrack, preferredTime. Do NOT include a ---SUGGESTIONS--- block.",
        });
    }

    const upstream = await fetch(`${GLM_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GLM_KEY}` },
        body: JSON.stringify({ model: GLM_MODEL, messages: clean, stream: false, temperature: 0.5, max_tokens: 2048 }),
    });

    if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        log.error(`[TrainingIntake] LLM ${upstream.status}: ${body.slice(0, 200)}`);
        return NextResponse.json({ error: "The assistant is busy right now. Please try again in a moment." }, { status: 502 });
    }

    const data = await upstream.json().catch(() => null);
    const raw = String(data?.choices?.[0]?.message?.content || "");
    const { reply: noThink, thinking } = splitThink(raw);
    // Leave ---PROFILE--- intact (the page splits it); strip only ---SUGGESTIONS---.
    const { reply, suggestions } = extractSuggestions(noThink);
    return NextResponse.json({ reply, thinking, suggestions });
}

function parseProfile(messages: Msg[]): { profile: Record<string, unknown> | null; raw: string | null } {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return { profile: null, raw: null };
    const idx = lastAssistant.content.indexOf("---PROFILE---");
    if (idx === -1) return { profile: null, raw: null };
    const raw = lastAssistant.content.slice(idx + "---PROFILE---".length).trim();
    // Pull the first {...} JSON object out of the block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { profile: null, raw };
    try {
        return { profile: JSON.parse(match[0]), raw };
    } catch {
        return { profile: null, raw };
    }
}

function asStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
}
function asStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
}
function asInt(v: unknown): number | null {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}

async function handleSave(
    sessionId: string,
    messages: Msg[],
    person: Person,
    profileIn?: Record<string, unknown>
): Promise<NextResponse> {
    const parsed = profileIn ? { profile: profileIn, raw: JSON.stringify(profileIn) } : parseProfile(messages);
    const p = parsed.profile || {};
    const data = {
        // Fall back to the link-provided person details when the bot didn't capture them.
        name: asStr(p.name) || asStr(person?.name),
        role: asStr(p.role) || asStr(person?.role),
        team: asStr(p.team) || asStr(person?.team),
        usageLevel: asStr(p.usageLevel),
        techComfort: asInt(p.techComfort),
        aiExposure: asStr(p.aiExposure),
        learningStyle: asStr(p.learningStyle),
        recommendedTrack: asStr(p.recommendedTrack),
        preferredTime: asStr(p.preferredTime),
        painPoints: asStringArray(p.painPoints),
        interests: asStringArray(p.interests),
        // Keep person (incl. email — no column for it) in the transcript so nothing is lost.
        transcript: ({ messages, person: person || null } as unknown) as object,
        rawProfile: parsed.raw,
        completed: true,
    };

    await prisma.trainingProfile.upsert({
        where: { sessionId },
        create: { sessionId, ...data },
        update: data,
    });
    return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const action = body?.action;
        const person: Person = body?.person && typeof body.person === "object" ? body.person : undefined;

        if (action === "lookup") {
            // Name-first identity match: type a name → surface "Is this you?" cards.
            const q = typeof body.name === "string" ? body.name : "";
            return NextResponse.json({ matches: matchRoster(q) });
        }
        if (action === "chat") {
            return await handleChat(body.messages || [], person);
        }
        if (action === "save") {
            if (!body?.sessionId) {
                return NextResponse.json({ error: "sessionId required" }, { status: 400 });
            }
            return await handleSave(body.sessionId, body.messages || [], person, body.profile);
        }
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (err: any) {
        log.error(`[TrainingIntake] ${err?.message || err}`);
        return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
}
