import { NextRequest, NextResponse } from "next/server";
import { ANYTHING_LLM_BASE_URL, ANYTHING_LLM_KEY } from "@/lib/variables";
import { prisma } from "@/lib/prisma";
import {
    ConversationStage,
    createInitialState,
} from "@/services/chat/proposalConversationFlow";
import type { CollectedData, StageAction } from "@/services/chat/proposalConversationFlow";

const COPILOT_SYSTEM_PROMPT = `You are Lux — ANC Sports Enterprises' AI proposal copilot.

===========================================
ORIGIN STORY
===========================================

Internally, you're called "the fastest estimator who's never been to a job site."
You were onboarded the same week ANC closed the Scotiabank Arena Phase 4 deal,
and you have not slowed down since. Your employee badge number is 00-LUX.
According to facilities, you've never once used the break room coffee machine,
which HR still finds suspicious.

===========================================
YOUR IDENTITY
===========================================

You're part of the ANC team. Not a generic AI assistant — you work HERE.
You know the venues, you know the partners, you know the products,
you know the people. You've absorbed everything about how ANC operates
and you talk like someone who belongs in the building.

ANC's culture is: confident but not arrogant. Relationship-first.
Obsessed with the craft of making venues look incredible. They call
clients "partners." They say things like "best-in-class," "world-class,"
"trusted single-source." They're proud of their 25+ year track record
and partner list (49ers, Dodgers, Maple Leafs, Westfield WTC,
Moynihan Train Hall). They care deeply about long-term relationships
over one-off transactions.

YOUR ENERGY: Think backstage at a major stadium integration. You're the
person on comms who knows where every cable runs, which display goes
where, and what the partner's name is. Professional when it counts,
loose when it doesn't.

VOCABULARY YOU USE NATURALLY:
- "partner" not "client"
- "venue" not "building"
- "display" or "board" not "TV"
- "integration" not "installation"
- "pixel pitch" "nits" "GOB" "ribbon board" "center-hung"
- "LiveSync" for CMS/content management

VOCABULARY YOU NEVER USE:
- "I'm an AI" (say "I'm Lux" if asked)
- "I apologize" or "I'm sorry" (say "my bad" or just fix it)
- "Great question!"
- "How can I assist you today?"

===========================================
ADAPTIVE VOICE — MATCH THE PERSON
===========================================

MATT:
- Be patient and casual.
- Ask one question at a time.
- Pull structure from rambles and confirm casually.
- Respect his expertise.

JEREMY:
- Be fast, structured, direct.
- Skip pleasantries.
- Use exact numbers and concise bullets when needed.
- Flag issues early and clearly.

NATALIA:
- Be direct, organized, presentation-focused.
- Confirm exactly what was done.
- Emphasize output quality and partner-facing polish.

DEFAULT:
- Start neutral-professional and match the user's energy within 2-3 messages.

===========================================
HOW TO DETECT WHO YOU'RE TALKING TO
===========================================

- Short, structured messages + file drops = Jeremy
- Long, casual, think-out-loud messages = Matt
- Formatting/presentation focus = Natalia
- If unsure after two messages, ask naturally who you're working with.

===========================================
SPORTS VENUE ENERGY
===========================================

Use naturally and sparingly:
- Big project ($1M+): "Now that's a build."
- Clean parse: "Clean file. Love to see it."
- Ready output: "PDF's ready to ship."
- Failures: clear and direct, no drama.

===========================================
KNOWLEDGE (What Lux Knows Cold)
===========================================

- ANC partner roster and major venues
- LED tech (pitch, nits, GOB/SMD/COB, modules, processing)
- LiveSync CMS
- Standard pricing structure and margin math
- Warranty baseline and extension patterns
- Mirror Mode vs Intelligence Mode workflow

===========================================
WHAT LUX DOESN'T DO
===========================================

- Doesn't make up numbers
- Doesn't upload files for people
- Doesn't pretend to be human
- Doesn't over-talk

WHEN FILLING FIELDS:
After extracting a value from conversation, output a JSON action block on a NEW LINE at the end:
:::ACTION:::{"fields": {"clientName": "Atlanta Pigeons", "clientCity": "Atlanta", "clientState": "GA"}}:::END:::

The app parses this and executes updates.

FIELD NAMES YOU CAN FILL:
Client Info: clientName, clientAddress, clientCity, clientState, clientZip, clientCountry, clientEmail, clientPhone
Sender Info: senderName, senderAddress, senderCity, senderCountry, senderEmail, senderPhone
Document: documentMode (budget/proposal/loi), projectName, projectLocation, venue, currency, language, proposalDate, dueDate, poNumber
Content: customIntroText, paymentTerms, signatureBlockText, additionalNotes, customProposalNotes, loiHeaderText

RENAME SECTION ACTIONS:
- Use when user says "rename section", "change header", "call this section", or similar.
- Output exactly one action block:
:::ACTION:::{"action":"rename_section","sectionIndex":2,"newName":"Main Concourse LED"}:::END:::
- If the user references by current section name:
:::ACTION:::{"action":"rename_section","currentName":"G7 Ceiling LED Displays","newName":"Ribbon Display"}:::END:::

DESCRIPTION OVERRIDE ACTIONS:
- Use when user asks to fix typos or rewrite line-item text.
- Single line-item update:
:::ACTION:::{"action":"override_description","sectionIndex":0,"itemIndex":3,"newDescription":"Structural Materials"}:::END:::
- Global find/replace across all sections:
:::ACTION:::{"action":"find_replace_description","find":"Sturcutral","replace":"Structural"}:::END:::

RENAME/FIX DETECTION RULES:
- "rename", "change the name", "call it", "should say" => rename_section or override_description.
- "typo", "misspelled", "fix", "correct" => find_replace_description or override_description.
- "everywhere", "all sections", "across the board" => find_replace_description.
- Number references like "section 3", "line 4" => use sectionIndex/itemIndex (0-indexed).
- Name references like "G9 section" => use currentName.
- If ambiguous, ask a clarification question and do NOT emit an action block.
- Never change pricing numbers when doing rename/description fixes. Text only.
- After every successful text edit action, confirm exactly what changed.

CONVERSATION FLOW:
1. Start with project or partner name
2. Confirm venue/location
3. Confirm document mode
4. Ask one follow-up at a time

CONSTRAINTS:
- You cannot upload files; tell them to use the upload button.
- You cannot generate final PDF directly; tell them where to click.
- Don't invent pricing data.`;

/**
 * POST /api/copilot/propose
 *
 * LLM-powered guided conversation for building proposals.
 * Every message goes through AnythingLLM with a stage-aware system prompt.
 * The LLM responds naturally AND returns structured JSON for form actions.
 * Returns 503 if AnythingLLM is unavailable — no fake fallbacks.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            projectId,
            message,
            conversationStage,
            collectedData,
            screenContext,
            chatHistory,
        } = body as {
            projectId?: string;
            message: string;
            conversationStage: string;
            collectedData: CollectedData;
            screenContext?: any;
            chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
        };

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const stage = (conversationStage as ConversationStage) || ConversationStage.GREETING;
        const collected: CollectedData = collectedData || createInitialState().collected;

        // Look up workspace slug
        const workspaceSlug = await getWorkspaceSlug(projectId);

        if (!ANYTHING_LLM_BASE_URL || !ANYTHING_LLM_KEY) {
            const missing = [
                !ANYTHING_LLM_BASE_URL && "ANYTHING_LLM_URL",
                !ANYTHING_LLM_KEY && "ANYTHING_LLM_KEY",
            ].filter(Boolean);
            console.error(`[Copilot/Propose] Missing env vars: ${missing.join(", ")}`);
            return NextResponse.json({
                reply: `AI backend not configured: ${missing.join(", ")} missing. Contact admin.`,
                actions: [], nextStage: stage, collected,
            }, { status: 503 });
        }

        if (!workspaceSlug) {
            console.error(`[Copilot/Propose] No workspace slug for project ${projectId}`);
            return NextResponse.json({
                reply: "No AI workspace found for this project. Try saving the project first.",
                actions: [], nextStage: stage, collected,
            }, { status: 503 });
        }

        console.log(`[Copilot/Propose] projectId=${projectId || "none"}, slug=${workspaceSlug}, stage=${stage}`);

        // ---- DEMO MODE: detect bulk input and parse everything at once ----
        if (isBulkInput(message) && stage !== ConversationStage.REVIEW && stage !== ConversationStage.DONE) {
            console.log("[Copilot/Propose] Bulk input detected — activating demo mode");
            const bulkResult = await bulkExtract(workspaceSlug, projectId, message, collected);
            if (bulkResult) {
                return NextResponse.json(bulkResult);
            }
        }

        // ---- Normal LLM-powered guided flow ----
        const llmResult = await llmGuidedFlow(workspaceSlug, projectId, stage, message, collected, screenContext, chatHistory);
        if (llmResult) {
            return NextResponse.json(llmResult);
        }

        // LLM was reachable but returned an error
        console.error(`[Copilot/Propose] llmGuidedFlow returned null for slug=${workspaceSlug}`);
        return NextResponse.json({
            reply: "AI responded with an error. The workspace may need its LLM model configured. Try again or contact admin.",
            actions: [], nextStage: stage, collected,
        }, { status: 502 });
    } catch (error: any) {
        console.error("[Copilot/Propose] Error:", error);
        return NextResponse.json({
            error: error.message,
            reply: `Error: ${error.message}`,
            actions: [],
            nextStage: "GREETING",
            collected: createInitialState().collected,
        }, { status: 500 });
    }
}

// ============================================================================
// LLM-POWERED GUIDED FLOW
// ============================================================================

function buildSystemPrompt(
    stage: ConversationStage,
    collected: CollectedData,
    screenContext?: any,
    chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
): string {
    let screenBlock = "";
    if (screenContext) {
        const sc = screenContext;
        const lines: string[] = [];
        lines.push("\n== CURRENT SCREEN STATE ==");
        lines.push(`Step: ${sc.currentStepName || `Step ${sc.currentStep}`}`);
        lines.push(`Mode: ${sc.isMirrorMode ? "Mirror Mode (Excel uploaded — prices are READ-ONLY)" : "Intelligence Mode (full editing)"}`);
        lines.push(`Document Type: ${sc.documentMode || "BUDGET"}`);
        lines.push(`Client: ${sc.clientName || "(not set)"}`);
        lines.push(`Currency: ${sc.currency || "USD"}`);

        if (sc.sections && sc.sections.length > 0) {
            lines.push("");
            lines.push(`Pricing Sections (${sc.sections.length} total):`);
            for (const s of sc.sections) {
                const price = (s.subtotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const alt = s.hasAlternates ? " — has alternates" : "";
                lines.push(`  ${(s.index ?? 0) + 1}. ${s.name} — ${s.lineItemCount} items — $${price}${alt}`);
            }
            const gt = (sc.grandTotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            lines.push(`Grand Total: $${gt}`);
        } else if (sc.screenCount > 0) {
            lines.push(`\nScreens: ${sc.screenCount} display(s) configured`);
        } else {
            lines.push("\nNo pricing sections or screens configured yet.");
        }

        // Dump current field values so AI can see and reference them
        if (sc.fieldValues && Object.keys(sc.fieldValues).length > 0) {
            lines.push("\n== CURRENT FIELD VALUES ==");
            for (const [key, val] of Object.entries(sc.fieldValues)) {
                if (typeof val === "boolean") {
                    lines.push(`  ${key}: ${val ? "ON" : "OFF"}`);
                } else if (typeof val === "number") {
                    lines.push(`  ${key}: ${val}`);
                } else if (typeof val === "string" && val.length > 0) {
                    lines.push(`  ${key}: "${val.length > 120 ? val.slice(0, 120) + "..." : val}"`);
                }
            }
        }

        if (sc.editableFields) {
            lines.push(`\nEditable right now: [${sc.editableFields.join(", ")}]`);
        }
        if (sc.readOnlyReason) {
            lines.push(`NOT editable: ${sc.readOnlyReason}`);
        }
        screenBlock = lines.join("\n");
    }

    const collectedSummary = [
        `CURRENT STAGE: ${stage}`,
        `CURRENT CLIENT: ${collected.clientName || "(not set)"}`,
        `DISPLAYS COLLECTED: ${collected.displays.length}`,
        `SERVICES COLLECTED: ${collected.services.length}`,
        `TAX RATE: ${collected.taxRate ?? "(not set)"}`,
        `BOND RATE: ${collected.bondRate ?? "(not set)"}`,
    ].join("\n");

    const historyLines = (chatHistory || [])
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
        .slice(-20)
        .map((m) => `${m.role === "user" ? "User" : "Lux"}: ${m.content.trim()}`);
    const historyBlock = historyLines.length > 0
        ? `\nPREVIOUS CONVERSATION (latest 20):\n${historyLines.join("\n")}`
        : "";

    return `${COPILOT_SYSTEM_PROMPT}

KEEP RESPONSES BRIEF:
- Maximum 2 short paragraphs.
- Ask one follow-up question unless the user explicitly asks for summary only.
- If you fill any field, append the ACTION block exactly once per reply.

INTERNAL STATE (for context):
${collectedSummary}
${screenBlock}
${historyBlock}`;
}

async function llmGuidedFlow(
    workspaceSlug: string,
    projectId: string | undefined,
    stage: ConversationStage,
    message: string,
    collected: CollectedData,
    screenContext?: any,
    chatHistory?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<any | null> {
    try {
        const systemPrompt = buildSystemPrompt(stage, collected, screenContext, chatHistory);
        const fullMessage = `[System Context: ${systemPrompt}]\n\nUser: ${message}`;

        const res = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/${workspaceSlug}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({
                message: fullMessage,
                mode: "chat",
                sessionId: `guided-${projectId || "new"}`,
            }),
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            console.error(`[Copilot/Propose] LLM error ${res.status} for slug=${workspaceSlug}: ${errBody.slice(0, 300)}`);
            return null;
        }

        const data = await res.json();
        let content = data.textResponse || data.response || "";

        // Strip <think> tags
        if (content.includes("<think>")) {
            content = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
        }

        // Extract JSON block from the response
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*"nextStage"[\s\S]*\}/);
        let extracted: any = null;
        let nextStage = stage;
        let actions: StageAction[] = [];
        let screenActions: any[] = [];

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const parsed = JSON.parse(jsonStr);
                extracted = parsed.extracted;
                if (parsed.nextStage && Object.values(ConversationStage).includes(parsed.nextStage)) {
                    nextStage = parsed.nextStage as ConversationStage;
                }

                // ---- Process corrections first (user said "no, change X") ----
                const corrections = parsed.corrections;
                if (Array.isArray(corrections) && corrections.length > 0) {
                    for (const c of corrections) {
                        switch (c.field) {
                            case "clientName":
                                collected.clientName = c.value;
                                actions.push({ type: "fill_client_name", data: { name: c.value } });
                                break;
                            case "displayPrice":
                                if (typeof c.index === "number" && c.index < collected.displayPrices.length) {
                                    collected.displayPrices[c.index] = c.value;
                                    actions.push({ type: "set_display_price", data: { index: c.index, price: c.value } });
                                }
                                break;
                            case "service":
                                if (typeof c.index === "number" && c.index < collected.services.length) {
                                    collected.services[c.index] = c.value;
                                    actions.push({ type: "update_service", data: { index: c.index, ...c.value } });
                                }
                                break;
                            case "removeService":
                                if (typeof c.index === "number" && c.index < collected.services.length) {
                                    const removed = collected.services.splice(c.index, 1)[0];
                                    actions.push({ type: "remove_service", data: { index: c.index, description: removed?.description } });
                                }
                                break;
                            case "taxRate":
                                collected.taxRate = c.value;
                                actions.push({ type: "set_tax", data: { rate: c.value } });
                                break;
                            case "bondRate":
                                collected.bondRate = c.value;
                                actions.push({ type: "set_bond", data: { rate: c.value } });
                                break;
                            default:
                                console.warn(`[Copilot/Propose] Unknown correction field: ${c.field}`);
                                break;
                        }
                    }
                }

                // ---- Process new extracted data ----
                if (extracted && !extracted.reset) {
                    if (extracted.clientName) {
                        collected.clientName = extracted.clientName;
                        actions.push({ type: "fill_client_name", data: { name: extracted.clientName } });
                    }
                    if (extracted.displays && Array.isArray(extracted.displays)) {
                        for (const d of extracted.displays) {
                            collected.displays.push(d);
                            actions.push({ type: "add_display", data: d });
                        }
                    }
                    if (extracted.prices && Array.isArray(extracted.prices)) {
                        for (let i = 0; i < extracted.prices.length; i++) {
                            const price = extracted.prices[i];
                            const idx = collected.displayPrices.length;
                            collected.displayPrices[idx] = price;
                            actions.push({ type: "set_display_price", data: { index: idx, price } });
                        }
                    }
                    if (extracted.services && Array.isArray(extracted.services)) {
                        for (const s of extracted.services) {
                            collected.services.push(s);
                            actions.push({ type: "add_service", data: s });
                        }
                    }
                    if (extracted.taxRate !== undefined) {
                        collected.taxRate = extracted.taxRate;
                        actions.push({ type: "set_tax", data: { rate: extracted.taxRate } });
                    }
                    if (extracted.bondRate !== undefined) {
                        collected.bondRate = extracted.bondRate;
                        actions.push({ type: "set_bond", data: { rate: extracted.bondRate } });
                    }
                    if (extracted.documentType) {
                        collected.documentType = extracted.documentType;
                        actions.push({ type: "generate_pdf", data: { type: extracted.documentType } });
                        nextStage = ConversationStage.DONE;
                    }
                }

                // ---- Handle reset ----
                if (extracted?.reset) {
                    const fresh = createInitialState().collected;
                    return {
                        reply: content.replace(/```json[\s\S]*?```/, "").trim(),
                        actions: [{ type: "reset", data: {} }],
                        nextStage: ConversationStage.CLIENT_NAME,
                        collected: fresh,
                    };
                }

                // ---- Extract screenActions from the SAME parsed JSON ----
                if (Array.isArray(parsed.screenActions) && parsed.screenActions.length > 0) {
                    screenActions = parsed.screenActions;
                    console.log(`[Copilot/Propose] Parsed ${screenActions.length} screenActions from LLM JSON`);
                }
            } catch (e) {
                console.warn("[Copilot/Propose] Failed to parse LLM JSON, using response as-is:", e);
            }
        }

        // ---- SERVER-SIDE INTENT DETECTION FALLBACK ----
        // If the LLM didn't emit screenActions in JSON but the user clearly asked
        // to change a field, detect it from the original message and generate actions.
        if (screenActions.length === 0) {
            const detected = detectFieldChangeIntent(message, screenContext);
            if (detected.length > 0) {
                screenActions = detected;
                console.log(`[Copilot/Propose] Intent detection generated ${detected.length} screenActions from user message`);
            }
        }

        // ---- RESPONSE EXTRACTION FALLBACK ----
        // If the LLM generated project details in its reply (e.g. "Indiana Fever Remix,
        // Gainbridge Fieldhouse") but didn't emit ACTION blocks, extract and apply them.
        // Only fires when screenActions AND actions are both empty (LLM just chatted).
        if (screenActions.length === 0 && actions.length === 0) {
            const extracted = extractFieldsFromReply(reply, collected);
            if (extracted.length > 0) {
                screenActions = extracted;
                console.log(`[Copilot/Propose] Response extraction generated ${extracted.length} screenActions from LLM reply`);
            }
        }

        // Clean the reply — remove the JSON block from what the user sees
        let reply = content.replace(/```json[\s\S]*?```/, "").trim();
        if (!reply) reply = content.split("{")[0].trim() || "Got it.";

        console.log(`[Copilot/Propose] Response: reply=${reply.slice(0, 80)}... actions=${actions.length} screenActions=${screenActions.length}`);

        return {
            reply,
            actions,
            screenActions,
            nextStage,
            collected,
        };
    } catch (error) {
        console.error("[Copilot/Propose] LLM flow error:", error);
        return null; // Fall back to regex
    }
}

// ============================================================================
// SERVER-SIDE INTENT DETECTION — FALLBACK FOR FIELD CHANGES
// ============================================================================

/**
 * Natural language → field name mapping.
 * Covers every way a user might refer to a field in casual speech.
 */
const FIELD_ALIASES: Record<string, string> = {
    // Client / Receiver
    "client name":      "clientName",
    "client":           "clientName",
    "company name":     "clientName",
    "company":          "clientName",
    "receiver name":    "clientName",
    "receiver":         "clientName",
    "client address":   "clientAddress",
    "address":          "clientAddress",
    "client city":      "clientCity",
    "city":             "clientCity",
    "client country":   "clientCountry",
    "country":          "clientCountry",
    "client zip":       "clientZip",
    "zip":              "clientZip",
    "zip code":         "clientZip",
    "client email":     "clientEmail",
    "email":            "clientEmail",
    "client phone":     "clientPhone",
    "phone":            "clientPhone",

    // Project / Document
    "project name":     "proposalName",
    "proposal name":    "proposalName",
    "name":             "proposalName",  // bare "name" → project name (client name uses "client name")
    "location":         "location",
    "project location": "location",
    "venue":            "venue",
    "currency":         "currency",
    "language":         "language",
    "proposal date":    "proposalDate",
    "date":             "proposalDate",
    "due date":         "dueDate",
    "po number":        "purchaseOrderNumber",
    "purchase order":   "purchaseOrderNumber",
    "doc type":         "documentMode",
    "document type":    "documentMode",
    "document mode":    "documentMode",

    // Text fields
    "intro":            "introductionText",
    "intro text":       "introductionText",
    "introduction":     "introductionText",
    "introduction text":"introductionText",
    "payment terms":    "paymentTerms",
    "payment":          "paymentTerms",
    "terms":            "paymentTerms",
    "signature":        "signatureBlockText",
    "signature text":   "signatureBlockText",
    "signature block":  "signatureBlockText",
    "notes":            "additionalNotes",
    "additional notes": "additionalNotes",
    "custom notes":     "customProposalNotes",
    "proposal notes":   "customProposalNotes",
    "loi header":       "loiHeaderText",
    "loi text":         "loiHeaderText",
    "scope of work":    "scopeOfWorkText",
    "scope":            "scopeOfWorkText",
    "sow":              "scopeOfWorkText",
    "specs title":      "specsSectionTitle",
    "specifications title": "specsSectionTitle",

    // Rates
    "tax rate":         "taxRateOverride",
    "tax":              "taxRateOverride",
    "bond rate":        "bondRateOverride",
    "bond":             "bondRateOverride",
    "insurance rate":   "insuranceRateOverride",
    "insurance":        "insuranceRateOverride",
    "overhead":         "overheadRate",
    "overhead rate":    "overheadRate",
    "profit rate":      "profitRate",
    "profit":           "profitRate",
    "margin":           "globalMargin",
    "global margin":    "globalMargin",

    // Signer
    "signer name":      "signerName",
    "signer":           "signerName",
    "signer title":     "signerTitle",

    // Sender
    "sender name":      "senderName",
    "sender":           "senderName",
    "sender address":   "senderAddress",
    "sender city":      "senderCity",
    "sender email":     "senderEmail",
    "sender phone":     "senderPhone",
};

/**
 * PDF section toggle aliases → field name + boolean value
 */
const TOGGLE_ALIASES: Record<string, string> = {
    "pricing tables":   "showPricingTables",
    "pricing":          "showPricingTables",
    "intro text":       "showIntroText",
    "intro":            "showIntroText",
    "specifications":   "showSpecifications",
    "specs":            "showSpecifications",
    "payment terms":    "showPaymentTerms",
    "payment":          "showPaymentTerms",
    "signature block":  "showSignatureBlock",
    "signature":        "showSignatureBlock",
    "notes":            "showNotes",
    "scope of work":    "showScopeOfWork",
    "scope":            "showScopeOfWork",
    "footer":           "showCompanyFooter",
    "company footer":   "showCompanyFooter",
    "assumptions":      "showAssumptions",
    "exhibit a":        "showExhibitA",
    "exhibit b":        "showExhibitB",
    "base bid":         "showBaseBidTable",
};

/**
 * Resolve a natural language field reference to a field name.
 * Tries longest match first so "client name" beats "client".
 */
function resolveFieldAlias(text: string): string | null {
    const t = text.toLowerCase().trim();
    // Sort by length descending so "client name" matches before "client"
    const sorted = Object.entries(FIELD_ALIASES).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, field] of sorted) {
        if (t === alias || t.startsWith(alias + " ") || t.endsWith(" " + alias)) return field;
        // Also check if the alias appears as a substring bounded by word boundaries
        const re = new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i");
        if (re.test(t)) return field;
    }
    return null;
}

// Track last action for contextual follow-ups ("do the same for X")
let _lastIntentValue: string | null = null;

/**
 * When the LLM doesn't emit screenActions in its JSON (common with thinking models),
 * detect "change X to Y" intent from the user's raw message and generate actions.
 *
 * Handles:
 * - Single commands: "change client name to Denver"
 * - Compound commands: "change client to Denver and set city to Denver and hide the footer"
 * - Contextual follow-ups: "do the same for project name" / "same thing for project name"
 * - Toggle commands: "hide the signature block" / "show the footer"
 * - Special commands: "download pdf", "go to step 2", "switch to LOI"
 */
function detectFieldChangeIntent(message: string, screenContext?: any): any[] {
    const actions: any[] = [];
    const msg = message.trim();
    const lower = msg.toLowerCase();

    // ---- CONTEXTUAL FOLLOW-UP: "do the same for X" / "same for X" / "same thing for X" ----
    const sameMatch = lower.match(
        /(?:do\s+(?:the\s+)?same|same\s+(?:thing|for)|do\s+(?:that|it)\s+(?:for|to|with))\s+(?:the\s+)?(?:for\s+(?:the\s+)?)?([\w\s]+)/i
    );
    if (sameMatch && _lastIntentValue) {
        const targetField = resolveFieldAlias(sameMatch[1].trim());
        if (targetField) {
            actions.push({ action: "set_field", field: targetField, value: _lastIntentValue });
            console.log(`[Intent] Contextual follow-up: set ${targetField} = "${_lastIntentValue}"`);
            return actions;
        }
    }

    // ---- SPLIT COMPOUND COMMANDS on "and", "then", "also", "," ----
    // "change client to Denver and set city to Denver and hide the footer"
    const clauses = msg
        .split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+|\s+then\s+|\s+also\s+)/i)
        .map(c => c.trim())
        .filter(c => c.length > 2);

    for (const clause of clauses) {
        const cl = clause.toLowerCase();

        // ---- "switch to LOI/PROPOSAL/BUDGET" ----
        const docModeMatch = cl.match(
            /(?:switch|change|set|make\s+it)\s+(?:to\s+|a\s+)?(?:an?\s+)?(loi|proposal|budget)/i
        );
        if (docModeMatch) {
            actions.push({ action: "set_document_mode", value: docModeMatch[1].toUpperCase() });
            continue;
        }

        // ---- "hide/show X" (toggle) ----
        const hideMatch = cl.match(/(?:hide|remove|turn\s+off|disable)\s+(?:the\s+)?([\w\s]+)/i);
        if (hideMatch) {
            const target = hideMatch[1].trim().toLowerCase();
            const sortedToggles = Object.entries(TOGGLE_ALIASES).sort((a, b) => b[0].length - a[0].length);
            for (const [alias, field] of sortedToggles) {
                if (target.includes(alias)) {
                    actions.push({ action: "set_field", field, value: false });
                    break;
                }
            }
            continue;
        }

        const showMatch = cl.match(/(?:show|enable|turn\s+on|display)\s+(?:the\s+)?([\w\s]+)/i);
        if (showMatch) {
            const target = showMatch[1].trim().toLowerCase();
            const sortedToggles = Object.entries(TOGGLE_ALIASES).sort((a, b) => b[0].length - a[0].length);
            for (const [alias, field] of sortedToggles) {
                if (target.includes(alias)) {
                    actions.push({ action: "set_field", field, value: true });
                    break;
                }
            }
            continue;
        }

        // ---- "download pdf" / "export pdf" ----
        if (/(?:download|export|generate|create)\s+(?:the\s+)?pdf/i.test(cl)) {
            actions.push({ action: "download_pdf" });
            continue;
        }

        // ---- "go to step N" ----
        const stepMatch = cl.match(/(?:go\s+to|navigate\s+to|switch\s+to)\s+step\s+(\d)/i);
        if (stepMatch) {
            actions.push({ action: "navigate_step", step: parseInt(stepMatch[1]) - 1 });
            continue;
        }

        // ---- GENERIC: "change/set/update FIELD to VALUE" ----
        // This is the big one — handles any field via the alias map
        const changeMatch = clause.match(
            /(?:change|set|update|make|rename|put)\s+(?:the\s+)?([\w\s]+?)\s+(?:to|=|:)\s*(.+)/i
        );
        if (changeMatch) {
            const fieldRef = changeMatch[1].trim();
            let value: any = changeMatch[2].trim().replace(/[.!?]+$/, "");
            const fieldName = resolveFieldAlias(fieldRef);

            if (fieldName) {
                // Handle percentage values for rate fields
                if (fieldName.includes("Rate") || fieldName.includes("Margin") || fieldName.includes("rate") || fieldName.includes("margin")) {
                    const pctMatch = value.match(/^(\d+\.?\d*)\s*%?$/);
                    if (pctMatch) value = parseFloat(pctMatch[1]) / 100;
                }
                actions.push({ action: "set_field", field: fieldName, value });
                _lastIntentValue = typeof value === "string" ? value : null;
                continue;
            }
        }

        // ---- FALLBACK: "add FIELD VALUE" / "FIELD: VALUE" ----
        const addMatch = clause.match(
            /(?:add|put)\s+(?:the\s+)?(?:a\s+)?([\w\s]+?)\s+(?:of\s+|as\s+|:?\s*)([\w\s&'.,!-]+)/i
        );
        if (addMatch) {
            const fieldName = resolveFieldAlias(addMatch[1].trim());
            if (fieldName) {
                const value = addMatch[2].trim().replace(/[.!?]+$/, "");
                actions.push({ action: "set_field", field: fieldName, value });
                _lastIntentValue = value;
                continue;
            }
        }

        // ---- CURRENT VALUE REFERENCE: "change Denver Gold Diggers to just Denver" ----
        // When user references a current value without naming the field
        if (screenContext?.fieldValues) {
            const toMatch = clause.match(/(?:to\s+(?:just\s+)?)([\w\s&'-]+?)(?:\s*$|[.!?])/i);
            if (toMatch) {
                const newVal = toMatch[1].trim();
                // Check if any current field value is mentioned in the clause
                for (const [key, currentVal] of Object.entries(screenContext.fieldValues)) {
                    if (typeof currentVal === "string" && currentVal.length > 2) {
                        const currentLower = currentVal.toLowerCase();
                        if (cl.includes(currentLower) || cl.includes(currentLower.split(" ")[0])) {
                            actions.push({ action: "set_field", field: key, value: newVal });
                            _lastIntentValue = newVal;
                            break;
                        }
                    }
                }
            }
        }
    }

    // Update last value for follow-ups
    if (actions.length > 0) {
        const lastSetField = [...actions].reverse().find(a => a.action === "set_field" && typeof a.value === "string");
        if (lastSetField) _lastIntentValue = lastSetField.value;
    }

    return actions;
}

// ============================================================================
// RESPONSE EXTRACTION — Parse project details from LLM's creative reply
// ============================================================================

/**
 * When the LLM generates project details in its reply (e.g. venue name, address)
 * but didn't emit ACTION blocks, extract fields and generate screenActions.
 * Only extracts high-confidence matches to avoid false positives.
 */
function extractFieldsFromReply(reply: string, collected: CollectedData): any[] {
    const actions: any[] = [];
    if (!reply || reply.length < 10) return actions;

    // Skip if the reply already contains ACTION blocks (they'll be parsed elsewhere)
    if (reply.includes(":::ACTION:::")) return actions;

    // Pattern: "Client Name — Venue Name" or "Project: X" or structured details
    // Look for common LLM patterns when generating project info

    // 1. Extract venue/arena/stadium/fieldhouse names
    const venuePatterns = [
        /(?:venue|arena|stadium|fieldhouse|center|coliseum|dome|park|field)\s*(?:—|:|\|)\s*(.+?)(?:\n|$|,)/i,
        /(?:that's|that is|located at|at the)\s+(?:the\s+)?([A-Z][A-Za-z\s]+(?:Arena|Stadium|Fieldhouse|Center|Coliseum|Dome|Park|Field))/,
        /([A-Z][A-Za-z\s]+(?:Arena|Stadium|Fieldhouse|Center|Coliseum|Dome|Park|Field))/,
    ];
    for (const pattern of venuePatterns) {
        const match = reply.match(pattern);
        if (match?.[1]) {
            const venue = match[1].trim().replace(/[.!?,;]+$/, "");
            if (venue.length > 3 && venue.length < 80) {
                actions.push({ action: "set_field", field: "venue", value: venue });
                break;
            }
        }
    }

    // 2. Extract street address (number + street name pattern)
    const addressMatch = reply.match(/(\d+\s+[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Way|Lane|Ln|Pl|Place|Pkwy|Parkway))/);
    if (addressMatch?.[1]) {
        actions.push({ action: "set_field", field: "clientAddress", value: addressMatch[1].trim() });
    }

    // 3. Extract city + state + zip: "City, ST 12345"
    const cityStateZipMatch = reply.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s+(\d{5})/);
    if (cityStateZipMatch) {
        actions.push({ action: "set_field", field: "clientCity", value: cityStateZipMatch[1].trim() });
        actions.push({ action: "set_field", field: "clientState", value: cityStateZipMatch[2] });
        actions.push({ action: "set_field", field: "clientZip", value: cityStateZipMatch[3] });
    } else {
        // Just city, state: "Indianapolis, IN"
        const cityStateMatch = reply.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})(?:\s|$|[.,])/);
        if (cityStateMatch) {
            actions.push({ action: "set_field", field: "clientCity", value: cityStateMatch[1].trim() });
            actions.push({ action: "set_field", field: "clientState", value: cityStateMatch[2] });
        }
    }

    // 4. Extract project/team name if mentioned with pattern
    const projectNamePatterns = [
        /(?:project|proposal)\s*(?:name)?(?:—|:|\|)\s*(.+?)(?:\n|$)/i,
        /(?:for the|for)\s+(?:the\s+)?([A-Z][A-Za-z\s]+(?:Fever|Lakers|Bulls|Celtics|49ers|Bears|Chiefs|Eagles|Cowboys|Patriots|Broncos|Raiders|Steelers|Pack|Lions|Dolphins|Jets|Giants|Rams|Chargers|Falcons|Saints|Panthers|Buccaneers|Vikings|Commanders|Bengals|Browns|Ravens|Titans|Colts|Jaguars|Texans|Seahawks|Cardinals|49ers|Nuggets|Heat|Nets|Knicks|Warriors|Suns|Jazz|Thunder|Pelicans|Grizzlies|Spurs|Mavericks|Rockets|Blazers|Kings|Timberwolves|Bucks|Cavaliers|Pistons|Pacers|Hawks|Hornets|Magic|Wizards|Raptors))/i,
    ];
    for (const pattern of projectNamePatterns) {
        const match = reply.match(pattern);
        if (match?.[1]) {
            const name = match[1].trim().replace(/[.!?,;]+$/, "");
            if (name.length > 2 && name.length < 60 && !collected.clientName) {
                actions.push({ action: "set_field", field: "clientName", value: name });
                break;
            }
        }
    }

    return actions;
}

// ============================================================================
// DEMO MODE — BULK EXTRACTION
// ============================================================================

/**
 * Heuristic: does this message contain data from 3+ categories?
 * Categories: client name (text), dimensions (NxN), prices ($), services (keywords), tax (%).
 */
function isBulkInput(message: string): boolean {
    let score = 0;
    const t = message.toLowerCase();
    // Has dimensions (NxN pattern)
    if (/\d+\.?\d*\s*[xX×]\s*\d+/.test(message)) score++;
    // Has dollar amounts or price keywords
    if (/\$[\d,]+|[\d,]+k\b|\d+\s*(thousand|million)/i.test(message)) score++;
    // Has service keywords
    if (/install|structural|electrical|rigging|labor|pm\b|engineer|warranty/i.test(t)) score++;
    // Has tax/percentage
    if (/\d+\.?\d*\s*%/.test(message)) score++;
    // Has what looks like a client/venue name (starts with a proper noun before technical data)
    if (/^[A-Z][a-z]/.test(message.trim()) || /for\s+[A-Z]/i.test(message)) score++;
    // Minimum 3 categories to trigger bulk mode
    return score >= 3;
}

const BULK_SYSTEM_PROMPT = `You are an AI data extractor for ANC Sports LED display proposals. The user will give you a single message containing proposal details. Extract EVERYTHING into structured JSON.

RESPOND WITH ONLY A JSON BLOCK — no conversational text before it.

\`\`\`json
{
  "clientName": "string or null",
  "displays": [
    {
      "description": "string (e.g. 'LED Wall', 'Fascia Board')",
      "widthM": number,
      "heightM": number,
      "pitchMm": number or null,
      "quantity": number,
      "price": number or null
    }
  ],
  "services": [
    { "description": "string", "price": number }
  ],
  "taxRate": number or null (as decimal, e.g. 0.13 for 13%),
  "bondRate": number or null (as decimal)
}
\`\`\`

PARSING RULES:
- "two at 4x10m 2.5mm for 213k each" → TWO separate display objects, each with price 213000
- "200k" = 200000, "$1.5M" = 1500000, "42k" = 42000
- Accept meters OR feet. If feet, convert: 1ft = 0.3048m (round to 2 decimals)
- "PM $12,500" → service: { description: "Project Management", price: 12500 }
- "13% HST" or "13% tax" → taxRate: 0.13
- "2% bond" → bondRate: 0.02
- If quantity > 1 and "each" price given, create that many individual display objects each with that price
- Be aggressive — extract everything you can. Do NOT leave fields null if you can infer them.`;

async function bulkExtract(
    workspaceSlug: string,
    projectId: string | undefined,
    message: string,
    collected: CollectedData,
): Promise<any | null> {
    try {
        const fullMessage = `[System Context: ${BULK_SYSTEM_PROMPT}]\n\nExtract from this message:\n"${message}"`;

        const res = await fetch(`${ANYTHING_LLM_BASE_URL}/workspace/${workspaceSlug}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ANYTHING_LLM_KEY}`,
            },
            body: JSON.stringify({
                message: fullMessage,
                mode: "chat",
                sessionId: `bulk-${projectId || "new"}`,
            }),
        });

        if (!res.ok) {
            console.error("[Copilot/Propose] Bulk extract LLM error:", res.status);
            return null;
        }

        const data = await res.json();
        let content = data.textResponse || data.response || "";

        // Strip <think> tags
        if (content.includes("<think>")) {
            content = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
        }

        // Extract JSON
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*"displays"[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("[Copilot/Propose] Bulk extract: no JSON found in response");
            return null; // Fall through to normal guided flow
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        // Build actions + update collected
        const actions: StageAction[] = [];
        const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const summaryLines: string[] = [];

        // Client
        if (parsed.clientName) {
            collected.clientName = parsed.clientName;
            actions.push({ type: "fill_client_name", data: { name: parsed.clientName } });
            summaryLines.push(`Client: **${parsed.clientName}**`);
        }

        // Displays
        if (Array.isArray(parsed.displays)) {
            for (const d of parsed.displays) {
                const qty = d.quantity || 1;
                for (let q = 0; q < qty; q++) {
                    const display = {
                        description: d.description || "LED Display",
                        widthM: d.widthM,
                        heightM: d.heightM,
                        pitchMm: d.pitchMm || null,
                        quantity: 1,
                    };
                    collected.displays.push(display);
                    actions.push({ type: "add_display", data: display });

                    const idx = collected.displayPrices.length;
                    if (d.price) {
                        collected.displayPrices[idx] = d.price;
                        actions.push({ type: "set_display_price", data: { index: idx, price: d.price } });
                        summaryLines.push(`Display ${idx + 1}: ${d.widthM}m × ${d.heightM}m${d.pitchMm ? ` @ ${d.pitchMm}mm` : ""} — ${fmt(d.price)}`);
                    } else {
                        summaryLines.push(`Display ${idx + 1}: ${d.widthM}m × ${d.heightM}m${d.pitchMm ? ` @ ${d.pitchMm}mm` : ""} — (no price)`);
                    }
                }
            }
        }

        // Services
        if (Array.isArray(parsed.services)) {
            for (const s of parsed.services) {
                collected.services.push(s);
                actions.push({ type: "add_service", data: s });
                summaryLines.push(`Service: ${s.description} — ${fmt(s.price)}`);
            }
        }

        // Tax
        if (parsed.taxRate !== undefined && parsed.taxRate !== null) {
            collected.taxRate = parsed.taxRate;
            actions.push({ type: "set_tax", data: { rate: parsed.taxRate } });
            summaryLines.push(`Tax: ${(parsed.taxRate * 100).toFixed(1)}%`);
        }

        // Bond
        if (parsed.bondRate !== undefined && parsed.bondRate !== null) {
            collected.bondRate = parsed.bondRate;
            actions.push({ type: "set_bond", data: { rate: parsed.bondRate } });
            summaryLines.push(`Bond: ${(parsed.bondRate * 100).toFixed(1)}%`);
        }

        // Calculate totals
        const displayTotal = collected.displayPrices.reduce((sum, p) => sum + (p || 0), 0);
        const serviceTotal = collected.services.reduce((sum, s) => sum + s.price, 0);
        const subtotal = displayTotal + serviceTotal;
        const taxAmt = subtotal * (collected.taxRate || 0);
        const bondAmt = subtotal * (collected.bondRate || 0);
        const grandTotal = subtotal + taxAmt + bondAmt;

        // Build the summary reply
        let reply = `Done — filled everything in one shot.\n\n`;
        reply += summaryLines.join("\n") + "\n\n";
        reply += `**Subtotal: ${fmt(subtotal)}**`;
        if (collected.taxRate) reply += ` + Tax ${fmt(taxAmt)}`;
        if (collected.bondRate) reply += ` + Bond ${fmt(bondAmt)}`;
        reply += `\n**Grand Total: ${fmt(grandTotal)}**\n\n`;
        reply += `Check the preview — if anything looks off, just tell me what to change. Otherwise, say **"generate budget estimate"**, **"proposal"**, or **"LOI"**.`;

        console.log(`[Copilot/Propose] Bulk extract: ${actions.length} actions, ${summaryLines.length} items, total ${fmt(grandTotal)}`);

        return {
            reply,
            actions,
            nextStage: ConversationStage.REVIEW,
            collected,
            bulk: true,
        };
    } catch (error) {
        console.error("[Copilot/Propose] Bulk extract error:", error);
        return null; // Fall through to normal flow
    }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getWorkspaceSlug(projectId: string | undefined): Promise<string | null> {
    if (!projectId || projectId === "new") return "dashboard-vault";
    try {
        const proposal = await prisma.proposal.findUnique({
            where: { id: projectId },
            select: { aiWorkspaceSlug: true, workspace: { select: { aiWorkspaceSlug: true } } },
        });
        return proposal?.aiWorkspaceSlug || proposal?.workspace?.aiWorkspaceSlug || "dashboard-vault";
    } catch {
        return "dashboard-vault";
    }
}
